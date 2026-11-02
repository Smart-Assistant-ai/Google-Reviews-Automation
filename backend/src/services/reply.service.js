const { Reply, Review, Location, GoogleConnection, AuditLog } = require('../models');
const googleService = require('./google.service');
const draftService = require('./draft.service');
const { HttpError } = require('../utils/errors');
const { byteLength, GOOGLE_REPLY_MAX_BYTES } = require('../utils/bytes');

async function loadReview(workspaceId, reviewId) {
  const review = await Review.findByPk(reviewId, { include: [Location, Reply] });
  if (!review || review.Location.workspaceId !== workspaceId) throw new HttpError(404, 'Review not found');
  return review;
}

function validateText(text) {
  if (!text || !text.trim()) throw new HttpError(400, 'Reply cannot be empty');
  if (byteLength(text) > GOOGLE_REPLY_MAX_BYTES) throw new HttpError(400, `Reply is over Google's ${GOOGLE_REPLY_MAX_BYTES}-byte limit`);
}

// Owner edits a draft.
async function saveDraft(workspaceId, userId, reviewId, text) {
  const review = await loadReview(workspaceId, reviewId);
  const values = { text, source: 'human', state: 'draft', error: null };
  const reply = review.Reply ? await review.Reply.update(values) : await Reply.create({ reviewId, ...values });
  await AuditLog.create({ workspaceId, userId, reviewId, action: 'reply.edited' });
  return reply;
}

async function regenerate(workspaceId, userId, reviewId, instructions) {
  const review = await loadReview(workspaceId, reviewId);
  if (review.Reply && ['pending_google', 'live'].includes(review.Reply.state)) {
    // Re-drafting a posted reply starts a fresh draft that overwrites it when posted.
    await review.Reply.update({ state: 'draft' });
  } else if (review.Reply) {
    await review.Reply.update({ state: 'drafting' });
  } else {
    await Reply.create({ reviewId, source: 'ai', state: 'drafting' });
  }
  await AuditLog.create({ workspaceId, userId, reviewId, action: 'reply.regenerated', meta: { instructions } });
  return draftService.draftForReview(reviewId, { instructions });
}

async function postReply(replyId, { userId = null } = {}) {
  const reply = await Reply.findByPk(replyId, { include: [{ model: Review, include: [Location] }] });
  if (!reply) throw new HttpError(404, 'Reply not found');
  validateText(reply.text);
  const { workspaceId } = reply.Review.Location;

  await reply.update({ state: 'posting' });
  try {
    const { provider, ctx } = await googleService.getContext(workspaceId);
    const result = await provider.updateReply(ctx, reply.Review.googleReviewName, reply.text);
    await reply.update({
      state: 'pending_google',
      googleReplyState: result?.replyState || 'PENDING',
      postedAt: new Date(),
      postedBy: userId,
      error: null,
      policyViolation: null,
    });
    await AuditLog.create({ workspaceId, userId, reviewId: reply.reviewId, action: 'reply.posted' });
  } catch (err) {
    await reply.update({ state: 'failed', error: err.message });
    if (err.statusCode === 401) {
      await GoogleConnection.update({ status: 'needs_reconnect' }, { where: { workspaceId } });
    }
    throw new HttpError(502, `Google rejected the request: ${err.message}`);
  }
  return reply;
}

async function postNow(workspaceId, userId, reviewId, text) {
  const review = await loadReview(workspaceId, reviewId);
  if (text !== undefined) {
    validateText(text);
    const edited = review.Reply && review.Reply.text !== text;
    if (review.Reply) {
      await review.Reply.update({ text, ...(edited ? { source: 'human' } : {}) });
    } else {
      await Reply.create({ reviewId, text, source: 'human', state: 'draft' });
    }
  }
  const reply = await Reply.findOne({ where: { reviewId } });
  return postReply(reply.id, { userId });
}

async function deleteReply(workspaceId, userId, reviewId) {
  const review = await loadReview(workspaceId, reviewId);
  if (review.Reply && ['pending_google', 'live', 'rejected'].includes(review.Reply.state)) {
    const { provider, ctx } = await googleService.getContext(workspaceId);
    await provider.deleteReply(ctx, review.googleReviewName);
  }
  if (review.Reply) await review.Reply.destroy();
  await AuditLog.create({ workspaceId, userId, reviewId, action: 'reply.deleted' });
}

// Picks up Google's moderation verdict for replies that were just posted.
async function refreshPending() {
  const pending = await Reply.findAll({ where: { state: 'pending_google' }, include: [{ model: Review, include: [Location] }] });
  for (const reply of pending) {
    try {
      const { provider, ctx } = await googleService.getContext(reply.Review.Location.workspaceId);
      const review = await provider.getReview(ctx, reply.Review.googleReviewName);
      const g = review.reviewReply;
      if (!g || g.replyState === 'PENDING') continue;
      await reply.update({
        state: g.replyState === 'REJECTED' ? 'rejected' : 'live',
        googleReplyState: g.replyState || 'APPROVED',
        policyViolation: g.policyViolation || null,
      });
    } catch (err) {
      console.warn('[refresh-pending]', reply.id, err.message);
    }
  }
}

module.exports = { saveDraft, regenerate, postNow, postReply, deleteReply, refreshPending };
