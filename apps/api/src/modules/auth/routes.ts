import {
  authConfigResponse,
  changePasswordBody,
  deleteAccountBody,
  forgotPasswordBody,
  loginBody,
  meResponse,
  okResponse,
  resetPasswordBody,
  sessionResponse,
  signupBody,
  updateProfileBody,
  verifyEmailBody,
} from '@replypilot/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../config';
import { recordAudit } from '../../lib/audit';
import { randomToken, safeEqual } from '../../lib/crypto';
import { HttpError } from '../../lib/errors';
import { signState, verifyState } from '../../lib/signed-state';
import { currentAuth } from '../../plugins/access';
import { googleIdentity, googleSignInEnabled } from '../../providers/google-identity';
import { signInWithGoogle } from './google';
import * as auth from './service';
import { createSession, revokeAllSessions, revokeByToken, rotateSession } from './sessions';

const REFRESH_COOKIE = 'rp_refresh';
const REFRESH_PATH = '/api/v1/auth';
const REFRESH_MAX_AGE = 30 * 86_400;
const GOOGLE_COOKIE = 'rp_google_signin';
const GOOGLE_COOKIE_PATH = '/api/v1/auth/google';

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: REFRESH_PATH,
    maxAge: REFRESH_MAX_AGE,
  });
}

// The refresh cookie is sent automatically by the browser, so these routes also check the request
// really came from our own pages.
function assertSameOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  if (origin && origin !== env.APP_URL) throw new HttpError(403, 'Request refused', 'bad_origin');
}

const sessionMeta = (request: FastifyRequest) => ({ ip: request.ip, userAgent: request.headers['user-agent'] });

const strict = (max: number) => ({ max, timeWindow: '1 minute' });

export async function authRoutes(instance: FastifyInstance): Promise<void> {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  async function startSession(request: FastifyRequest, reply: FastifyReply, userId: string) {
    const { session, refreshToken } = await createSession(userId, sessionMeta(request));
    setRefreshCookie(reply, refreshToken);
    return { accessToken: app.jwt.sign({ sub: userId, sid: session.id }), ...(await auth.me(userId)) };
  }

  app.get(
    '/config',
    { config: { access: 'public' }, schema: { response: { 200: authConfigResponse } } },
    async () => ({ signupMode: env.SIGNUP_MODE, googleSignIn: googleSignInEnabled() }),
  );

  app.post(
    '/signup',
    { config: { access: 'public', rateLimit: strict(20) }, schema: { body: signupBody, response: { 200: sessionResponse } } },
    async (request, reply) => startSession(request, reply, await auth.signup(request.body, request.log, request.ip)),
  );

  app.post(
    '/login',
    { config: { access: 'public', rateLimit: strict(30) }, schema: { body: loginBody, response: { 200: sessionResponse } } },
    async (request, reply) =>
      startSession(request, reply, await auth.login(request.body.email, request.body.password, request.ip)),
  );

  app.post(
    '/refresh',
    { config: { access: 'public', rateLimit: strict(120) }, schema: { response: { 200: sessionResponse } } },
    async (request, reply) => {
      assertSameOrigin(request);
      const token = request.cookies[REFRESH_COOKIE];
      if (!token) throw new HttpError(401, 'Please log in', 'unauthorized');
      const { session, refreshToken } = await rotateSession(token);
      if (refreshToken) setRefreshCookie(reply, refreshToken);
      return {
        accessToken: app.jwt.sign({ sub: session.userId, sid: session.id }),
        ...(await auth.me(session.userId)),
      };
    },
  );

  app.post('/logout', { config: { access: 'public' }, schema: { response: { 200: okResponse } } }, async (request, reply) => {
    assertSameOrigin(request);
    await revokeByToken(request.cookies[REFRESH_COOKIE]);
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    return { ok: true as const };
  });

  app.post(
    '/logout-all',
    { config: { access: 'authenticated' }, schema: { response: { 200: okResponse } } },
    async (request, reply) => {
      await revokeAllSessions(currentAuth(request).userId);
      reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
      return { ok: true as const };
    },
  );

  app.get('/me', { config: { access: 'authenticated' }, schema: { response: { 200: meResponse } } }, async (request) =>
    auth.me(currentAuth(request).userId),
  );

  app.patch(
    '/me',
    { config: { access: 'authenticated' }, schema: { body: updateProfileBody, response: { 200: meResponse } } },
    async (request) => {
      const { userId } = currentAuth(request);
      await auth.updateProfile(userId, request.body.name);
      return auth.me(userId);
    },
  );

  app.delete(
    '/me',
    { config: { access: 'authenticated' }, schema: { body: deleteAccountBody, response: { 200: okResponse } } },
    async (request, reply) => {
      await auth.deleteAccount(currentAuth(request).userId, request.body.password, request.ip);
      reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
      return { ok: true as const };
    },
  );

  app.post(
    '/change-password',
    { config: { access: 'authenticated', rateLimit: strict(10) }, schema: { body: changePasswordBody, response: { 200: okResponse } } },
    async (request) => {
      const { userId, sessionId } = currentAuth(request);
      await auth.changePassword(userId, sessionId, request.body.currentPassword, request.body.newPassword, request.ip);
      return { ok: true as const };
    },
  );

  app.post(
    '/verify-email',
    { config: { access: 'public', rateLimit: strict(20) }, schema: { body: verifyEmailBody, response: { 200: okResponse } } },
    async (request) => {
      await auth.verifyEmail(request.body.token);
      return { ok: true as const };
    },
  );

  app.post(
    '/resend-verification',
    { config: { access: 'authenticated', rateLimit: strict(5) }, schema: { response: { 200: okResponse } } },
    async (request) => {
      await auth.resendVerification(currentAuth(request).userId, request.log);
      return { ok: true as const };
    },
  );

  app.post(
    '/forgot-password',
    { config: { access: 'public', rateLimit: strict(5) }, schema: { body: forgotPasswordBody, response: { 200: okResponse } } },
    async (request) => {
      await auth.forgotPassword(request.body.email, request.log);
      return { ok: true as const };
    },
  );

  app.post(
    '/reset-password',
    { config: { access: 'public', rateLimit: strict(10) }, schema: { body: resetPasswordBody, response: { 200: okResponse } } },
    async (request) => {
      await auth.resetPassword(request.body.token, request.body.password, request.ip);
      return { ok: true as const };
    },
  );

  app.get(
    '/google/start',
    { config: { access: 'public', rateLimit: strict(30) }, schema: { querystring: z.object({ invite: z.string().optional() }) } },
    async (request, reply) => {
      if (!googleSignInEnabled()) throw new HttpError(404, 'Not found', 'not_found');
      const nonce = randomToken();
      const state = signState('google-signin', { nonce, invite: request.query.invite }, 600);
      reply.setCookie(GOOGLE_COOKIE, nonce, {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        // Lax, because the browser must send this when Google redirects back to us.
        sameSite: 'lax',
        path: GOOGLE_COOKIE_PATH,
        maxAge: 600,
      });
      return reply.redirect(googleIdentity().getAuthUrl(state));
    },
  );

  app.get(
    '/google/callback',
    {
      config: { access: 'public', rateLimit: strict(30) },
      schema: { querystring: z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }) },
    },
    async (request, reply) => {
      const fail = (error: string) => reply.redirect(`${env.APP_URL}/login?error=${error}`);
      const { code, state, error } = request.query;

      const payload = verifyState('google-signin', state);
      const cookie = request.cookies[GOOGLE_COOKIE];
      reply.clearCookie(GOOGLE_COOKIE, { path: GOOGLE_COOKIE_PATH });
      if (!payload || !cookie || !safeEqual(cookie, String(payload.nonce))) return fail('google_state');
      if (error || !code) return fail('google_failed');

      try {
        const identity = await googleIdentity().exchangeCode(code);
        const invite = typeof payload.invite === 'string' ? payload.invite : undefined;
        const result = await signInWithGoogle(identity, invite, request.ip);
        if (!result.ok) return fail(result.error);
        const { refreshToken } = await createSession(result.userId, sessionMeta(request));
        setRefreshCookie(reply, refreshToken);
        // Someone who already had an account still has to accept, on the page that checks it's for them.
        const pending = invite && !result.joinedInvitation ? `?invite=${encodeURIComponent(invite)}` : '';
        return reply.redirect(`${env.APP_URL}/auth/callback${pending}`);
      } catch (err) {
        request.log.warn({ err }, 'google sign-in failed');
        await recordAudit({ action: 'auth.google_failed', ip: request.ip });
        return fail('google_failed');
      }
    },
  );
}
