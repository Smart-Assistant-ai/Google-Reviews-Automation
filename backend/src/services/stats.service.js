const { Op } = require('sequelize');
const { Review, Reply } = require('../models');
const { selectedLocation } = require('./review.service');

const DAY = 86400000;

function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);
const round = (n, p = 1) => (n === null ? null : Math.round(n * 10 ** p) / 10 ** p);

// POC computes from the reviews table; production reads the daily aggregates table (design §9).
async function overview(workspaceId, { days = 90 } = {}) {
  const location = await selectedLocation(workspaceId);
  const since = new Date(Date.now() - Number(days) * DAY);
  const reviews = await Review.findAll({
    where: { locationId: location.id, createTime: { [Op.gte]: since } },
    include: [Reply],
    order: [['create_time', 'ASC']],
  });
  const prevSince = new Date(since.getTime() - Number(days) * DAY);
  const previous = await Review.findAll({
    where: { locationId: location.id, createTime: { [Op.gte]: prevSince, [Op.lt]: since } },
    attributes: ['starRating'],
  });

  const replied = reviews.filter((r) => r.Reply && ['pending_google', 'live'].includes(r.Reply.state));
  const responseHours = replied
    .filter((r) => r.Reply.postedAt)
    .map((r) => (new Date(r.Reply.postedAt) - new Date(r.createTime)) / 3600000)
    .filter((h) => h >= 0);

  const weeks = {};
  for (const r of reviews) {
    const key = weekStart(r.createTime);
    weeks[key] = weeks[key] || { week: key, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, ratings: [] };
    weeks[key][r.starRating] += 1;
    weeks[key].ratings.push(r.starRating);
  }
  const weekly = Object.values(weeks).map(({ ratings, ...w }) => ({ ...w, avgRating: round(avg(ratings), 2), total: ratings.length }));

  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  const topics = {};
  for (const r of reviews) {
    if (r.sentiment) sentiment[r.sentiment] += 1;
    for (const t of r.topics || []) {
      topics[t] = topics[t] || { topic: t, positive: 0, negative: 0, neutral: 0 };
      topics[t][r.sentiment || 'neutral'] += 1;
    }
  }

  const avgRating = avg(reviews.map((r) => r.starRating));
  const prevAvg = avg(previous.map((r) => r.starRating));
  return {
    rangeDays: Number(days),
    kpis: {
      avgRating: round(avgRating, 2),
      avgRatingDelta: avgRating !== null && prevAvg !== null ? round(avgRating - prevAvg, 2) : null,
      totalReviews: reviews.length,
      previousTotal: previous.length,
      responseRate: reviews.length ? Math.round((replied.length / reviews.length) * 100) : null,
      avgResponseHours: round(avg(responseHours)),
      awaitingReply: reviews.filter((r) => !r.Reply || ['drafting', 'draft', 'failed', 'rejected'].includes(r.Reply.state)).length,
    },
    starDistribution: [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: reviews.filter((r) => r.starRating === s).length })),
    weekly,
    sentiment,
    topics: Object.values(topics).sort((a, b) => (b.positive + b.negative + b.neutral) - (a.positive + a.negative + a.neutral)).slice(0, 8),
  };
}

module.exports = { overview };
