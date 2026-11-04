import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config';
import { allowSignup, disallowSignup, listAllowedSignups } from '../../src/modules/auth/allowlist';
import { signup, testApp, tokenFromEmail, uniqueEmail, type TestUser } from '../helpers/app';
import { resetDb } from '../helpers/db';

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  env.SIGNUP_MODE = 'open';
});

const realMethod = (method: string) => method.split(',').find((m) => m !== 'HEAD') ?? method;
const routes = () => app.routeAccess.filter((route) => route.method !== 'HEAD');

function fill(url: string, workspaceId: string): string {
  return url.replace(':workspaceId', workspaceId).replace(/:[a-zA-Z]+/g, () => randomUUID());
}

const hit = (route: { method: string; url: string }, workspaceId: string, user?: TestUser) =>
  app.inject({
    method: realMethod(route.method) as 'GET',
    url: fill(route.url, workspaceId),
    headers: user?.headers ?? {},
    ...(realMethod(route.method) === 'GET' ? {} : { payload: {} }),
  });

// Every public route, on purpose. Adding one means adding it here, where it gets noticed in review.
const EXPECTED_PUBLIC = [
  'GET /api/v1/health',
  'GET /api/v1/auth/config',
  'POST /api/v1/auth/signup',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  'GET /api/v1/auth/google/start',
  'GET /api/v1/auth/google/callback',
  'GET /api/v1/invitations/preview',
  'GET /api/v1/google/callback',
];

async function invite(owner: TestUser, role: 'admin' | 'member') {
  const email = uniqueEmail(role);
  await app.inject({ method: 'POST', url: `/api/v1/workspaces/${owner.workspaceId}/invitations`, headers: owner.headers, payload: { email, role } });
  return signup(app, { email, inviteToken: tokenFromEmail(email, '/invite') });
}

describe('every route', () => {
  it('has only the public routes we meant to have', () => {
    const publicRoutes = routes()
      .filter((route) => route.access === 'public')
      .map((route) => `${realMethod(route.method)} ${route.url}`);
    expect(publicRoutes.sort()).toEqual([...EXPECTED_PUBLIC].sort());
  });

  it('refuses anonymous visitors on everything that is not public', async () => {
    const owner = await signup(app);
    const protectedRoutes = routes().filter((route) => route.access !== 'public');
    expect(protectedRoutes.length).toBeGreaterThan(30);
    for (const route of protectedRoutes) {
      const res = await hit(route, owner.workspaceId);
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(401);
    }
  });

  it('answers 404 on every workspace route for someone outside the workspace', async () => {
    const owner = await signup(app);
    const outsider = await signup(app);
    const workspaceRoutes = routes().filter((route) => route.url.includes(':workspaceId'));
    expect(workspaceRoutes.length).toBeGreaterThan(25);
    for (const route of workspaceRoutes) {
      const res = await hit(route, owner.workspaceId, outsider);
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(404);
    }
  });

  it('refuses a member on every admin and owner route', async () => {
    const owner = await signup(app);
    const member = await invite(owner, 'member');
    for (const route of routes().filter((r) => r.access === 'admin' || r.access === 'owner')) {
      const res = await hit(route, owner.workspaceId, member);
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(403);
    }
  });

  it('refuses an admin on every owner route', async () => {
    const owner = await signup(app);
    const admin = await invite(owner, 'admin');
    const ownerRoutes = routes().filter((r) => r.access === 'owner');
    expect(ownerRoutes.length).toBeGreaterThan(0);
    for (const route of ownerRoutes) {
      const res = await hit(route, owner.workspaceId, admin);
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(403);
    }
  });
});

describe('signup allowlist tool', () => {
  it('adds, normalises, lists and removes', async () => {
    await allowSignup('  Owner@Business.TEST ', 'Corner Shop');
    expect((await listAllowedSignups()).map((row) => row.email)).toEqual(['owner@business.test']);
    expect(await disallowSignup('OWNER@business.test')).toBe(true);
    expect(await disallowSignup('owner@business.test')).toBe(false);
  });
});
