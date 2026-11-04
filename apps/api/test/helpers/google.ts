import type { FastifyInstance } from 'fastify';
import { prisma } from '../../src/lib/prisma';
import { tokenFromEmail, type TestUser } from './app';

export type Scenario = 'single' | 'multi' | 'groups' | 'none' | 'many';

export async function verifyEmail(app: FastifyInstance, user: TestUser): Promise<void> {
  const token = tokenFromEmail(user.email, '/verify-email');
  await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token } });
}

export const mockCode = (scenario: Scenario, email: string) =>
  Buffer.from(JSON.stringify({ scenario, email })).toString('base64url');

// Walks the real connect flow: start, then the browser comes back from Google with the cookie.
export async function connectGoogle(
  app: FastifyInstance,
  user: TestUser,
  options: { scenario?: Scenario; email?: string; workspaceId?: string } = {},
) {
  const workspaceId = options.workspaceId ?? user.workspaceId;
  const start = await app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${workspaceId}/google/connections/start`,
    headers: user.headers,
  });
  if (start.statusCode !== 200) throw new Error(`start failed: ${start.statusCode} ${start.body}`);
  const state = new URL(start.json().url).searchParams.get('state')!;
  const nonce = start.cookies.find((c) => c.name === 'rp_google_connect')!.value;
  const code = mockCode(options.scenario ?? 'single', options.email ?? 'owner@sample.test');
  const callback = await app.inject({
    url: `/api/v1/google/callback?code=${code}&state=${encodeURIComponent(state)}`,
    cookies: { rp_google_connect: nonce },
  });
  return { callback, redirect: new URL(callback.headers.location as string) };
}

export async function googleStatus(
  app: FastifyInstance,
  user: TestUser,
  workspaceId = user.workspaceId,
) {
  const res = await app.inject({
    url: `/api/v1/workspaces/${workspaceId}/google/status`,
    headers: user.headers,
  });
  return res.json() as {
    connections: {
      id: string;
      email: string;
      status: string;
      sample: boolean;
      apiError: string | null;
      locationCount: number;
    }[];
    locations: {
      id: string;
      title: string;
      status: string;
      connectionId: string;
      alternativeConnections: { id: string }[];
      lastSyncError: string | null;
    }[];
  };
}

export async function selectLocations(app: FastifyInstance, user: TestUser, locationIds: string[]) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/workspaces/${user.workspaceId}/google/locations/select`,
    headers: user.headers,
    payload: { locationIds },
  });
}

export const reviewCount = (workspaceId: string) => prisma.review.count({ where: { workspaceId } });
