import { hasAtLeast, uuidSchema } from '@replypilot/shared';
import type { User } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { HttpError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type { MemberContext } from '../modules/workspaces/access';

export type AccessLevel = 'public' | 'authenticated' | 'member' | 'admin' | 'owner';

const WORKSPACE_LEVELS: AccessLevel[] = ['member', 'admin', 'owner'];

export interface AuthContext {
  userId: string;
  sessionId: string;
  user: User;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: AccessLevel;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
    member: MemberContext | null;
  }
  interface FastifyInstance {
    routeAccess: { method: string; url: string; access: AccessLevel }[];
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; sid: string };
    user: { sub: string; sid: string };
  }
}

const unauthorized = () => new HttpError(401, 'Please log in', 'unauthorized');

// The session and user are read on every request, so logout, password reset and suspension
// take effect straight away rather than when the access token runs out.
async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized();
  }
  const { sub, sid } = request.user;
  const session = await prisma.session.findUnique({ where: { id: sid }, include: { user: true } });
  const usable =
    session &&
    session.userId === sub &&
    !session.revokedAt &&
    session.expiresAt > new Date() &&
    !session.user.deletedAt &&
    session.user.status === 'active';
  if (!usable) throw unauthorized();
  request.auth = { userId: sub, sessionId: sid, user: session.user };
}

// Read fresh on every request, so removing someone or changing their role applies immediately.
async function loadMember(
  request: FastifyRequest,
  minimum: 'member' | 'admin' | 'owner',
): Promise<void> {
  const { workspaceId } = request.params as { workspaceId?: string };
  if (!uuidSchema.safeParse(workspaceId).success || !workspaceId) throw notFound();

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: request.auth!.userId } },
    include: { workspace: true, locations: { select: { locationId: true } } },
  });
  if (
    !member ||
    member.removedAt ||
    member.workspace.deletedAt ||
    member.workspace.status !== 'active'
  ) {
    throw notFound();
  }
  if (!hasAtLeast(member.role, minimum)) {
    throw new HttpError(403, 'You do not have permission to do that', 'forbidden');
  }
  request.member = {
    id: member.id,
    workspaceId,
    userId: member.userId,
    role: member.role,
    scopeAllLocations: member.scopeAllLocations,
    locationIds: member.locations.map((location) => location.locationId),
  };
}

export const accessPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('routeAccess', []);
  app.decorateRequest('auth', null);
  app.decorateRequest('member', null);

  // Every route must say who can reach it, or the app won't start. A forgotten rule can't become a public route.
  app.addHook('onRoute', (route) => {
    const label = `${[route.method].flat().join(',')} ${route.url}`;
    const access = route.config?.access;
    if (!access) throw new Error(`${label} must declare config.access`);
    if (WORKSPACE_LEVELS.includes(access) && !route.url.includes(':workspaceId')) {
      throw new Error(`${label} uses a workspace rule, so its URL needs :workspaceId`);
    }
    app.routeAccess.push({ method: [route.method].flat().join(','), url: route.url, access });
  });

  app.addHook('onRequest', async (request) => {
    const access = request.routeOptions.config.access;
    if (!access || access === 'public') return;
    await authenticate(request);
    if (access !== 'authenticated') await loadMember(request, access);
  });
});

export function currentAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

export function currentMember(request: FastifyRequest): MemberContext {
  if (!request.member) throw notFound();
  return request.member;
}

// Connecting Google or posting acts publicly under the business's name, so the email must be real.
export function assertEmailVerified(request: FastifyRequest): void {
  if (!currentAuth(request).user.emailVerifiedAt) {
    throw new HttpError(403, 'Please confirm your email first', 'email_not_verified');
  }
}
