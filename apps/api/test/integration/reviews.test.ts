import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config';
import { prisma } from '../../src/lib/prisma';
import { runDraftQueue, checkPendingReplies } from '../../src/modules/reviews/jobs';
import { purgeExpiredContent } from '../../src/modules/reviews/purge.service';
import { sentEmails } from '../../src/providers/email/mock';
import { mockGbp } from '../../src/providers/gbp/mock';
import { signup, testApp, tokenFromEmail, uniqueEmail, type TestUser } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { connectGoogle, googleStatus, selectLocations, verifyEmail } from '../helpers/google';

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  mockGbp.reset();
  sentEmails.length = 0;
  env.SIGNUP_MODE = 'open';
  env.GOOGLE_POSTING_ENABLED = false;
});

const req = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  user: TestUser,
  path: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1/workspaces/${user.workspaceId}${path}`,
    headers: user.headers,
    payload,
  });

async function ownerWithReviews(scenario: 'single' | 'multi' = 'single'): Promise<TestUser> {
  const user = await signup(app);
  await verifyEmail(app, user);
  await connectGoogle(app, user, { scenario, email: `${user.id}@sample.test` });
  if (scenario === 'multi') {
    const { locations } = await googleStatus(app, user);
    await selectLocations(
      app,
      user,
      locations.map((l) => l.id),
    );
  }
  return user;
}

async function inviteMember(owner: TestUser, options: object = {}) {
  const email = uniqueEmail('member');
  await app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${owner.workspaceId}/invitations`,
    headers: owner.headers,
    payload: { email, ...options },
  });
  const member = await signup(app, { email, inviteToken: tokenFromEmail(email, '/invite') });
  return { ...member, workspaceId: owner.workspaceId };
}

const list = async (user: TestUser, query = '') =>
  (await req('GET', user, `/reviews${query}`)).json();
const firstReview = (user: TestUser) =>
  prisma.review.findFirstOrThrow({
    where: { workspaceId: user.workspaceId },
    orderBy: { createTime: 'desc' },
  });

describe('inbox', () => {
  it('lists reviews in pages, with counts that do not change with the page', async () => {
    const user = await ownerWithReviews();
    const page1 = await list(user, '?tab=all&pageSize=5');
    expect(page1.reviews).toHaveLength(5);
    expect(page1.total).toBeGreaterThan(5);
    expect(page1.counts.all).toBe(page1.total);
    const page2 = await list(user, '?tab=all&pageSize=5&page=2');
    expect(page2.reviews[0].id).not.toBe(page1.reviews[0].id);
    expect(page2.counts).toEqual(page1.counts);
  });

  it('sorts tabs: recent unreplied in to-do, old ones in backlog, answered in posted', async () => {
    const user = await ownerWithReviews();
    const { counts } = await list(user, '?tab=all');
    expect(counts.todo + counts.posted + counts.backlog).toBe(counts.all);
    expect(counts.todo).toBeGreaterThan(0);
    expect(counts.posted).toBeGreaterThan(0);
    expect(counts.backlog).toBeGreaterThan(0);
    const backlog = await list(user, '?tab=backlog');
    expect(backlog.reviews.every((r: { status: string }) => r.status === 'backlog')).toBe(true);
  });

  it('filters by stars and by search text', async () => {
    const user = await ownerWithReviews();
    const ones = await list(user, '?tab=all&stars=1');
    expect(ones.reviews.length).toBeGreaterThan(0);
    expect(ones.reviews.every((r: { starRating: number }) => r.starRating === 1)).toBe(true);
    const found = await list(user, '?tab=all&q=sullivan');
    expect(found.reviews.map((r: { reviewerName: string }) => r.reviewerName)).toEqual([
      'Megan Sullivan',
    ]);
  });

  it('shows every location together, or one at a time', async () => {
    const user = await ownerWithReviews('multi');
    const { locations } = await googleStatus(app, user);
    const all = await list(user, '?tab=all&pageSize=100');
    const one = await list(user, `?tab=all&pageSize=100&locationId=${locations[0]!.id}`);
    expect(new Set(all.reviews.map((r: { location: { id: string } }) => r.location.id)).size).toBe(
      3,
    );
    expect(new Set(one.reviews.map((r: { location: { id: string } }) => r.location.id))).toEqual(
      new Set([locations[0]!.id]),
    );
  });
});

describe('who can see what', () => {
  it('another workspace gets 404 on a review, and cannot list it', async () => {
    const a = await ownerWithReviews();
    const b = await ownerWithReviews();
    const review = await firstReview(a);
    expect((await req('GET', b, `/reviews/${review.id}`)).statusCode).toBe(404);
    expect(
      (await req('PUT', b, `/reviews/${review.id}/reply`, { text: 'hacked' })).statusCode,
    ).toBe(404);
    expect(
      (await req('POST', b, `/reviews/${review.id}/reply/post`, { text: 'hacked' })).statusCode,
    ).toBe(404);
    expect((await req('DELETE', b, `/reviews/${review.id}/reply`)).statusCode).toBe(404);
    const { reviews } = await list(b, '?tab=all&pageSize=100');
    expect(reviews.map((r: { id: string }) => r.id)).not.toContain(review.id);
  });

  it('a location id from another workspace returns nothing rather than its reviews', async () => {
    const a = await ownerWithReviews();
    const b = await ownerWithReviews();
    const [location] = (await googleStatus(app, a)).locations;
    expect((await req('GET', b, `/reviews?locationId=${location!.id}`)).statusCode).toBe(404);
    expect((await req('GET', b, `/stats?locationId=${location!.id}`)).statusCode).toBe(404);
  });

  it('a location-limited member only reaches their own location, everywhere', async () => {
    const owner = await ownerWithReviews('multi');
    const { locations } = await googleStatus(app, owner);
    const [mine, other] = locations;
    const member = await inviteMember(owner, { scopeAllLocations: false, locationIds: [mine!.id] });

    const { reviews, counts } = await list(member, '?tab=all&pageSize=100');
    expect(new Set(reviews.map((r: { location: { id: string } }) => r.location.id))).toEqual(
      new Set([mine!.id]),
    );
    expect(counts.all).toBe(reviews.length);

    const blocked = await prisma.review.findFirstOrThrow({ where: { locationId: other!.id } });
    expect((await req('GET', member, `/reviews/${blocked.id}`)).statusCode).toBe(404);
    expect(
      (await req('PUT', member, `/reviews/${blocked.id}/reply`, { text: 'x' })).statusCode,
    ).toBe(404);
    expect((await req('GET', member, `/reviews?locationId=${other!.id}`)).statusCode).toBe(404);
    expect((await req('GET', member, `/stats?locationId=${other!.id}`)).statusCode).toBe(404);
    expect((await req('GET', member, `/voice?locationId=${other!.id}`)).statusCode).toBe(404);

    const stats = (await req('GET', member, '/stats?days=365')).json();
    expect(stats.kpis.totalReviews).toBe(reviews.length);
  });

  it('access ends on the next request when a member is removed', async () => {
    const owner = await ownerWithReviews();
    const member = await inviteMember(owner);
    const review = await firstReview(owner);
    expect((await req('GET', member, `/reviews/${review.id}`)).statusCode).toBe(200);
    const row = await prisma.workspaceMember.findFirstOrThrow({ where: { userId: member.id } });
    await req('DELETE', owner, `/members/${row.id}`);
    expect((await req('GET', member, `/reviews/${review.id}`)).statusCode).toBe(404);
  });
});

describe('replies', () => {
  it("drafts appear for recent reviews, in the reviewer's language", async () => {
    const user = await ownerWithReviews();
    await runDraftQueue();
    const drafted = await prisma.reply.count({
      where: { workspaceId: user.workspaceId, state: 'draft', source: 'ai' },
    });
    expect(drafted).toBeGreaterThan(0);
    const spanish = await prisma.review.findFirstOrThrow({
      where: {
        workspaceId: user.workspaceId,
        language: 'es',
        createTime: { gte: new Date(Date.now() - 20 * 86_400_000) },
      },
      include: { reply: true },
    });
    expect(spanish.reply?.text).toMatch(/Gracias|Lo sentimos|Muchas/);
  });

  it("saves an edit as the owner's words", async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    const res = await req('PUT', user, `/reviews/${review.id}/reply`, {
      text: 'Thanks for telling us.',
    });
    expect(res.json().reply).toMatchObject({
      text: 'Thanks for telling us.',
      source: 'human',
      state: 'draft',
    });
  });

  it('posts through Google moderation: pending, then live', async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    const res = await req('POST', user, `/reviews/${review.id}/reply/post`, {
      text: 'Thank you for your feedback.',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('pending');
    await checkPendingReplies();
    expect((await req('GET', user, `/reviews/${review.id}`)).json().status).toBe('live');
  });

  it('shows Google rejecting a promotional reply, with the reason', async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    await req('POST', user, `/reviews/${review.id}/reply/post`, { text: 'Come back for 20% off!' });
    await checkPendingReplies();
    const after = (await req('GET', user, `/reviews/${review.id}`)).json();
    expect(after.status).toBe('rejected');
    expect(after.reply.policyViolation).toBe('PROMOTIONAL_CONTENT');
  });

  it('refuses posting nothing, or more than Google allows', async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    expect(
      (await req('POST', user, `/reviews/${review.id}/reply/post`, { text: '   ' })).statusCode,
    ).toBe(400);
    expect(
      (await req('POST', user, `/reviews/${review.id}/reply/post`, { text: 'é'.repeat(2100) }))
        .statusCode,
    ).toBe(400);
  });

  it('a double click cannot post twice: a reply already posting is refused', async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    await req('PUT', user, `/reviews/${review.id}/reply`, { text: 'Hello' });
    await prisma.reply.update({ where: { reviewId: review.id }, data: { state: 'posting' } });
    const res = await req('POST', user, `/reviews/${review.id}/reply/post`, {
      text: 'Hello again',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('reply_in_progress');
    const reply = await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } });
    expect(reply.text).toBe('Hello');
  });

  it("needs a verified email to post, because it is public under the business's name", async () => {
    const owner = await ownerWithReviews();
    const review = await firstReview(owner);
    await prisma.user.update({ where: { id: owner.id }, data: { emailVerifiedAt: null } });
    const res = await req('POST', owner, `/reviews/${review.id}/reply/post`, { text: 'Hi' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('email_not_verified');
  });

  it('refuses a real post outside production, but sample data still works', async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    const location = await prisma.location.findUniqueOrThrow({ where: { id: review.locationId } });
    await prisma.googleConnection.update({
      where: { id: location.connectionId },
      data: { provider: 'live' },
    });
    const refused = await req('POST', user, `/reviews/${review.id}/reply/post`, { text: 'Hello' });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('real_posting_disabled');
    const reply = await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } });
    expect(reply.state).not.toBe('pending_google');

    await prisma.googleConnection.update({
      where: { id: location.connectionId },
      data: { dataSource: 'sample' },
    });
    expect(
      (await req('POST', user, `/reviews/${review.id}/reply/post`, { text: 'Hello' })).statusCode,
    ).toBe(200);
  });

  it('allows 10 posts a minute per location, then refuses', async () => {
    const user = await signup(app);
    await verifyEmail(app, user);
    await connectGoogle(app, user, { email: `${user.id}@limit.test` });
    const reviews = await prisma.review.findMany({
      where: { workspaceId: user.workspaceId },
      take: 11,
    });
    const codes: number[] = [];
    for (const review of reviews)
      codes.push(
        (await req('POST', user, `/reviews/${review.id}/reply/post`, { text: 'Thanks' }))
          .statusCode,
      );
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('marks the connection for reconnecting when Google says the token is dead', async () => {
    const user = await signup(app);
    await verifyEmail(app, user);
    const email = `${user.id}@sample.test`;
    await connectGoogle(app, user, { email });
    const review = await firstReview(user);
    mockGbp.failReads(email, 401);
    const res = await req('POST', user, `/reviews/${review.id}/reply/post`, { text: 'Hi' });
    expect(res.statusCode).toBe(502);
    expect((await googleStatus(app, user)).connections[0]?.status).toBe('needs_reconnect');
    expect((await req('GET', user, `/reviews/${review.id}`)).json().status).toBe('failed');
  });

  it('deletes a reply, from Google too', async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    await req('POST', user, `/reviews/${review.id}/reply/post`, { text: 'Thanks' });
    expect((await req('DELETE', user, `/reviews/${review.id}/reply`)).statusCode).toBe(200);
    expect((await req('GET', user, `/reviews/${review.id}`)).json().reply).toBeNull();
  });

  it('regenerates a draft', async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    const res = await req('POST', user, `/reviews/${review.id}/reply/regenerate`, {
      instructions: 'Shorter',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reply.state).toBe('draft');
    expect(res.json().reply.text.length).toBeGreaterThan(0);
  });

  it("never overwrites an owner's draft during sync", async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    await req('PUT', user, `/reviews/${review.id}/reply`, { text: 'My words' });
    await req('POST', user, '/google/sync', {});
    expect((await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } })).text).toBe(
      'My words',
    );
  });

  it('writes who posted to the activity log', async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    await req('POST', user, `/reviews/${review.id}/reply/post`, { text: 'Thanks' });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, action: 'reply.posted' },
    });
    expect(row.actorUserId).toBe(user.id);
    expect(row.locationId).toBe(review.locationId);
  });
});

describe('sample review button', () => {
  it('adds a review to a sample location', async () => {
    const user = await ownerWithReviews();
    const [location] = (await googleStatus(app, user)).locations;
    const before = (await list(user, '?tab=all')).total;
    const res = await req('POST', user, '/dev/simulate-review', {
      locationId: location!.id,
      stars: 1,
      text: 'Too slow',
      name: 'Pat',
    });
    expect(res.statusCode).toBe(200);
    expect((await list(user, '?tab=all')).total).toBe(before + 1);
  });

  it('is refused on a real location', async () => {
    const user = await ownerWithReviews();
    const [location] = (await googleStatus(app, user)).locations;
    await prisma.googleConnection.update({
      where: { id: location!.connectionId },
      data: { provider: 'live' },
    });
    expect(
      (await req('POST', user, '/dev/simulate-review', { locationId: location!.id })).statusCode,
    ).toBe(404);
  });
});

describe('voice', () => {
  it('has sensible defaults, using the workspace name', async () => {
    const user = await signup(app, { businessName: 'Corner Shop' });
    const res = await req('GET', user, '/voice');
    expect(res.json().voice).toMatchObject({
      businessName: 'Corner Shop',
      tone: 'warm',
      languageMode: 'match',
    });
    expect(res.json().isOverride).toBe(false);
  });

  it('only admins can change the default', async () => {
    const owner = await ownerWithReviews();
    const member = await inviteMember(owner);
    expect((await req('PUT', member, '/voice', { tone: 'playful' })).statusCode).toBe(403);
    expect((await req('PUT', owner, '/voice', { tone: 'playful' })).json().voice.tone).toBe(
      'playful',
    );
  });

  it('a location can override the default, and go back to it', async () => {
    const user = await ownerWithReviews('multi');
    const [a, b] = (await googleStatus(app, user)).locations;
    await req('PUT', user, '/voice', { tone: 'professional', signOff: '– HQ' });
    await req('PUT', user, `/voice/locations/${a!.id}`, { tone: 'playful', signOff: '– Branch' });

    const overridden = (await req('GET', user, `/voice?locationId=${a!.id}`)).json();
    expect(overridden).toMatchObject({
      isOverride: true,
      voice: { tone: 'playful', signOff: '– Branch' },
    });
    const inherited = (await req('GET', user, `/voice?locationId=${b!.id}`)).json();
    expect(inherited).toMatchObject({
      isOverride: false,
      voice: { tone: 'professional', signOff: '– HQ' },
    });

    await req('DELETE', user, `/voice/locations/${a!.id}`);
    expect((await req('GET', user, `/voice?locationId=${a!.id}`)).json().isOverride).toBe(false);
  });

  it('a limited member can set the voice of their own location only', async () => {
    const owner = await ownerWithReviews('multi');
    const [mine, other] = (await googleStatus(app, owner)).locations;
    const member = await inviteMember(owner, { scopeAllLocations: false, locationIds: [mine!.id] });
    expect(
      (await req('PUT', member, `/voice/locations/${mine!.id}`, { tone: 'warm' })).statusCode,
    ).toBe(200);
    expect(
      (await req('PUT', member, `/voice/locations/${other!.id}`, { tone: 'warm' })).statusCode,
    ).toBe(404);
  });

  it('the database allows only one default per workspace', async () => {
    const user = await signup(app);
    await prisma.voiceProfile.create({ data: { workspaceId: user.workspaceId } });
    await expect(
      prisma.voiceProfile.create({ data: { workspaceId: user.workspaceId } }),
    ).rejects.toThrow();
  });

  it('drafts use the location voice', async () => {
    const user = await ownerWithReviews('multi');
    const [location] = (await googleStatus(app, user)).locations;
    await req('PUT', user, `/voice/locations/${location!.id}`, { signOff: '– Riverside team' });
    const review = await prisma.review.findFirstOrThrow({
      where: {
        locationId: location!.id,
        createTime: { gte: new Date(Date.now() - 20 * 86_400_000) },
      },
    });
    const res = await req('POST', user, `/reviews/${review.id}/reply/regenerate`, {});
    expect(res.json().reply.text).toContain('– Riverside team');
  });
});

describe('dashboard', () => {
  it('adds up reviews across locations', async () => {
    const user = await ownerWithReviews('multi');
    await runDraftQueue();
    const stats = (await req('GET', user, '/stats?days=365')).json();
    const { counts } = await list(user, '?tab=all');
    expect(stats.kpis.totalReviews).toBe(counts.all);
    expect(
      stats.starDistribution.reduce((sum: number, s: { count: number }) => sum + s.count, 0),
    ).toBe(counts.all);
    expect(stats.weekly.length).toBeGreaterThan(0);
    expect(stats.topics.length).toBeGreaterThan(0);
  });

  it('is empty, not broken, with no locations', async () => {
    const user = await signup(app);
    const stats = (await req('GET', user, '/stats')).json();
    expect(stats.kpis).toMatchObject({ totalReviews: 0, avgRating: null, responseRate: null });
  });
});

describe('30-day content purge', () => {
  it('blanks what came from Google but keeps owner replies and the numbers', async () => {
    const user = await ownerWithReviews();
    const review = await firstReview(user);
    await req('PUT', user, `/reviews/${review.id}/reply`, { text: 'Owner words' });
    const imported = await prisma.reply.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, source: 'google' },
    });

    await prisma.review.updateMany({
      where: { workspaceId: user.workspaceId },
      data: { lastFetchedAt: new Date(Date.now() - 31 * 86_400_000), sentiment: 'negative' },
    });
    expect(await purgeExpiredContent()).toBeGreaterThan(0);

    const after = await prisma.review.findUniqueOrThrow({
      where: { id: review.id },
      include: { reply: true },
    });
    expect(after).toMatchObject({
      comment: null,
      reviewerName: null,
      reviewerPhotoUrl: null,
      media: [],
      starRating: review.starRating,
      sentiment: 'negative',
    });
    expect(after.purgedAt).not.toBeNull();
    expect(after.reply?.text).toBe('Owner words');
    expect((await prisma.reply.findUniqueOrThrow({ where: { id: imported.id } })).text).toBe('');
    expect((await req('GET', user, `/reviews/${review.id}`)).json().purged).toBe(true);
  });

  it('leaves alone anything fetched in the last 30 days', async () => {
    const user = await ownerWithReviews();
    expect(await purgeExpiredContent()).toBe(0);
    expect(
      await prisma.review.count({
        where: { workspaceId: user.workspaceId, purgedAt: { not: null } },
      }),
    ).toBe(0);
  });

  it('a later sync restores the content', async () => {
    const user = await ownerWithReviews();
    await prisma.review.updateMany({
      where: { workspaceId: user.workspaceId },
      data: { lastFetchedAt: new Date(Date.now() - 31 * 86_400_000) },
    });
    await purgeExpiredContent();
    await req('POST', user, '/google/sync', {});
    expect(
      await prisma.review.count({
        where: { workspaceId: user.workspaceId, purgedAt: { not: null } },
      }),
    ).toBe(0);
  });
});
