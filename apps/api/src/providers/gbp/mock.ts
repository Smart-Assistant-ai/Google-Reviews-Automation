import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { env } from '../../config';
import { SAMPLE_BUSINESS, SEED_REVIEWS, SIMULATED_POOL, STAR, type SeedReview } from './fixtures';
import {
  GoogleApiError,
  type GbpContext,
  type GbpProvider,
  type GbpReply,
  type GbpReview,
} from './types';

// A fake Google Business Profile shaped like the real API, including reply moderation, so the whole
// product works before Google approves access. It lives in memory, and in a file during development.
export type MockScenario = 'single' | 'multi' | 'groups' | 'none' | 'many';

type StoredReply = GbpReply & { moderateAt?: number };
type StoredReview = Omit<GbpReview, 'reviewReply'> & { reviewReply?: StoredReply };

interface MockLocation {
  title: string;
  address: string;
  seedOffset: number;
  removed?: boolean;
  reviews?: StoredReview[];
}
interface MockAccount {
  accountName: string;
  locations: Record<string, MockLocation>;
}
interface MockFailure {
  status: number;
  reason?: string;
  message?: string;
}

interface MockUser {
  reviewError?: MockFailure | null;
  scenario: MockScenario;
  accounts: string[];
  sharedAccounts: string[];
  readError: number | null;
}
interface Store {
  users: Record<string, MockUser>;
  accounts: Record<string, MockAccount>;
}

const STORE_PATH = resolve('.mockdata/gbp.json');
const persists = env.NODE_ENV === 'development';
const PAGE_SIZE = 100;
const REVIEW_PAGE_SIZE = 50;

function load(): Store {
  if (persists) {
    try {
      return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Store;
    } catch {
      // No file yet.
    }
  }
  return { users: {}, accounts: {} };
}

let store = load();

function save(): void {
  if (!persists) return;
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

const shortHash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 10);
const googleUserIdFor = (email: string) => `mock-${shortHash(email)}`;

function buildAccount(userId: string, index: number, locationCount: number): string {
  const name = `accounts/${userId}-${index}`;
  const locations: Record<string, MockLocation> = {};
  for (let i = 0; i < locationCount; i += 1) {
    const branch = SAMPLE_BUSINESS.branches[i % SAMPLE_BUSINESS.branches.length];
    const title =
      locationCount === 1
        ? SAMPLE_BUSINESS.title
        : `${SAMPLE_BUSINESS.title} ${branch}${i >= SAMPLE_BUSINESS.branches.length ? ` ${i + 1}` : ''}`;
    locations[`${name}/locations/${userId}-${index}-${1001 + i}`] = {
      title,
      address: SAMPLE_BUSINESS.address,
      seedOffset: index * 3 + i * 5,
    };
  }
  store.accounts[name] = {
    accountName: index === 0 ? SAMPLE_BUSINESS.group : `${SAMPLE_BUSINESS.group} ${index + 1}`,
    locations,
  };
  return name;
}

const SCENARIOS: Record<MockScenario, number[]> = {
  single: [1],
  multi: [3],
  groups: [2, 2],
  none: [0],
  many: [120],
};

function ensureUser(userId: string, scenario: MockScenario = 'single'): MockUser {
  const existing = store.users[userId];
  if (existing && existing.accounts.length > 0) return existing;
  const accounts = SCENARIOS[scenario].map((count, index) => buildAccount(userId, index, count));
  const user: MockUser = {
    reviewError: existing?.reviewError ?? null,
    readError: existing?.readError ?? null,
    sharedAccounts: existing?.sharedAccounts ?? [],
    scenario,
    accounts,
  };
  store.users[userId] = user;
  return user;
}

const daysAgo = (days: number) =>
  new Date(
    Date.now() - days * 86_400_000 - Math.floor(Math.random() * 6) * 3_600_000,
  ).toISOString();

function buildReview(locationPath: string, seed: SeedReview, createTime: string): StoredReview {
  const reviewId = randomBytes(10).toString('hex');
  const review: StoredReview = {
    name: `${locationPath}/reviews/${reviewId}`,
    reviewId,
    reviewer: { displayName: seed.name, profilePhotoUrl: null, isAnonymous: false },
    starRating: STAR[seed.stars]!,
    createTime,
    updateTime: createTime,
  };
  if (seed.text) review.comment = seed.text;
  if (seed.reply) {
    // Answered about five hours later, so the dashboard shows a realistic response time.
    const updateTime = new Date(new Date(createTime).getTime() + 5 * 3_600_000).toISOString();
    review.reviewReply = { comment: seed.reply, updateTime, replyState: 'APPROVED' };
  }
  return review;
}

function reviewsOf(locationPath: string, location: MockLocation): StoredReview[] {
  if (!location.reviews) {
    const rotated = SEED_REVIEWS.map(
      (_, i) => SEED_REVIEWS[(i + location.seedOffset) % SEED_REVIEWS.length]!,
    );
    location.reviews = rotated
      .map((seed, i) => ({ seed, days: SEED_REVIEWS[i]!.days ?? 1 }))
      .map(({ seed, days }) => buildReview(locationPath, seed, daysAgo(days)));
  }
  return location.reviews;
}

function moderationVerdict(comment: string): string | null {
  if (/\b(discounts?|coupons?|vouchers?|promo codes?|free \w+)\b|\d+\s*% off/i.test(comment))
    return 'PROMOTIONAL_CONTENT';
  if (/(\+?\d[\d\s-]{8,}\d)|https?:\/\//i.test(comment)) return 'CONTACT_INFORMATION';
  return null;
}

function settle(review: StoredReview): void {
  const reply = review.reviewReply;
  if (
    !reply ||
    reply.replyState !== 'PENDING' ||
    reply.moderateAt === undefined ||
    Date.now() < reply.moderateAt
  )
    return;
  const violation = moderationVerdict(reply.comment);
  reply.replyState = violation ? 'REJECTED' : 'APPROVED';
  if (violation) reply.policyViolation = violation;
  delete reply.moderateAt;
  save();
}

const publicReview = (review: StoredReview): GbpReview => {
  if (!review.reviewReply) return review as GbpReview;
  const { moderateAt: _hidden, ...reply } = review.reviewReply;
  return { ...review, reviewReply: reply };
};

function assertReadable(ctx: GbpContext): void {
  // Sample data never reaches Google, so a block on the real account doesn't apply to it.
  if (ctx.connection.dataSource === 'sample') return;
  const status = store.users[ctx.connection.googleUserId]?.readError;
  if (status) throw new GoogleApiError(`Mock Google refused the read with ${status}`, status);
}

function findReview(reviewName: string): StoredReview {
  const locationPath = reviewName.split('/reviews/')[0]!;
  const accountName = locationPath.split('/locations/')[0]!;
  const location = store.accounts[accountName]?.locations[locationPath];
  const review = location && reviewsOf(locationPath, location).find((r) => r.name === reviewName);
  if (!review) throw new GoogleApiError('Review not found', 404);
  return review;
}

function page<T>(
  items: T[],
  size: number,
  pageToken?: string,
): { items: T[]; nextPageToken?: string } {
  const start = pageToken ? Number(pageToken) : 0;
  const end = start + size;
  return {
    items: items.slice(start, end),
    nextPageToken: end < items.length ? String(end) : undefined,
  };
}

export const mockGbpProvider: GbpProvider = {
  kind: 'mock',

  getAuthUrl(state) {
    return `${env.APP_URL}/mock-google?flow=connect&state=${encodeURIComponent(state)}`;
  },

  async exchangeCode(code) {
    const { scenario, email } = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as {
      scenario: MockScenario;
      email: string;
    };
    const googleUserId = googleUserIdFor(email);
    ensureUser(googleUserId, scenario);
    save();
    return {
      accessToken: `mock-access-${randomBytes(8).toString('hex')}`,
      refreshToken: `mock-refresh-${randomBytes(8).toString('hex')}`,
      expiresAt: new Date(Date.now() + 3_600_000),
      email,
      googleUserId,
    };
  },

  async refreshAccessToken() {
    return {
      accessToken: `mock-access-${randomBytes(8).toString('hex')}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    };
  },

  async revoke() {},

  async listAccounts(ctx, pageToken) {
    assertReadable(ctx);
    const user = ensureUser(ctx.connection.googleUserId);
    const names = [...user.accounts, ...user.sharedAccounts];
    const result = page(names, PAGE_SIZE, pageToken);
    save();
    return {
      accounts: result.items.map((name) => ({
        name,
        accountName: store.accounts[name]?.accountName,
      })),
      nextPageToken: result.nextPageToken,
    };
  },

  async listLocations(ctx, accountName, pageToken) {
    assertReadable(ctx);
    const entries = Object.entries(store.accounts[accountName]?.locations ?? {}).filter(
      ([, location]) => !location.removed,
    );
    const result = page(entries, PAGE_SIZE, pageToken);
    return {
      locations: result.items.map(([path, location]) => ({
        name: `locations/${path.split('/locations/')[1]}`,
        title: location.title,
        storefrontAddress: { addressLines: [location.address] },
      })),
      nextPageToken: result.nextPageToken,
    };
  },

  async listReviews(ctx, accountName, locationName, pageToken) {
    assertReadable(ctx);
    // Only reviews failing, like a project whose reviews API Google hasn't turned on yet.
    const reviewError = store.users[ctx.connection.googleUserId]?.reviewError;
    if (reviewError && ctx.connection.dataSource !== 'sample') {
      throw new GoogleApiError(
        reviewError.message ?? `Mock Google refused with ${reviewError.status}`,
        reviewError.status,
        undefined,
        reviewError.reason,
      );
    }
    const path = `${accountName}/${locationName}`;
    const location = store.accounts[accountName]?.locations[path];
    if (!location || location.removed) throw new GoogleApiError('Location not found', 404);
    const reviews = reviewsOf(path, location);
    reviews.forEach(settle);
    const sorted = [...reviews].sort((a, b) => b.createTime.localeCompare(a.createTime));
    const result = page(sorted, REVIEW_PAGE_SIZE, pageToken);
    save();
    return { reviews: result.items.map(publicReview), nextPageToken: result.nextPageToken };
  },

  async getReview(ctx, reviewName) {
    assertReadable(ctx);
    const review = findReview(reviewName);
    settle(review);
    return publicReview(review);
  },

  async updateReply(ctx, reviewName, comment) {
    assertReadable(ctx);
    const review = findReview(reviewName);
    review.reviewReply = {
      comment,
      updateTime: new Date().toISOString(),
      replyState: 'PENDING',
      moderateAt: Date.now() + env.MOCK_MODERATION_SECONDS * 1000,
    };
    save();
    return publicReview(review).reviewReply!;
  },

  async deleteReply(ctx, reviewName) {
    assertReadable(ctx);
    delete findReview(reviewName).reviewReply;
    save();
  },
};

// Controls for tests, plus the "simulate a new review" button in sample mode.
export const mockGbp = {
  reset() {
    store = { users: {}, accounts: {} };
  },
  simulateNewReview(
    accountName: string,
    locationName: string,
    overrides: Partial<SeedReview> = {},
  ): StoredReview {
    const path = `${accountName}/${locationName}`;
    const location = store.accounts[accountName]?.locations[path];
    if (!location) throw new GoogleApiError('Location not found', 404);
    const pick = SIMULATED_POOL[Math.floor(Math.random() * SIMULATED_POOL.length)]!;
    const review = buildReview(path, { ...pick, ...overrides }, new Date().toISOString());
    reviewsOf(path, location).push(review);
    save();
    return review;
  },
  removeReview(reviewName: string) {
    const path = reviewName.split('/reviews/')[0]!;
    const account = store.accounts[path.split('/locations/')[0]!];
    const location = account?.locations[path];
    if (location?.reviews) location.reviews = location.reviews.filter((r) => r.name !== reviewName);
  },
  clearReply(reviewName: string) {
    delete findReview(reviewName).reviewReply;
  },
  // Like the owner editing their reply directly on Google.
  editReplyOnGoogle(reviewName: string, comment: string) {
    const reply = findReview(reviewName).reviewReply;
    if (reply) reply.comment = comment;
  },
  failReviews(email: string, failure: MockFailure | null) {
    const userId = googleUserIdFor(email);
    const user = store.users[userId] ?? {
      scenario: 'single',
      accounts: [],
      sharedAccounts: [],
      readError: null,
    };
    store.users[userId] = { ...user, reviewError: failure };
  },
  failReads(email: string, status: number | null) {
    const userId = googleUserIdFor(email);
    const user = store.users[userId] ?? {
      scenario: 'single',
      accounts: [],
      sharedAccounts: [],
      readError: null,
    };
    store.users[userId] = { ...user, readError: status };
  },
  addLocation(email: string, title: string) {
    const user = ensureUser(googleUserIdFor(email));
    const accountName = user.accounts[0]!;
    const account = store.accounts[accountName]!;
    const id = `${googleUserIdFor(email)}-added-${Object.keys(account.locations).length + 1}`;
    account.locations[`${accountName}/locations/${id}`] = {
      title,
      address: SAMPLE_BUSINESS.address,
      seedOffset: 2,
    };
  },
  removeLocations(email: string) {
    for (const name of ensureUser(googleUserIdFor(email)).accounts) {
      for (const location of Object.values(store.accounts[name]!.locations))
        location.removed = true;
    }
  },
  restoreLocations(email: string) {
    for (const name of ensureUser(googleUserIdFor(email)).accounts) {
      for (const location of Object.values(store.accounts[name]!.locations))
        location.removed = false;
    }
  },
  shareLocation(fromEmail: string, toEmail: string) {
    const from = ensureUser(googleUserIdFor(fromEmail));
    const to = ensureUser(googleUserIdFor(toEmail));
    to.sharedAccounts = [...new Set([...to.sharedAccounts, ...from.accounts])];
  },
};
