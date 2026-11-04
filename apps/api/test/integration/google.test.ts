import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config';
import { decrypt } from '../../src/lib/crypto';
import { prisma } from '../../src/lib/prisma';
import { syncLocation } from '../../src/modules/google/sync.service';
import { sentEmails } from '../../src/providers/email/mock';
import { mockGbp } from '../../src/providers/gbp/mock';
import { signState } from '../../src/lib/signed-state';
import { signup, testApp, tokenFromEmail, uniqueEmail, type TestUser } from '../helpers/app';
import { resetDb } from '../helpers/db';
import {
  connectGoogle,
  googleStatus,
  mockCode,
  reviewCount,
  selectLocations,
  verifyEmail,
} from '../helpers/google';

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
});

async function verifiedOwner(): Promise<TestUser> {
  const user = await signup(app);
  await verifyEmail(app, user);
  return user;
}

const api = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  user: TestUser,
  path: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1/workspaces/${user.workspaceId}/google${path}`,
    headers: user.headers,
    payload,
  });

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

describe('connecting Google', () => {
  it('needs a verified email', async () => {
    const user = await signup(app);
    const res = await api('POST', user, '/connections/start');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('email_not_verified');
  });

  it('needs admin', async () => {
    const owner = await verifiedOwner();
    const member = await inviteMember(owner);
    expect((await api('POST', member, '/connections/start')).statusCode).toBe(403);
  });

  it('one location: attached automatically, with its reviews loaded', async () => {
    const user = await verifiedOwner();
    const { redirect } = await connectGoogle(app, user, { scenario: 'single' });
    expect(redirect.searchParams.get('google_connected')).toBe('true');
    const status = await googleStatus(app, user);
    expect(status.locations).toHaveLength(1);
    expect(status.locations[0]?.status).toBe('active');
    expect(await reviewCount(user.workspaceId)).toBeGreaterThan(0);
  });

  it('many locations: nothing is managed until the user picks', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { scenario: 'multi' });
    const status = await googleStatus(app, user);
    expect(status.locations.map((l) => l.status)).toEqual(['available', 'available', 'available']);
    expect(await reviewCount(user.workspaceId)).toBe(0);
  });

  it('picking some locations loads only those', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { scenario: 'multi' });
    const { locations } = await googleStatus(app, user);
    const res = await selectLocations(app, user, [locations[0]!.id, locations[1]!.id]);
    expect(res.statusCode).toBe(200);
    const after = await googleStatus(app, user);
    expect(after.locations.filter((l) => l.status === 'active')).toHaveLength(2);
    expect(await prisma.review.count({ where: { locationId: locations[2]!.id } })).toBe(0);
    expect(await prisma.review.count({ where: { locationId: locations[0]!.id } })).toBeGreaterThan(
      0,
    );
  });

  it('reads every account group on the Google account', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { scenario: 'groups' });
    expect((await googleStatus(app, user)).locations).toHaveLength(4);
  });

  it('reads past the first page when an account has over 100 locations', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { scenario: 'many' });
    expect((await googleStatus(app, user)).locations).toHaveLength(120);
  });

  it('no locations: stays connected with a clear message', async () => {
    const user = await verifiedOwner();
    const { redirect } = await connectGoogle(app, user, { scenario: 'none' });
    expect(redirect.searchParams.get('google_connected')).toBe('true');
    const status = await googleStatus(app, user);
    expect(status.connections).toHaveLength(1);
    expect(status.connections[0]?.apiError).toMatch(/No Business Profile/);
  });

  it('encrypts tokens in the database', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user);
    const row = await prisma.googleConnection.findFirstOrThrow();
    expect(row.refreshToken).toMatch(/^v1:/);
    expect(decrypt(row.refreshToken)).toContain('mock-refresh');
  });

  it('refuses a location from another workspace', async () => {
    const a = await verifiedOwner();
    const b = await verifiedOwner();
    await connectGoogle(app, b, { scenario: 'multi', email: 'b@sample.test' });
    const { locations } = await googleStatus(app, b);
    expect((await selectLocations(app, a, [locations[0]!.id])).statusCode).toBe(400);
  });
});

describe('Google callback safety', () => {
  async function startFor(user: TestUser) {
    const start = await api('POST', user, '/connections/start');
    return {
      state: new URL(start.json().url).searchParams.get('state')!,
      nonce: start.cookies.find((c) => c.name === 'rp_google_connect')!.value,
    };
  }
  const code = mockCode('single', 'victim@sample.test');
  const errorIn = (res: { headers: Record<string, unknown> }) =>
    new URL(res.headers.location as string).searchParams.get('error');

  it('refuses a link opened in a different browser, so a victim cannot be tricked into connecting to an attacker', async () => {
    const attacker = await verifiedOwner();
    const { state } = await startFor(attacker);
    const res = await app.inject({
      url: `/api/v1/google/callback?code=${code}&state=${encodeURIComponent(state)}`,
    });
    expect(errorIn(res)).toBe('google_state');
    expect(await prisma.googleConnection.count()).toBe(0);
  });

  it('refuses a forged state', async () => {
    const user = await verifiedOwner();
    const { nonce } = await startFor(user);
    const res = await app.inject({
      url: `/api/v1/google/callback?code=${code}&state=forged.state`,
      cookies: { rp_google_connect: nonce },
    });
    expect(errorIn(res)).toBe('google_state');
  });

  it('refuses if the person has lost admin since starting', async () => {
    const owner = await verifiedOwner();
    const admin = await inviteMember(owner, { role: 'admin' });
    const { state, nonce } = await startFor(admin);
    await prisma.workspaceMember.updateMany({
      where: { userId: admin.id },
      data: { role: 'member' },
    });
    const res = await app.inject({
      url: `/api/v1/google/callback?code=${code}&state=${encodeURIComponent(state)}`,
      cookies: { rp_google_connect: nonce },
    });
    expect(errorIn(res)).toBe('google_state');
    expect(await prisma.googleConnection.count()).toBe(0);
  });

  it('a state can only be used for connecting, not for another flow', async () => {
    const user = await verifiedOwner();
    const nonce = 'abc';
    const state = signState(
      'google-signin',
      { nonce, workspaceId: user.workspaceId, userId: user.id },
      600,
    );
    const res = await app.inject({
      url: `/api/v1/google/callback?code=${code}&state=${encodeURIComponent(state)}`,
      cookies: { rp_google_connect: nonce },
    });
    expect(errorIn(res)).toBe('google_state');
  });

  it('turns Google refusing consent into a friendly redirect', async () => {
    const user = await verifiedOwner();
    const { state, nonce } = await startFor(user);
    const res = await app.inject({
      url: `/api/v1/google/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      cookies: { rp_google_connect: nonce },
    });
    expect(errorIn(res)).toBe('google_denied');
  });
});

describe('several Google accounts in one workspace', () => {
  it('keeps each as its own connection, with each location knowing which one it uses', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { scenario: 'single', email: 'one@sample.test' });
    await connectGoogle(app, user, { scenario: 'single', email: 'two@sample.test' });
    const status = await googleStatus(app, user);
    expect(status.connections).toHaveLength(2);
    expect(new Set(status.locations.map((l) => l.connectionId)).size).toBe(2);
  });

  it('reconnecting the same account updates it rather than adding another', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { email: 'one@sample.test' });
    await connectGoogle(app, user, { email: 'one@sample.test' });
    expect((await googleStatus(app, user)).connections).toHaveLength(1);
  });

  it('a location reachable through two connections has one row, and can be switched', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { scenario: 'single', email: 'one@sample.test' });
    const before = await googleStatus(app, user);
    const location = before.locations[0]!;
    await connectGoogle(app, user, { scenario: 'single', email: 'two@sample.test' });
    const second = (await googleStatus(app, user)).connections.find(
      (c) => c.email === 'two@sample.test',
    )!;
    mockGbp.shareLocation('one@sample.test', 'two@sample.test');
    await api('POST', user, `/connections/${second.id}/rescan`);

    const after = await googleStatus(app, user);
    const row = after.locations.find((l) => l.id === location.id)!;
    expect(row.connectionId).toBe(location.connectionId);
    expect(row.alternativeConnections.map((c) => c.id)).toContain(second.id);

    const res = await api('PATCH', user, `/locations/${location.id}/connection`, {
      connectionId: second.id,
    });
    expect(res.statusCode).toBe(200);
    const switched = (await googleStatus(app, user)).locations.find((l) => l.id === location.id)!;
    expect(switched.connectionId).toBe(second.id);
  });

  it('refuses switching to a connection that cannot reach the location', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { email: 'one@sample.test' });
    await connectGoogle(app, user, { email: 'two@sample.test' });
    const status = await googleStatus(app, user);
    const location = status.locations.find((l) => l.connectionId === status.connections[0]!.id)!;
    const other = status.connections[1]!;
    const res = await api('PATCH', user, `/locations/${location.id}/connection`, {
      connectionId: other.id,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('the same business in two workspaces', () => {
  it('keeps two separate copies, and syncing one never takes reviews from the other', async () => {
    const a = await verifiedOwner();
    const b = await verifiedOwner();
    await connectGoogle(app, a, { email: 'shared@sample.test' });
    const countA = await reviewCount(a.workspaceId);
    await connectGoogle(app, b, { email: 'shared@sample.test' });

    expect(countA).toBeGreaterThan(0);
    expect(await reviewCount(b.workspaceId)).toBe(countA);
    expect(await reviewCount(a.workspaceId)).toBe(countA);

    const [locationA] = (await googleStatus(app, a)).locations;
    await syncLocation(locationA!.id);
    expect(await reviewCount(b.workspaceId)).toBe(countA);

    const review = await prisma.review.findFirstOrThrow({ where: { workspaceId: a.workspaceId } });
    await prisma.reply.deleteMany({ where: { reviewId: review.id } });
    await prisma.reply.create({
      data: {
        workspaceId: a.workspaceId,
        reviewId: review.id,
        text: 'private draft of A',
        source: 'human',
        state: 'draft',
      },
    });
    await syncLocation((await googleStatus(app, b)).locations[0]!.id);
    const stillA = await prisma.review.findUniqueOrThrow({
      where: { id: review.id },
      include: { reply: true },
    });
    expect(stillA.workspaceId).toBe(a.workspaceId);
    expect(stillA.reply?.text).toBe('private draft of A');
  });
});

describe('changes on Google', () => {
  it('a location added later shows as available, and is never managed by itself', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { scenario: 'single', email: 'one@sample.test' });
    mockGbp.addLocation('one@sample.test', 'New Branch');
    const connection = (await googleStatus(app, user)).connections[0]!;
    await api('POST', user, `/connections/${connection.id}/rescan`);
    const added = (await googleStatus(app, user)).locations.find((l) => l.title === 'New Branch')!;
    expect(added.status).toBe('available');
    expect(await prisma.review.count({ where: { locationId: added.id } })).toBe(0);
  });

  it('a location removed from Google is marked, keeps its data, and recovers if it comes back', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { scenario: 'single', email: 'one@sample.test' });
    const { locations, connections } = await googleStatus(app, user);
    const location = locations[0]!;
    const before = await reviewCount(user.workspaceId);

    mockGbp.removeLocations('one@sample.test');
    await api('POST', user, `/connections/${connections[0]!.id}/rescan`);
    expect((await googleStatus(app, user)).locations[0]?.status).toBe('access_lost');
    expect(await reviewCount(user.workspaceId)).toBe(before);

    mockGbp.restoreLocations('one@sample.test');
    await api('POST', user, `/connections/${connections[0]!.id}/rescan`);
    expect(
      (await googleStatus(app, user)).locations.find((l) => l.id === location.id)?.status,
    ).toBe('active');
  });

  it('a location Google refuses to read during sync is marked access_lost, and sync stops', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { email: 'one@sample.test' });
    const location = (await googleStatus(app, user)).locations[0]!;
    mockGbp.failReads('one@sample.test', 403);
    await syncLocation(location.id);
    expect((await googleStatus(app, user)).locations[0]?.status).toBe('access_lost');
  });

  it('a dead token affects only its own connection', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { email: 'one@sample.test' });
    await connectGoogle(app, user, { email: 'two@sample.test' });
    const status = await googleStatus(app, user);
    const one = status.connections.find((c) => c.email === 'one@sample.test')!;
    const two = status.connections.find((c) => c.email === 'two@sample.test')!;
    await selectLocations(app, user, [status.locations.find((l) => l.connectionId === two.id)!.id]);

    mockGbp.failReads('one@sample.test', 401);
    await syncLocation(status.locations.find((l) => l.connectionId === one.id)!.id);
    await syncLocation(status.locations.find((l) => l.connectionId === two.id)!.id);

    const after = await googleStatus(app, user);
    expect(after.connections.find((c) => c.id === one.id)?.status).toBe('needs_reconnect');
    expect(after.connections.find((c) => c.id === two.id)?.status).toBe('healthy');
    expect(after.locations.find((l) => l.connectionId === two.id)?.lastSyncError).toBeNull();
  });

  it('reconnecting heals a dead connection', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { email: 'one@sample.test' });
    const location = (await googleStatus(app, user)).locations[0]!;
    mockGbp.failReads('one@sample.test', 401);
    await syncLocation(location.id);
    mockGbp.failReads('one@sample.test', null);
    await connectGoogle(app, user, { email: 'one@sample.test' });
    expect((await googleStatus(app, user)).connections[0]?.status).toBe('healthy');
  });

  it('Google blocking access before approval leaves the account connected, with the reason', async () => {
    const user = await verifiedOwner();
    mockGbp.failReads('blocked@sample.test', 429);
    await connectGoogle(app, user, { email: 'blocked@sample.test' });
    const status = await googleStatus(app, user);
    expect(status.connections[0]?.apiError).toMatch(/not approved/);
  });
});

describe('disconnecting', () => {
  it('previews what will go, then removes only that connection and its data', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { email: 'one@sample.test' });
    await connectGoogle(app, user, { email: 'two@sample.test' });
    const status = await googleStatus(app, user);
    const one = status.connections.find((c) => c.email === 'one@sample.test')!;
    const two = status.connections.find((c) => c.email === 'two@sample.test')!;
    const locationTwo = status.locations.find((l) => l.connectionId === two.id)!;
    await selectLocations(app, user, [locationTwo.id]);

    const preview = (await api('GET', user, `/connections/${one.id}/disconnect-preview`)).json();
    expect(preview.removes).toHaveLength(1);
    expect(preview.moves).toHaveLength(0);

    expect((await api('DELETE', user, `/connections/${one.id}`)).statusCode).toBe(200);
    const after = await googleStatus(app, user);
    expect(after.connections.map((c) => c.id)).toEqual([two.id]);
    expect(after.locations.map((l) => l.id)).toEqual([locationTwo.id]);
    expect(await prisma.review.count({ where: { locationId: locationTwo.id } })).toBeGreaterThan(0);
  });

  it('moves a location to another connection that can reach it, keeping its data', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user, { email: 'one@sample.test' });
    await connectGoogle(app, user, { email: 'two@sample.test' });
    mockGbp.shareLocation('one@sample.test', 'two@sample.test');
    const first = await googleStatus(app, user);
    const one = first.connections.find((c) => c.email === 'one@sample.test')!;
    const two = first.connections.find((c) => c.email === 'two@sample.test')!;
    await api('POST', user, `/connections/${two.id}/rescan`);
    const location = first.locations.find((l) => l.connectionId === one.id)!;
    const reviews = await prisma.review.count({ where: { locationId: location.id } });

    const preview = (await api('GET', user, `/connections/${one.id}/disconnect-preview`)).json();
    expect(preview.moves.map((m: { id: string }) => m.id)).toContain(location.id);

    await api('DELETE', user, `/connections/${one.id}`);
    const row = await prisma.location.findUniqueOrThrow({ where: { id: location.id } });
    expect(row.connectionId).toBe(two.id);
    expect(await prisma.review.count({ where: { locationId: location.id } })).toBe(reviews);
  });

  it('deleting a workspace disconnects its Google accounts', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user);
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${user.workspaceId}`,
      headers: user.headers,
    });
    expect(await prisma.googleConnection.count({ where: { workspaceId: user.workspaceId } })).toBe(
      0,
    );
    expect(await reviewCount(user.workspaceId)).toBe(0);
  });

  it('another workspace cannot touch this connection', async () => {
    const a = await verifiedOwner();
    const b = await verifiedOwner();
    await connectGoogle(app, a);
    const connection = (await googleStatus(app, a)).connections[0]!;
    expect((await api('DELETE', b, `/connections/${connection.id}`)).statusCode).toBe(404);
    expect(
      (await api('GET', b, `/connections/${connection.id}/disconnect-preview`)).statusCode,
    ).toBe(404);
  });
});

describe('sample data', () => {
  it('turns on for a blocked account, and can be turned off again', async () => {
    const user = await verifiedOwner();
    mockGbp.failReads('blocked@sample.test', 429);
    await connectGoogle(app, user, { email: 'blocked@sample.test' });
    const connection = (await googleStatus(app, user)).connections[0]!;

    expect((await api('POST', user, `/connections/${connection.id}/sample-data`)).statusCode).toBe(
      200,
    );
    const on = await googleStatus(app, user);
    expect(on.connections[0]?.sample).toBe(true);
    expect(on.connections[0]?.apiError).toBeNull();
    expect(await reviewCount(user.workspaceId)).toBeGreaterThan(0);

    expect(
      (await api('DELETE', user, `/connections/${connection.id}/sample-data`)).statusCode,
    ).toBe(200);
    expect((await googleStatus(app, user)).connections[0]?.sample).toBe(false);
    expect(await reviewCount(user.workspaceId)).toBe(0);
  });

  it('turning it on twice keeps existing replies', async () => {
    const user = await verifiedOwner();
    mockGbp.failReads('blocked@sample.test', 429);
    await connectGoogle(app, user, { email: 'blocked@sample.test' });
    const connection = (await googleStatus(app, user)).connections[0]!;
    await api('POST', user, `/connections/${connection.id}/sample-data`);
    const review = await prisma.review.findFirstOrThrow({
      where: { workspaceId: user.workspaceId },
    });
    await api('POST', user, `/connections/${connection.id}/sample-data`);
    expect(await prisma.review.count({ where: { id: review.id } })).toBe(1);
  });

  it('is refused on an account with real reviews', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user);
    const connection = (await googleStatus(app, user)).connections[0]!;
    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: { provider: 'live' },
    });
    const res = await api('POST', user, `/connections/${connection.id}/sample-data`);
    expect(res.statusCode).toBe(409);
  });
});

describe('what team members see', () => {
  it('a location-limited member only sees their locations and no connections', async () => {
    const owner = await verifiedOwner();
    await connectGoogle(app, owner, { scenario: 'multi' });
    const { locations } = await googleStatus(app, owner);
    await selectLocations(
      app,
      owner,
      locations.map((l) => l.id),
    );
    const member = await inviteMember(owner, {
      scopeAllLocations: false,
      locationIds: [locations[0]!.id],
    });
    const status = await googleStatus(app, member);
    expect(status.connections).toEqual([]);
    expect(status.locations.map((l) => l.id)).toEqual([locations[0]!.id]);
  });

  it('a member cannot pick or remove locations', async () => {
    const owner = await verifiedOwner();
    await connectGoogle(app, owner);
    const { locations, connections } = await googleStatus(app, owner);
    const member = await inviteMember(owner);
    expect((await selectLocations(app, member, [locations[0]!.id])).statusCode).toBe(403);
    expect((await api('DELETE', member, `/connections/${connections[0]!.id}`)).statusCode).toBe(
      403,
    );
    expect(
      (await api('POST', member, `/locations/${locations[0]!.id}/deactivate`)).statusCode,
    ).toBe(403);
  });

  it('a limited member can only sync their own locations', async () => {
    const owner = await verifiedOwner();
    await connectGoogle(app, owner, { scenario: 'multi' });
    const { locations } = await googleStatus(app, owner);
    await selectLocations(
      app,
      owner,
      locations.map((l) => l.id),
    );
    const member = await inviteMember(owner, {
      scopeAllLocations: false,
      locationIds: [locations[0]!.id],
    });
    expect((await api('POST', member, '/sync', { locationId: locations[1]!.id })).statusCode).toBe(
      404,
    );
    const res = await api('POST', member, '/sync', { locationId: locations[0]!.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().synced).toBe(1);
  });
});

describe('deactivating a location', () => {
  it('stops managing it but keeps its data for later', async () => {
    const user = await verifiedOwner();
    await connectGoogle(app, user);
    const location = (await googleStatus(app, user)).locations[0]!;
    const before = await reviewCount(user.workspaceId);
    expect((await api('POST', user, `/locations/${location.id}/deactivate`)).statusCode).toBe(200);
    expect((await googleStatus(app, user)).locations[0]?.status).toBe('available');
    expect(await reviewCount(user.workspaceId)).toBe(before);
  });
});
