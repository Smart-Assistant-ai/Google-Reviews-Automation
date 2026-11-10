import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config';
import { encrypt } from '../../src/lib/crypto';
import { prisma } from '../../src/lib/prisma';
import { getContext } from '../../src/modules/google/connection.service';
import { syncLocation } from '../../src/modules/google/sync.service';
import { draftForReview } from '../../src/modules/reviews/draft.service';
import { mockGbp } from '../../src/providers/gbp/mock';
import { sentEmails } from '../../src/providers/email/mock';
import {
  PASSWORD,
  signup,
  testApp,
  tokenFromEmail,
  uniqueEmail,
  type TestUser,
} from '../helpers/app';
import { resetDb } from '../helpers/db';
import { connectGoogle, googleStatus, verifyEmail } from '../helpers/google';

// Runs in the middle of a draft being written, like a person acting while the AI is still thinking.
const duringDraft = vi.hoisted(() => ({ action: null as null | (() => Promise<void>) }));
vi.mock('../../src/modules/reviews/voice.service', async (original) => {
  const real = await original<typeof import('../../src/modules/reviews/voice.service')>();
  return {
    ...real,
    effectiveVoice: async (workspaceId: string, locationId: string | null) => {
      const result = await real.effectiveVoice(workspaceId, locationId);
      await duringDraft.action?.();
      return result;
    },
  };
});

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
  env.GOOGLE_CLIENT_ID = 'client';
  env.GOOGLE_CLIENT_SECRET = 'secret';
  duringDraft.action = null;
});
afterEach(() => vi.unstubAllGlobals());

const req = (method: 'GET' | 'POST' | 'DELETE', user: TestUser, path: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1/workspaces/${user.workspaceId}${path}`,
    headers: user.headers,
    payload,
  });

async function connected() {
  const user = await signup(app);
  await verifyEmail(app, user);
  const email = `${user.id}@sample.test`;
  await connectGoogle(app, user, { email });
  const { locations, connections } = await googleStatus(app, user);
  return { user, email, location: locations[0]!, connection: connections[0]! };
}

async function liveConnection(workspaceId: string, connectionId: string) {
  await prisma.googleConnection.update({
    where: { id: connectionId },
    data: {
      provider: 'live',
      refreshToken: encrypt('refresh-token'),
      expiresAt: new Date(Date.now() - 1000),
      workspaceId,
    },
  });
}

describe('Google token refresh', () => {
  it('a Google outage does not switch off the connection', async () => {
    const { user, connection } = await connected();
    await liveConnection(user.workspaceId, connection.id);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Service unavailable', { status: 503 })),
    );
    const { ctx } = await getContext(connection.id);
    await expect(ctx.getAccessToken()).rejects.toThrow();
    const after = await prisma.googleConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(after.status).toBe('healthy');
  });

  it('a network failure does not switch off the connection', async () => {
    const { user, connection } = await connected();
    await liveConnection(user.workspaceId, connection.id);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const { ctx } = await getContext(connection.id);
    await expect(ctx.getAccessToken()).rejects.toThrow();
    expect(
      (await prisma.googleConnection.findUniqueOrThrow({ where: { id: connection.id } })).status,
    ).toBe('healthy');
  });

  it('Google saying the token is dead does ask for a reconnect', async () => {
    const { user, connection } = await connected();
    await liveConnection(user.workspaceId, connection.id);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
    );
    const { ctx } = await getContext(connection.id);
    await expect(ctx.getAccessToken()).rejects.toThrow();
    expect(
      (await prisma.googleConnection.findUniqueOrThrow({ where: { id: connection.id } })).status,
    ).toBe('needs_reconnect');
  });
});

describe('drafts never overwrite a person', () => {
  it('a slow draft leaves alone a reply the owner wrote in the meantime', async () => {
    const { user } = await connected();
    const review = await prisma.review.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, reply: { is: { state: 'drafting' } } },
    });
    duringDraft.action = async () => {
      await prisma.reply.update({
        where: { reviewId: review.id },
        data: { text: 'My own words', source: 'human', state: 'pending_google' },
      });
    };
    await draftForReview(review.id);
    const reply = await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } });
    expect(reply).toMatchObject({ text: 'My own words', source: 'human', state: 'pending_google' });
  });

  it('a draft still writes when nobody has touched the reply', async () => {
    const { user } = await connected();
    const review = await prisma.review.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, reply: { is: { state: 'drafting' } } },
    });
    await draftForReview(review.id);
    expect(await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } })).toMatchObject({
      source: 'ai',
      state: 'draft',
    });
  });
});

describe('a reply removed directly on Google', () => {
  async function postedReply() {
    const setup = await connected();
    const review = await prisma.review.findFirstOrThrow({
      where: {
        workspaceId: setup.user.workspaceId,
        createTime: { gte: new Date(Date.now() - 20 * 86_400_000) },
      },
    });
    await req('POST', setup.user, `/reviews/${review.id}/reply/post`, { text: 'Thanks' });
    await prisma.reply.update({ where: { reviewId: review.id }, data: { state: 'live' } });
    const location = await prisma.location.findUniqueOrThrow({ where: { id: review.locationId } });
    const name = `${location.googleAccountName}/${location.googleLocationName}/reviews/${review.googleReviewId}`;
    return { ...setup, review, name };
  }

  it('can still be deleted here when Google says it is already gone', async () => {
    const { user, review, name } = await postedReply();
    mockGbp.removeReview(name);
    const res = await req('DELETE', user, `/reviews/${review.id}/reply`);
    expect(res.statusCode).toBe(200);
    expect(res.json().reply).toBeNull();
  });

  it('other Google failures while deleting are still reported, and the reply stays', async () => {
    const { user, review, email } = await postedReply();
    mockGbp.failReads(email, 403);
    const res = await req('DELETE', user, `/reviews/${review.id}/reply`);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('google_refused');
    expect(await prisma.reply.count({ where: { reviewId: review.id } })).toBe(1);
  });

  it('sync notices, so the review goes back to needing a reply', async () => {
    const { review, name, location } = await postedReply();
    mockGbp.clearReply(name);
    await syncLocation(location.id);
    const reply = await prisma.reply.findUnique({ where: { reviewId: review.id } });
    expect(reply?.state).not.toBe('live');
  });

  it('sync does not remove a reply Google has not listed yet, because it may still be processing', async () => {
    const { review, name, location } = await postedReply();
    await prisma.reply.update({
      where: { reviewId: review.id },
      data: { state: 'pending_google' },
    });
    mockGbp.clearReply(name);
    await syncLocation(location.id);
    expect((await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } })).state).toBe(
      'pending_google',
    );
  });
});

describe('a location someone stopped managing', () => {
  it('keeps its history if Google later stops listing it', async () => {
    const { user, email, location, connection } = await connected();
    const before = await prisma.review.count({ where: { locationId: location.id } });
    expect(before).toBeGreaterThan(0);
    await req('POST', user, `/google/locations/${location.id}/deactivate`);
    mockGbp.removeLocations(email);
    await req('POST', user, `/google/connections/${connection.id}/rescan`);
    expect(await prisma.review.count({ where: { locationId: location.id } })).toBe(before);
    expect(await prisma.location.count({ where: { id: location.id } })).toBe(1);
  });

  it('a location that was never managed and holds nothing is still tidied away', async () => {
    const user = await signup(app);
    await verifyEmail(app, user);
    const email = `${user.id}@sample.test`;
    await connectGoogle(app, user, { scenario: 'multi', email });
    const { connections } = await googleStatus(app, user);
    mockGbp.removeLocations(email);
    await req('POST', user, `/google/connections/${connections[0]!.id}/rescan`);
    expect(await prisma.location.count({ where: { workspaceId: user.workspaceId } })).toBe(0);
  });
});

describe('login attempts', () => {
  const login = (email: string, password: string, remoteAddress: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
      remoteAddress,
    });

  it('a stranger failing from one address cannot lock the real owner out', async () => {
    const user = await signup(app);
    for (let i = 0; i < 10; i += 1) await login(user.email, 'wrong-password', '198.51.100.7');
    expect((await login(user.email, PASSWORD, '198.51.100.7')).statusCode).toBe(429);
    expect((await login(user.email, PASSWORD, '203.0.113.20')).statusCode).toBe(200);
  });

  it('many addresses guessing one account still get blocked', async () => {
    const user = await signup(app);
    for (let i = 0; i < 100; i += 1) await login(user.email, 'wrong-password', `198.51.100.${i}`);
    expect((await login(user.email, PASSWORD, '203.0.113.21')).statusCode).toBe(429);
  });
});

describe('forgot password', () => {
  it('answers before sending, so timing cannot reveal who has an account', async () => {
    const user = await signup(app);
    sentEmails.length = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const emailModule = await import('../../src/providers/email/mock');
    const send = vi.spyOn(emailModule.mockEmailProvider, 'send').mockImplementation(async () => {
      await held;
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: user.email },
    });
    expect(res.statusCode).toBe(200);
    release();
    send.mockRestore();
  });

  it('still sends the email', async () => {
    const user = await signup(app);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: user.email },
    });
    await vi.waitFor(() => tokenFromEmail(user.email, '/reset-password'));
  });
});

describe('transferring ownership', () => {
  it('two transfers at once still leave exactly one owner', async () => {
    const owner = await signup(app);
    const invite = async () => {
      const email = uniqueEmail('member');
      await req('POST', owner, '/invitations', { email });
      const member = await signup(app, { email, inviteToken: tokenFromEmail(email, '/invite') });
      return (await prisma.workspaceMember.findFirstOrThrow({ where: { userId: member.id } })).id;
    };
    const [a, b] = [await invite(), await invite()];
    const results = await Promise.all([
      req('POST', owner, '/transfer-ownership', { memberId: a }),
      req('POST', owner, '/transfer-ownership', { memberId: b }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 403]);
    expect(
      await prisma.workspaceMember.count({
        where: { workspaceId: owner.workspaceId, role: 'owner' },
      }),
    ).toBe(1);
  });
});
