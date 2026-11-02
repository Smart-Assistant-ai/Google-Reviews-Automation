const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../../config/env');
const { STAR, HOTEL, SEED_REVIEWS, SIMULATED_POOL } = require('./mock.fixtures');

// A fake Google Business Profile that persists to a JSON file and mimics the
// v4 reviews API, including reply moderation (PENDING -> APPROVED/REJECTED).
const STORE_PATH = path.resolve(__dirname, '../../../.mockdata/gbp.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return { accounts: {} };
  }
}

function save(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

const daysAgo = (d) => new Date(Date.now() - d * 86400000 - Math.floor(Math.random() * 6) * 3600000).toISOString();

function buildReview(locationPath, r, createTime) {
  const reviewId = crypto.randomBytes(10).toString('hex');
  const review = {
    name: `${locationPath}/reviews/${reviewId}`,
    reviewId,
    reviewer: { displayName: r.name, profilePhotoUrl: null, isAnonymous: false },
    starRating: STAR[r.stars],
    createTime,
    updateTime: createTime,
  };
  if (r.text) review.comment = r.text;
  if (r.reply) {
    // Answered about five hours later, so the dashboard shows a realistic response time.
    const updateTime = new Date(new Date(createTime).getTime() + 5 * 3600000).toISOString();
    review.reviewReply = { comment: r.reply, updateTime, replyState: 'APPROVED' };
  }
  return review;
}

function accountKeyFor(connection) {
  return `accounts/mock-${connection.workspaceId.slice(0, 8)}`;
}

function ensureAccount(store, accountName) {
  if (store.accounts[accountName]) return store.accounts[accountName];
  const loc1 = `${accountName}/locations/1001`;
  store.accounts[accountName] = {
    accountName: HOTEL.group,
    locations: {
      [loc1]: {
        title: HOTEL.title,
        address: HOTEL.address,
        reviews: SEED_REVIEWS.map((r) => buildReview(loc1, r, daysAgo(r.days))),
      },
    },
  };
  return store.accounts[accountName];
}

// Pretend Google moderation: replies with promo content or contact details get rejected.
function moderationVerdict(comment) {
  if (/\b(discount|coupon|free (night|stay|breakfast|upgrade|parking))\b|\d+\s*% off/i.test(comment)) return 'PROMOTIONAL_CONTENT';
  if (/(\+?\d[\d\s-]{8,}\d)|https?:\/\//i.test(comment)) return 'CONTACT_INFORMATION';
  return null;
}

function resolveModeration(review) {
  const reply = review.reviewReply;
  if (!reply || reply.replyState !== 'PENDING' || !reply._moderateAt) return false;
  if (Date.now() < reply._moderateAt) return false;
  const violation = moderationVerdict(reply.comment);
  reply.replyState = violation ? 'REJECTED' : 'APPROVED';
  if (violation) reply.policyViolation = violation;
  delete reply._moderateAt;
  return true;
}

function findReview(store, reviewName) {
  const locationPath = reviewName.split('/reviews/')[0];
  const accountName = locationPath.split('/locations/')[0];
  const location = store.accounts[accountName]?.locations[locationPath];
  return location?.reviews.find((r) => r.name === reviewName);
}

const publicReview = (r) => {
  if (!r.reviewReply) return r;
  const { _moderateAt, ...reviewReply } = r.reviewReply;
  return { ...r, reviewReply };
};

module.exports = {
  kind: 'mock',

  getAuthUrl(state) {
    return `${env.frontendUrl}/mock-google-consent?state=${encodeURIComponent(state)}`;
  },

  async exchangeCode() {
    return {
      accessToken: `mock-access-${crypto.randomBytes(8).toString('hex')}`,
      refreshToken: `mock-refresh-${crypto.randomBytes(8).toString('hex')}`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      email: HOTEL.ownerEmail,
    };
  },

  async listAccounts(ctx) {
    const store = load();
    const name = accountKeyFor(ctx.connection);
    const account = ensureAccount(store, name);
    save(store);
    return { accounts: [{ name, accountName: account.accountName, type: 'LOCATION_GROUP' }] };
  },

  async listLocations(ctx, accountName) {
    const store = load();
    const account = ensureAccount(store, accountName);
    save(store);
    return {
      locations: Object.entries(account.locations).map(([locPath, l]) => ({
        name: `locations/${locPath.split('/locations/')[1]}`,
        title: l.title,
        storefrontAddress: { addressLines: [l.address] },
      })),
    };
  },

  async listReviews(ctx, accountName, locationName) {
    const store = load();
    const account = ensureAccount(store, accountName);
    const location = account.locations[`${accountName}/${locationName}`];
    if (!location) return { reviews: [], totalReviewCount: 0 };
    let changed = false;
    location.reviews.forEach((r) => { changed = resolveModeration(r) || changed; });
    if (changed) save(store);
    const reviews = [...location.reviews].sort((a, b) => b.createTime.localeCompare(a.createTime));
    const rated = reviews.map((r) => STAR.indexOf(r.starRating));
    return {
      reviews: reviews.map(publicReview),
      averageRating: rated.reduce((a, b) => a + b, 0) / (rated.length || 1),
      totalReviewCount: reviews.length,
    };
  },

  async getReview(ctx, reviewName) {
    const store = load();
    const review = findReview(store, reviewName);
    if (!review) throw Object.assign(new Error('Review not found'), { statusCode: 404 });
    if (resolveModeration(review)) save(store);
    return publicReview(review);
  },

  async updateReply(ctx, reviewName, comment) {
    const store = load();
    const review = findReview(store, reviewName);
    if (!review) throw Object.assign(new Error('Review not found'), { statusCode: 404 });
    review.reviewReply = {
      comment,
      updateTime: new Date().toISOString(),
      replyState: 'PENDING',
      _moderateAt: Date.now() + env.mockModerationSeconds * 1000,
    };
    save(store);
    return publicReview(review).reviewReply;
  },

  async deleteReply(ctx, reviewName) {
    const store = load();
    const review = findReview(store, reviewName);
    if (review) {
      delete review.reviewReply;
      save(store);
    }
  },

  // Dev-only: drop a new customer review into the fake Google profile.
  simulateNewReview(accountName, locationName, overrides = {}) {
    const store = load();
    const account = ensureAccount(store, accountName);
    const locPath = `${accountName}/${locationName}`;
    const location = account.locations[locPath];
    const pick = SIMULATED_POOL[Math.floor(Math.random() * SIMULATED_POOL.length)];
    const review = buildReview(locPath, { ...pick, ...overrides }, new Date().toISOString());
    location.reviews.push(review);
    save(store);
    return review;
  },
};
