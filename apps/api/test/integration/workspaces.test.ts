import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config';
import { prisma } from '../../src/lib/prisma';
import { sentEmails } from '../../src/providers/email/mock';
import { PASSWORD, bearer, signup, testApp, tokenFromEmail, uniqueEmail, type TestUser } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { addLocation } from '../helpers/seed-location';

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  sentEmails.length = 0;
  env.SIGNUP_MODE = 'open';
});

const api = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, user: TestUser | null, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, headers: user?.headers ?? {}, payload });

// Invites someone and returns them as a logged-in member.
async function addMember(
  owner: TestUser,
  options: { role?: 'admin' | 'member'; scopeAllLocations?: boolean; locationIds?: string[] } = {},
): Promise<TestUser & { memberId: string }> {
  const email = uniqueEmail('member');
  const invited = await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email, ...options });
  expect(invited.statusCode).toBe(200);
  const member = await signup(app, { email, inviteToken: tokenFromEmail(email, '/invite') });
  const row = await prisma.workspaceMember.findFirstOrThrow({ where: { userId: member.id } });
  return { ...member, workspaceId: owner.workspaceId, memberId: row.id };
}

describe('workspaces', () => {
  it('lists only the workspaces a person belongs to', async () => {
    const a = await signup(app);
    await signup(app);
    const res = await api('GET', '/workspaces', a);
    expect(res.json().workspaces.map((w: { id: string }) => w.id)).toEqual([a.workspaceId]);
  });

  it('lets one person own several workspaces and switch between them', async () => {
    const owner = await signup(app);
    const created = await api('POST', '/workspaces', owner, { name: 'Second Business' });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ name: 'Second Business', role: 'owner' });
    const list = (await api('GET', '/workspaces', owner)).json().workspaces;
    expect(list).toHaveLength(2);
  });

  it('answers 404, not 403, for a workspace you are not in', async () => {
    const a = await signup(app);
    const b = await signup(app);
    expect((await api('GET', `/workspaces/${b.workspaceId}`, a)).statusCode).toBe(404);
  });

  it('answers 404 for a badly formed workspace id', async () => {
    const a = await signup(app);
    expect((await api('GET', '/workspaces/not-a-uuid', a)).statusCode).toBe(404);
  });

  it('renaming needs admin, and a member gets 403', async () => {
    const owner = await signup(app);
    const member = await addMember(owner);
    expect((await api('PATCH', `/workspaces/${owner.workspaceId}`, member, { name: 'Nope' })).statusCode).toBe(403);
    expect((await api('PATCH', `/workspaces/${owner.workspaceId}`, owner, { name: 'New Name' })).json().name).toBe('New Name');
  });

  it('only the owner can delete a workspace, after which it is gone for everyone', async () => {
    const owner = await signup(app);
    const admin = await addMember(owner, { role: 'admin' });
    expect((await api('DELETE', `/workspaces/${owner.workspaceId}`, admin)).statusCode).toBe(403);
    expect((await api('DELETE', `/workspaces/${owner.workspaceId}`, owner)).statusCode).toBe(200);
    expect((await api('GET', `/workspaces/${owner.workspaceId}`, owner)).statusCode).toBe(404);
    expect((await api('GET', `/workspaces/${owner.workspaceId}`, admin)).statusCode).toBe(404);
  });
});

describe('invitations', () => {
  it('a new person joins through the link, with a verified email and no workspace of their own', async () => {
    const owner = await signup(app);
    const member = await addMember(owner, { role: 'admin' });
    const me = (await api('GET', '/auth/me', member)).json();
    expect(me.user.emailVerified).toBe(true);
    expect(me.workspaces).toEqual([expect.objectContaining({ id: owner.workspaceId, role: 'admin' })]);
  });

  it('an existing person accepts while logged in, and keeps their own workspace', async () => {
    const owner = await signup(app);
    const existing = await signup(app);
    await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email: existing.email });
    const token = tokenFromEmail(existing.email, '/invite');
    const res = await api('POST', '/invitations/accept', existing, { token });
    expect(res.statusCode).toBe(200);
    expect((await api('GET', '/workspaces', existing)).json().workspaces).toHaveLength(2);
  });

  it('bypasses the signup allowlist', async () => {
    const owner = await signup(app);
    env.SIGNUP_MODE = 'allowlist';
    await expect(addMember(owner)).resolves.toBeTruthy();
  });

  it('shows who it is for before anyone logs in, without needing an account', async () => {
    const owner = await signup(app, { businessName: 'Corner Shop' });
    const email = uniqueEmail();
    await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email });
    const res = await api('GET', `/invitations/preview?token=${tokenFromEmail(email, '/invite')}`, null);
    expect(res.json()).toEqual({ workspaceName: 'Corner Shop', email, role: 'member', accountExists: false });
  });

  it('refuses when a different person tries to use the link', async () => {
    const owner = await signup(app);
    const stranger = await signup(app);
    const email = uniqueEmail();
    await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email });
    const token = tokenFromEmail(email, '/invite');
    const accept = await api('POST', '/invitations/accept', stranger, { token });
    expect(accept.statusCode).toBe(403);
    await expect(signup(app, { email: uniqueEmail(), inviteToken: token })).rejects.toThrow(/400/);
  });

  it('the link works once', async () => {
    const owner = await signup(app);
    const email = uniqueEmail();
    await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email });
    const token = tokenFromEmail(email, '/invite');
    await signup(app, { email, inviteToken: token });
    expect((await api('GET', `/invitations/preview?token=${token}`, null)).statusCode).toBe(404);
  });

  it('a revoked link stops working', async () => {
    const owner = await signup(app);
    const email = uniqueEmail();
    const invited = await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email });
    const token = tokenFromEmail(email, '/invite');
    expect((await api('DELETE', `/workspaces/${owner.workspaceId}/invitations/${invited.json().id}`, owner)).statusCode).toBe(200);
    expect((await api('GET', `/invitations/preview?token=${token}`, null)).statusCode).toBe(404);
  });

  it('inviting the same email again cancels the older link', async () => {
    const owner = await signup(app);
    const email = uniqueEmail();
    await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email });
    const first = tokenFromEmail(email, '/invite');
    await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email });
    expect((await api('GET', `/invitations/preview?token=${first}`, null)).statusCode).toBe(404);
    const pending = (await api('GET', `/workspaces/${owner.workspaceId}/invitations`, owner)).json().invitations;
    expect(pending).toHaveLength(1);
  });

  it('refuses inviting someone already in the workspace', async () => {
    const owner = await signup(app);
    const member = await addMember(owner);
    const res = await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email: member.email });
    expect(res.statusCode).toBe(409);
  });

  it('a member cannot invite anyone', async () => {
    const owner = await signup(app);
    const member = await addMember(owner);
    const res = await api('POST', `/workspaces/${owner.workspaceId}/invitations`, member, { email: uniqueEmail() });
    expect(res.statusCode).toBe(403);
  });

  it('refuses a location from another workspace', async () => {
    const owner = await signup(app);
    const other = await signup(app);
    const theirs = await addLocation(other.workspaceId);
    const res = await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, {
      email: uniqueEmail(),
      scopeAllLocations: false,
      locationIds: [theirs.id],
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('invitations through Google sign-in', () => {
  const code = (sub: string, email: string) => Buffer.from(JSON.stringify({ sub, email, emailVerified: true })).toString('base64url');

  async function viaGoogle(sub: string, email: string, invite: string) {
    const start = await app.inject({ url: `/api/v1/auth/google/start?invite=${encodeURIComponent(invite)}` });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const nonce = start.cookies.find((c) => c.name === 'rp_google_signin')!.value;
    return app.inject({
      url: `/api/v1/auth/google/callback?code=${code(sub, email)}&state=${encodeURIComponent(state)}`,
      cookies: { rp_google_signin: nonce },
    });
  }

  it('a new person joins straight away, with no workspace of their own', async () => {
    const owner = await signup(app);
    const email = uniqueEmail();
    await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email });
    const res = await viaGoogle('new-person', email, tokenFromEmail(email, '/invite'));
    expect(res.headers.location).toBe(`${env.APP_URL}/auth/callback`);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { memberships: true } });
    expect(user.memberships.map((m) => m.workspaceId)).toEqual([owner.workspaceId]);
  });

  it('someone who already has an account is sent back to accept the invitation', async () => {
    const owner = await signup(app);
    const existing = await signup(app);
    await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token: tokenFromEmail(existing.email, '/verify-email') } });
    await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email: existing.email });
    const token = tokenFromEmail(existing.email, '/invite');
    const res = await viaGoogle('existing-person', existing.email, token);
    expect(res.headers.location).toBe(`${env.APP_URL}/auth/callback?invite=${encodeURIComponent(token)}`);
  });
});

describe('members', () => {
  it('lists the team', async () => {
    const owner = await signup(app, { name: 'Olive' });
    const member = await addMember(owner);
    const { members } = (await api('GET', `/workspaces/${owner.workspaceId}/members`, owner)).json();
    expect(members).toHaveLength(2);
    expect(members.find((m: { userId: string }) => m.userId === owner.id)).toMatchObject({ role: 'owner', isYou: true, name: 'Olive' });
    expect(members.find((m: { userId: string }) => m.userId === member.id)).toMatchObject({ role: 'member', isYou: false });
  });

  it('a role change applies on the very next request', async () => {
    const owner = await signup(app);
    const member = await addMember(owner, { role: 'admin' });
    expect((await api('GET', `/workspaces/${owner.workspaceId}/invitations`, member)).statusCode).toBe(200);
    await api('PATCH', `/workspaces/${owner.workspaceId}/members/${member.memberId}`, owner, { role: 'member' });
    expect((await api('GET', `/workspaces/${owner.workspaceId}/invitations`, member)).statusCode).toBe(403);
  });

  it('removal applies on the very next request, without waiting for the token to expire', async () => {
    const owner = await signup(app);
    const member = await addMember(owner);
    expect((await api('GET', `/workspaces/${owner.workspaceId}`, member)).statusCode).toBe(200);
    expect((await api('DELETE', `/workspaces/${owner.workspaceId}/members/${member.memberId}`, owner)).statusCode).toBe(200);
    expect((await api('GET', `/workspaces/${owner.workspaceId}`, member)).statusCode).toBe(404);
  });

  it('a removed person can be invited back', async () => {
    const owner = await signup(app);
    const member = await addMember(owner);
    await api('DELETE', `/workspaces/${owner.workspaceId}/members/${member.memberId}`, owner);
    await api('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email: member.email });
    const res = await api('POST', '/invitations/accept', member, { token: tokenFromEmail(member.email, '/invite') });
    expect(res.statusCode).toBe(200);
    expect((await api('GET', `/workspaces/${owner.workspaceId}`, member)).statusCode).toBe(200);
  });

  it('an admin cannot change or remove the owner', async () => {
    const owner = await signup(app);
    const admin = await addMember(owner, { role: 'admin' });
    const ownerRow = await prisma.workspaceMember.findFirstOrThrow({ where: { userId: owner.id } });
    expect((await api('PATCH', `/workspaces/${owner.workspaceId}/members/${ownerRow.id}`, admin, { role: 'member' })).statusCode).toBe(403);
    expect((await api('DELETE', `/workspaces/${owner.workspaceId}/members/${ownerRow.id}`, admin)).statusCode).toBe(403);
  });

  it('a member cannot change anyone', async () => {
    const owner = await signup(app);
    const a = await addMember(owner);
    const b = await addMember(owner);
    expect((await api('PATCH', `/workspaces/${owner.workspaceId}/members/${b.memberId}`, a, { role: 'admin' })).statusCode).toBe(403);
  });

  it('a member id from another workspace answers 404', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const theirs = await addMember(b);
    expect((await api('DELETE', `/workspaces/${a.workspaceId}/members/${theirs.memberId}`, a)).statusCode).toBe(404);
  });

  it('the last owner cannot leave', async () => {
    const owner = await signup(app);
    await addMember(owner);
    const res = await api('POST', `/workspaces/${owner.workspaceId}/leave`, owner);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('last_owner');
  });

  it('a member can leave', async () => {
    const owner = await signup(app);
    const member = await addMember(owner);
    expect((await api('POST', `/workspaces/${owner.workspaceId}/leave`, member)).statusCode).toBe(200);
    expect((await api('GET', `/workspaces/${owner.workspaceId}`, member)).statusCode).toBe(404);
  });

  it('transferring ownership swaps the roles, and then the old owner can leave', async () => {
    const owner = await signup(app);
    const member = await addMember(owner);
    const res = await api('POST', `/workspaces/${owner.workspaceId}/transfer-ownership`, owner, { memberId: member.memberId });
    expect(res.statusCode).toBe(200);
    const { members } = (await api('GET', `/workspaces/${owner.workspaceId}/members`, member)).json();
    expect(members.find((m: { userId: string }) => m.userId === member.id).role).toBe('owner');
    expect(members.find((m: { userId: string }) => m.userId === owner.id).role).toBe('admin');
    expect((await api('POST', `/workspaces/${owner.workspaceId}/leave`, owner)).statusCode).toBe(200);
  });

  it('only the owner can transfer ownership', async () => {
    const owner = await signup(app);
    const admin = await addMember(owner, { role: 'admin' });
    const res = await api('POST', `/workspaces/${owner.workspaceId}/transfer-ownership`, admin, { memberId: admin.memberId });
    expect(res.statusCode).toBe(403);
  });

  it('an owner with teammates cannot delete their account until they transfer', async () => {
    const owner = await signup(app);
    await addMember(owner);
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/auth/me', headers: bearer(owner.accessToken), payload: { password: PASSWORD } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('transfer_ownership_first');
  });

  it('records team changes in the activity log, which members cannot read', async () => {
    const owner = await signup(app);
    const member = await addMember(owner);
    await api('PATCH', `/workspaces/${owner.workspaceId}/members/${member.memberId}`, owner, { role: 'admin' });
    await api('PATCH', `/workspaces/${owner.workspaceId}/members/${member.memberId}`, owner, { role: 'member' });
    const res = await api('GET', `/workspaces/${owner.workspaceId}/activity`, owner);
    expect(res.json().items.map((i: { action: string }) => i.action)).toContain('member.updated');
    expect((await api('GET', `/workspaces/${owner.workspaceId}/activity`, member)).statusCode).toBe(403);
  });
});

describe('location access', () => {
  it('stores the chosen locations and refuses ones from another workspace', async () => {
    const owner = await signup(app);
    const other = await signup(app);
    const mine = await addLocation(owner.workspaceId);
    const theirs = await addLocation(other.workspaceId);
    const member = await addMember(owner);
    const url = `/workspaces/${owner.workspaceId}/members/${member.memberId}`;
    expect((await api('PATCH', url, owner, { scopeAllLocations: false, locationIds: [theirs.id] })).statusCode).toBe(400);
    const res = await api('PATCH', url, owner, { scopeAllLocations: false, locationIds: [mine.id] });
    expect(res.json()).toMatchObject({ scopeAllLocations: false, locationIds: [mine.id] });
  });

  it('owners and admins are always shown as reaching every location', async () => {
    const owner = await signup(app);
    const location = await addLocation(owner.workspaceId);
    const member = await addMember(owner, { scopeAllLocations: false, locationIds: [location.id] });
    const res = await api('PATCH', `/workspaces/${owner.workspaceId}/members/${member.memberId}`, owner, { role: 'admin' });
    expect(res.json()).toMatchObject({ role: 'admin', scopeAllLocations: true, locationIds: [] });
  });
});
