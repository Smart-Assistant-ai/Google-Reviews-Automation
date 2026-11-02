const { Op } = require('sequelize');
const { Review, Reply, Location } = require('../models');
const { HttpError } = require('../utils/errors');

const BACKLOG_DAYS = 30;

// One status per review, derived from its reply, used for inbox tabs and chips.
function statusOf(review) {
  const reply = review.Reply;
  if (!reply) {
    const old = Date.now() - new Date(review.createTime).getTime() > BACKLOG_DAYS * 86400000;
    return old ? 'backlog' : 'needs_reply';
  }
  return {
    drafting: 'drafting', draft: 'draft', posting: 'posting',
    pending_google: 'pending', live: 'live', rejected: 'rejected', failed: 'failed',
  }[reply.state] || 'needs_reply';
}

const TABS = {
  todo: ['needs_reply', 'drafting', 'draft', 'rejected', 'failed'],
  posted: ['posting', 'pending', 'live'],
  backlog: ['backlog'],
};

function serialize(review) {
  const reply = review.Reply;
  return {
    id: review.id,
    reviewerName: review.reviewerName,
    reviewerPhotoUrl: review.reviewerPhotoUrl,
    starRating: review.starRating,
    comment: review.comment,
    media: review.media,
    createTime: review.createTime,
    language: review.language,
    sentiment: review.sentiment,
    topics: review.topics,
    status: statusOf(review),
    reply: reply ? {
      id: reply.id, text: reply.text, source: reply.source, state: reply.state,
      googleReplyState: reply.googleReplyState, policyViolation: reply.policyViolation, error: reply.error,
      postedAt: reply.postedAt,
    } : null,
  };
}

async function selectedLocation(workspaceId) {
  const location = await Location.findOne({ where: { workspaceId, isSelected: true } });
  if (!location) throw new HttpError(400, 'No location selected yet');
  return location;
}

async function list(workspaceId, { tab = 'todo', stars, q } = {}) {
  const location = await selectedLocation(workspaceId);
  const where = { locationId: location.id };
  if (stars) where.starRating = String(stars).split(',').map(Number);
  if (q) {
    where[Op.or] = [{ comment: { [Op.iLike]: `%${q}%` } }, { reviewerName: { [Op.iLike]: `%${q}%` } }];
  }
  const rows = await Review.findAll({ where, include: [Reply], order: [['create_time', 'DESC']] });
  const all = rows.map(serialize);
  const counts = Object.fromEntries(Object.entries(TABS).map(([k, s]) => [k, all.filter((r) => s.includes(r.status)).length]));
  counts.all = all.length;
  const reviews = tab === 'all' ? all : all.filter((r) => (TABS[tab] || TABS.todo).includes(r.status));
  return { reviews, counts };
}

async function get(workspaceId, reviewId) {
  const review = await Review.findByPk(reviewId, { include: [Reply, Location] });
  if (!review || review.Location.workspaceId !== workspaceId) throw new HttpError(404, 'Review not found');
  return serialize(review);
}

module.exports = { list, get, serialize, statusOf, selectedLocation };
