const { Location, Review, Reply } = require('../models');
const googleService = require('./google.service');
const { STAR_TO_NUMBER } = require('../providers/gbp');
const draftQueue = require('../jobs/draft.queue');

// Reviews older than this are shown in the Backlog and never auto-drafted (design §12.1).
const AUTO_DRAFT_WINDOW_DAYS = 30;

const GOOGLE_STATE_TO_LOCAL = { PENDING: 'pending_google', APPROVED: 'live', REJECTED: 'rejected' };

async function applyGoogleReply(review, googleReply) {
  const local = await Reply.findOne({ where: { reviewId: review.id } });
  const googleState = googleReply.replyState || 'APPROVED';
  const state = GOOGLE_STATE_TO_LOCAL[googleState] || 'live';

  if (!local) {
    return Reply.create({
      reviewId: review.id, text: googleReply.comment, source: 'google', state,
      googleReplyState: googleState, policyViolation: googleReply.policyViolation || null,
      postedAt: googleReply.updateTime,
    });
  }
  if (['pending_google', 'live', 'rejected'].includes(local.state)) {
    return local.update({ state, googleReplyState: googleState, policyViolation: googleReply.policyViolation || null });
  }
  return local;
}

async function syncLocation(locationId) {
  const location = await Location.findByPk(locationId);
  if (!location) return { fetched: 0, created: 0 };
  const { provider, ctx } = await googleService.getContext(location.workspaceId);
  const { reviews = [] } = await provider.listReviews(ctx, location.googleAccountName, location.googleLocationName);

  const cutoff = Date.now() - AUTO_DRAFT_WINDOW_DAYS * 86400000;
  let created = 0;
  for (const g of reviews) {
    const values = {
      locationId: location.id,
      reviewerName: g.reviewer?.isAnonymous ? 'Anonymous' : g.reviewer?.displayName,
      reviewerPhotoUrl: g.reviewer?.profilePhotoUrl || null,
      starRating: STAR_TO_NUMBER[g.starRating] || 0,
      comment: g.comment || null,
      media: g.reviewMediaItems || [],
      createTime: g.createTime,
      updateTime: g.updateTime,
      lastFetchedAt: new Date(),
    };
    let review = await Review.findOne({ where: { googleReviewName: g.name } });
    if (review) {
      await review.update(values);
    } else {
      review = await Review.create({ googleReviewName: g.name, ...values });
      created += 1;
    }

    if (g.reviewReply) {
      await applyGoogleReply(review, g.reviewReply);
    } else if (new Date(g.createTime).getTime() >= cutoff) {
      const local = await Reply.findOne({ where: { reviewId: review.id } });
      if (!local) {
        await Reply.create({ reviewId: review.id, source: 'ai', state: 'drafting' });
        draftQueue.push(review.id);
      }
    }
  }

  await location.update({ lastSyncedAt: new Date() });
  return { fetched: reviews.length, created };
}

async function syncWorkspace(workspaceId) {
  const location = await Location.findOne({ where: { workspaceId, isSelected: true } });
  if (!location) return { fetched: 0, created: 0 };
  return syncLocation(location.id);
}

module.exports = { syncLocation, syncWorkspace };
