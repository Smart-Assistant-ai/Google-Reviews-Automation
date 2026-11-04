import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config';
import { prisma } from '../../src/lib/prisma';
import { sentEmails } from '../../src/providers/email/mock';
import {
  PASSWORD,
  bearer,
  refreshCookie,
  signup,
  testApp,
  tokenFromEmail,
  uniqueEmail,
} from '../helpers/app';
import { resetDb } from '../helpers/db';

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

const post = (url: string, payload?: object, headers?: Record<string, string>) =>
  app.inject({ method: 'POST', url: `/api/v1/auth${url}`, payload, headers });
const refreshWith = (token: string, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    cookies: { rp_refresh: token },
    headers,
  });
const me = (token: string) => app.inject({ url: '/api/v1/auth/me', headers: bearer(token) });

describe('signup', () => {
  it('creates the user, a workspace they own, and logs them in', async () => {
    const res = await post('/signup', {
      email: 'Owner@Business.test',
      password: PASSWORD,
      name: 'Sam',
      businessName: 'Corner Shop',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({
      email: 'owner@business.test',
      name: 'Sam',
      emailVerified: false,
      hasPassword: true,
      hasGoogle: false,
    });
    expect(body.workspaces).toEqual([
      expect.objectContaining({ name: 'Corner Shop', role: 'owner' }),
    ]);
    expect(body.accessToken).toBeTruthy();
  });

  it('puts the refresh token in a cookie JavaScript cannot read', async () => {
    const res = await post('/signup', { email: uniqueEmail(), password: PASSWORD });
    const cookie = res.cookies.find((c) => c.name === 'rp_refresh')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    expect(cookie.path).toBe('/api/v1/auth');
    expect(res.body).not.toContain(cookie.value);
  });

  it('never stores the plain password', async () => {
    const user = await signup(app);
    const identity = await prisma.authIdentity.findFirstOrThrow({ where: { userId: user.id } });
    expect(identity.passwordHash).toMatch(/^\$2/);
    expect(identity.passwordHash).not.toContain(PASSWORD);
  });

  it('refuses a second account on one email, whatever the case', async () => {
    const email = uniqueEmail();
    await signup(app, { email });
    const res = await post('/signup', { email: email.toUpperCase(), password: PASSWORD });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('email_taken');
  });

  it('refuses a weak password', async () => {
    const res = await post('/signup', { email: uniqueEmail(), password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields[0].path).toBe('password');
  });

  it('emails a verification link', async () => {
    const user = await signup(app);
    expect(tokenFromEmail(user.email, '/verify-email')).toBeTruthy();
  });
});

describe('allowlisted signup', () => {
  beforeEach(() => {
    env.SIGNUP_MODE = 'allowlist';
  });

  it('refuses an email that is not on the list and creates nothing', async () => {
    const email = uniqueEmail();
    const res = await post('/signup', { email, password: PASSWORD });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('signup_not_allowed');
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('lets a listed email sign up, whatever the case', async () => {
    const email = uniqueEmail();
    await prisma.signupAllowlist.create({ data: { email } });
    const res = await post('/signup', { email: email.toUpperCase(), password: PASSWORD });
    expect(res.statusCode).toBe(200);
  });

  it('tells the web app which mode it is in', async () => {
    const res = await app.inject({ url: '/api/v1/auth/config' });
    expect(res.json()).toEqual({ signupMode: 'allowlist', googleSignIn: true });
  });
});

describe('login', () => {
  it('logs in with the right password', async () => {
    const user = await signup(app);
    const res = await post('/login', { email: user.email, password: PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
    expect(refreshCookie(res)).toBeTruthy();
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const user = await signup(app);
    const wrong = await post('/login', { email: user.email, password: 'wrong-password' });
    const unknown = await post('/login', { email: uniqueEmail(), password: 'wrong-password' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error.message).toBe(unknown.json().error.message);
  });

  it('blocks an email after repeated failures, even with the right password', async () => {
    const user = await signup(app);
    for (let i = 0; i < 10; i += 1)
      await post('/login', { email: user.email, password: 'wrong-password' });
    const res = await post('/login', { email: user.email, password: PASSWORD });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('too_many_attempts');
  });

  it('refuses a suspended user', async () => {
    const user = await signup(app);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'suspended' } });
    expect((await post('/login', { email: user.email, password: PASSWORD })).statusCode).toBe(401);
  });

  it('records logins in the audit log without the password', async () => {
    const user = await signup(app);
    await post('/login', { email: user.email, password: PASSWORD });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: user.id, action: 'auth.login' },
    });
    expect(JSON.stringify(row)).not.toContain(PASSWORD);
  });
});

describe('sessions', () => {
  it('gives a new access token and a new refresh token', async () => {
    const user = await signup(app);
    const res = await refreshWith(user.refreshToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
    expect(refreshCookie(res)).toBeTruthy();
    expect(refreshCookie(res)).not.toBe(user.refreshToken);
  });

  it('tolerates a second tab refreshing with the old token moments later', async () => {
    const user = await signup(app);
    await refreshWith(user.refreshToken);
    const second = await refreshWith(user.refreshToken);
    expect(second.statusCode).toBe(200);
    expect(refreshCookie(second)).toBeUndefined();
  });

  it('treats an old refresh token used later as theft, and ends the session', async () => {
    const user = await signup(app);
    const rotated = await refreshWith(user.refreshToken);
    const fresh = refreshCookie(rotated)!;

    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.session.update({
      where: { id: session.id },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });

    expect((await refreshWith(user.refreshToken)).statusCode).toBe(401);
    expect((await refreshWith(fresh)).statusCode).toBe(401);
    expect((await me(rotated.json().accessToken)).statusCode).toBe(401);
  });

  it('refuses a made-up refresh token', async () => {
    const user = await signup(app);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect((await refreshWith(`${session.id}.made-up`)).statusCode).toBe(401);
    expect((await refreshWith('rubbish')).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' })).statusCode).toBe(
      401,
    );
  });

  it('refuses a refresh from another website', async () => {
    const user = await signup(app);
    const res = await refreshWith(user.refreshToken, { origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
  });

  it('refuses an expired session', async () => {
    const user = await signup(app);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await refreshWith(user.refreshToken)).statusCode).toBe(401);
    expect((await me(user.accessToken)).statusCode).toBe(401);
  });

  it('logout ends the session straight away, even though the access token has not expired', async () => {
    const user = await signup(app);
    expect((await me(user.accessToken)).statusCode).toBe(200);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { rp_refresh: user.refreshToken },
    });
    expect(res.statusCode).toBe(200);
    expect((await me(user.accessToken)).statusCode).toBe(401);
    expect((await refreshWith(user.refreshToken)).statusCode).toBe(401);
  });

  it('logout from everywhere ends every device', async () => {
    const user = await signup(app);
    const other = await post('/login', { email: user.email, password: PASSWORD });
    await post('/logout-all', undefined, user.headers);
    expect((await me(user.accessToken)).statusCode).toBe(401);
    expect((await me(other.json().accessToken)).statusCode).toBe(401);
  });

  it('suspending a user locks them out on their next request', async () => {
    const user = await signup(app);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'suspended' } });
    expect((await me(user.accessToken)).statusCode).toBe(401);
  });
});

describe('email verification', () => {
  it('marks the email verified, and the link works once', async () => {
    const user = await signup(app);
    const token = tokenFromEmail(user.email, '/verify-email');
    expect((await post('/verify-email', { token })).statusCode).toBe(200);
    expect((await me(user.accessToken)).json().user.emailVerified).toBe(true);
    expect((await post('/verify-email', { token })).statusCode).toBe(400);
  });

  it('stores only a hash of the link', async () => {
    const user = await signup(app);
    const token = tokenFromEmail(user.email, '/verify-email');
    const rows = await prisma.oneTimeToken.findMany({ where: { userId: user.id } });
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('refuses an expired link', async () => {
    const user = await signup(app);
    const token = tokenFromEmail(user.email, '/verify-email');
    await prisma.oneTimeToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await post('/verify-email', { token })).statusCode).toBe(400);
  });

  it('can send the link again', async () => {
    const user = await signup(app);
    sentEmails.length = 0;
    expect((await post('/resend-verification', undefined, user.headers)).statusCode).toBe(200);
    expect(sentEmails).toHaveLength(1);
  });
});

describe('forgot and reset password', () => {
  it('answers the same for known and unknown emails, and only emails the known one', async () => {
    const user = await signup(app);
    sentEmails.length = 0;
    const known = await post('/forgot-password', { email: user.email });
    const unknown = await post('/forgot-password', { email: uniqueEmail() });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.body).toBe(unknown.body);
    expect(sentEmails.map((m) => m.to)).toEqual([user.email]);
  });

  it('sets the new password, ends every session, and verifies the email', async () => {
    const user = await signup(app);
    await post('/forgot-password', { email: user.email });
    const token = tokenFromEmail(user.email, '/reset-password');
    const res = await post('/reset-password', { token, password: 'a-brand-new-password' });
    expect(res.statusCode).toBe(200);

    expect((await me(user.accessToken)).statusCode).toBe(401);
    expect((await post('/login', { email: user.email, password: PASSWORD })).statusCode).toBe(401);
    const login = await post('/login', { email: user.email, password: 'a-brand-new-password' });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.emailVerified).toBe(true);
  });

  it('the reset link works once', async () => {
    const user = await signup(app);
    await post('/forgot-password', { email: user.email });
    const token = tokenFromEmail(user.email, '/reset-password');
    await post('/reset-password', { token, password: 'a-brand-new-password' });
    expect(
      (await post('/reset-password', { token, password: 'another-new-password' })).statusCode,
    ).toBe(400);
  });

  it('a verification link cannot be used to reset a password', async () => {
    const user = await signup(app);
    const token = tokenFromEmail(user.email, '/verify-email');
    expect(
      (await post('/reset-password', { token, password: 'a-brand-new-password' })).statusCode,
    ).toBe(400);
  });
});

describe('account', () => {
  it('changes the password when given the current one, and ends other devices only', async () => {
    const user = await signup(app);
    const other = await post('/login', { email: user.email, password: PASSWORD });
    const wrong = await post(
      '/change-password',
      { currentPassword: 'nope-nope-nope', newPassword: 'a-brand-new-password' },
      user.headers,
    );
    expect(wrong.statusCode).toBe(401);
    const res = await post(
      '/change-password',
      { currentPassword: PASSWORD, newPassword: 'a-brand-new-password' },
      user.headers,
    );
    expect(res.statusCode).toBe(200);
    expect((await me(user.accessToken)).statusCode).toBe(200);
    expect((await me(other.json().accessToken)).statusCode).toBe(401);
  });

  it('updates the name', async () => {
    const user = await signup(app);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: user.headers,
      payload: { name: 'New Name' },
    });
    expect(res.json().user.name).toBe('New Name');
  });

  it('deletes an account: it cannot log in, and the email is free again', async () => {
    const user = await signup(app);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/me',
      headers: user.headers,
      payload: { password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect((await me(user.accessToken)).statusCode).toBe(401);
    expect((await post('/login', { email: user.email, password: PASSWORD })).statusCode).toBe(401);
    await expect(signup(app, { email: user.email })).resolves.toBeTruthy();
  });

  it('needs the password to delete an account', async () => {
    const user = await signup(app);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/me',
      headers: user.headers,
      payload: { password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Google sign-in', () => {
  const code = (identity: { sub: string; email: string; emailVerified?: boolean; name?: string }) =>
    Buffer.from(JSON.stringify({ emailVerified: true, ...identity })).toString('base64url');

  async function start(query = '') {
    const res = await app.inject({ url: `/api/v1/auth/google/start${query}` });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    const state = location.searchParams.get('state')!;
    const nonce = res.cookies.find((c) => c.name === 'rp_google_signin')!.value;
    return { state, nonce };
  }

  async function callback(identity: Parameters<typeof code>[0], query = '') {
    const { state, nonce } = await start(query);
    return app.inject({
      url: `/api/v1/auth/google/callback?code=${code(identity)}&state=${encodeURIComponent(state)}`,
      cookies: { rp_google_signin: nonce },
    });
  }

  const errorOf = (res: { headers: Record<string, unknown> }) =>
    new URL(res.headers.location as string).searchParams.get('error');

  it('creates a verified account with a workspace, and sets the session cookie', async () => {
    const email = uniqueEmail();
    const res = await callback({ sub: 'google-1', email, name: 'Gail' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${env.APP_URL}/auth/callback`);
    expect(refreshCookie(res)).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { memberships: true, identities: true },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.memberships[0]?.role).toBe('owner');
    expect(user.identities[0]).toMatchObject({ provider: 'google', providerUserId: 'google-1' });
  });

  it('recognises a returning person by their Google id, even if their email changed', async () => {
    const first = uniqueEmail();
    await callback({ sub: 'google-2', email: first });
    const res = await callback({ sub: 'google-2', email: uniqueEmail() });
    expect(refreshCookie(res)).toBeTruthy();
    expect(await prisma.user.count()).toBe(1);
  });

  it('refuses a callback without the matching browser cookie', async () => {
    const { state } = await start();
    const res = await app.inject({
      url: `/api/v1/auth/google/callback?code=${code({ sub: 'x', email: uniqueEmail() })}&state=${encodeURIComponent(state)}`,
    });
    expect(errorOf(res)).toBe('google_state');
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses a forged state', async () => {
    const { nonce } = await start();
    const res = await app.inject({
      url: `/api/v1/auth/google/callback?code=${code({ sub: 'x', email: uniqueEmail() })}&state=forged.state`,
      cookies: { rp_google_signin: nonce },
    });
    expect(errorOf(res)).toBe('google_state');
  });

  it('refuses a Google account whose email is not verified', async () => {
    const res = await callback({ sub: 'google-3', email: uniqueEmail(), emailVerified: false });
    expect(errorOf(res)).toBe('google_unverified');
    expect(await prisma.user.count()).toBe(0);
  });

  it('links to an existing account whose email is verified', async () => {
    const user = await signup(app);
    await post('/verify-email', { token: tokenFromEmail(user.email, '/verify-email') });
    const res = await callback({ sub: 'google-4', email: user.email });
    expect(refreshCookie(res)).toBeTruthy();
    expect(await prisma.user.count()).toBe(1);
    const updated = (await me(user.accessToken)).json();
    expect(updated.user).toMatchObject({ hasPassword: true, hasGoogle: true });
  });

  it('will not link to an unverified account, so a stranger who signed up first keeps no access', async () => {
    const squatter = await signup(app);
    const res = await callback({ sub: 'google-5', email: squatter.email });
    expect(errorOf(res)).toBe('verify_first');
    expect(refreshCookie(res)).toBeUndefined();
    const identities = await prisma.authIdentity.findMany({ where: { provider: 'google' } });
    expect(identities).toHaveLength(0);
  });

  it('respects the signup allowlist for new people', async () => {
    env.SIGNUP_MODE = 'allowlist';
    const res = await callback({ sub: 'google-6', email: uniqueEmail() });
    expect(errorOf(res)).toBe('signup_not_allowed');
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses a suspended person', async () => {
    const email = uniqueEmail();
    await callback({ sub: 'google-7', email });
    await prisma.user.update({ where: { email }, data: { status: 'suspended' } });
    const res = await callback({ sub: 'google-7', email });
    expect(errorOf(res)).toBe('account_unavailable');
  });

  it('turns a provider failure into a friendly redirect', async () => {
    const { state, nonce } = await start();
    const res = await app.inject({
      url: `/api/v1/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      cookies: { rp_google_signin: nonce },
    });
    expect(errorOf(res)).toBe('google_failed');
  });

  it('can set a password on a Google-only account without a current password', async () => {
    const email = uniqueEmail();
    const res = await callback({ sub: 'google-8', email });
    const refreshed = await refreshWith(refreshCookie(res)!);
    const headers = bearer(refreshed.json().accessToken);
    const change = await post('/change-password', { newPassword: 'a-brand-new-password' }, headers);
    expect(change.statusCode).toBe(200);
    expect((await post('/login', { email, password: 'a-brand-new-password' })).statusCode).toBe(
      200,
    );
  });
});

vi.setConfig({ testTimeout: 30000 });
