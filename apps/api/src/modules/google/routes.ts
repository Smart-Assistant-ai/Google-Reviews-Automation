import {
  disconnectPreviewResponse,
  googleStatusResponse,
  okResponse,
  selectLocationsBody,
  startConnectResponse,
  switchConnectionBody,
  syncBody,
  syncResponse,
  uuidSchema,
} from '@replypilot/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../config';
import { randomToken } from '../../lib/crypto';
import { prisma } from '../../lib/prisma';
import { GOOGLE_COOKIE_PATH } from '../../lib/google-redirect';
import { signState } from '../../lib/signed-state';
import { assertEmailVerified, currentMember } from '../../plugins/access';
import { registerGoogleCallbackFlow } from '../auth/google-callback';
import { accessibleLocationIds, assertLocationAccess } from '../workspaces/access';
import {
  callbackUrl,
  completeConnect,
  disconnect,
  rescan,
  startUrl,
  stopSampleData,
  useSampleData,
} from './connect.service';
import {
  deactivateLocation,
  disconnectPreview,
  googleStatus,
  selectLocations,
  switchConnection,
} from './locations.service';
import { syncLocation } from './sync.service';

const CONNECT_COOKIE = 'rp_google_connect';

const workspaceParams = z.object({ workspaceId: uuidSchema });
const connectionParams = workspaceParams.extend({ connectionId: uuidSchema });
const locationParams = workspaceParams.extend({ locationId: uuidSchema });

const ok = { ok: true as const };

export async function googleRoutes(instance: FastifyInstance): Promise<void> {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/status',
    {
      config: { access: 'member' },
      schema: { params: workspaceParams, response: { 200: googleStatusResponse } },
    },
    async (request) => googleStatus(currentMember(request)),
  );

  app.post(
    '/connections/start',
    {
      config: { access: 'admin' },
      schema: { params: workspaceParams, response: { 200: startConnectResponse } },
    },
    async (request, reply) => {
      assertEmailVerified(request);
      const member = currentMember(request);
      const nonce = randomToken();
      const state = signState(
        'google-connect',
        { nonce, workspaceId: member.workspaceId, userId: member.userId },
        600,
      );
      // Ties the Google redirect to this browser, so a link can't be sent to a victim to finish.
      reply.setCookie(CONNECT_COOKIE, nonce, {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'lax',
        path: GOOGLE_COOKIE_PATH,
        maxAge: 600,
      });
      return startUrl(state);
    },
  );

  app.post(
    '/connections/:connectionId/rescan',
    {
      config: { access: 'admin' },
      schema: { params: connectionParams, response: { 200: googleStatusResponse } },
    },
    async (request) => {
      await rescan(currentMember(request), request.params.connectionId);
      return googleStatus(currentMember(request));
    },
  );

  app.post(
    '/connections/:connectionId/sample-data',
    {
      config: { access: 'admin' },
      schema: { params: connectionParams, response: { 200: googleStatusResponse } },
    },
    async (request) => {
      await useSampleData(currentMember(request), request.params.connectionId, request.ip);
      return googleStatus(currentMember(request));
    },
  );

  app.delete(
    '/connections/:connectionId/sample-data',
    {
      config: { access: 'admin' },
      schema: { params: connectionParams, response: { 200: googleStatusResponse } },
    },
    async (request) => {
      await stopSampleData(currentMember(request), request.params.connectionId, request.ip);
      return googleStatus(currentMember(request));
    },
  );

  app.get(
    '/connections/:connectionId/disconnect-preview',
    {
      config: { access: 'admin' },
      schema: { params: connectionParams, response: { 200: disconnectPreviewResponse } },
    },
    async (request) => disconnectPreview(currentMember(request), request.params.connectionId),
  );

  app.delete(
    '/connections/:connectionId',
    {
      config: { access: 'admin' },
      schema: { params: connectionParams, response: { 200: okResponse } },
    },
    async (request) => {
      await disconnect(currentMember(request), request.params.connectionId, request.ip);
      return ok;
    },
  );

  app.post(
    '/locations/select',
    {
      config: { access: 'admin' },
      schema: {
        params: workspaceParams,
        body: selectLocationsBody,
        response: { 200: googleStatusResponse },
      },
    },
    async (request) => {
      await selectLocations(currentMember(request), request.body.locationIds, request.ip);
      return googleStatus(currentMember(request));
    },
  );

  app.post(
    '/locations/:locationId/deactivate',
    {
      config: { access: 'admin' },
      schema: { params: locationParams, response: { 200: googleStatusResponse } },
    },
    async (request) => {
      await deactivateLocation(currentMember(request), request.params.locationId, request.ip);
      return googleStatus(currentMember(request));
    },
  );

  app.patch(
    '/locations/:locationId/connection',
    {
      config: { access: 'admin' },
      schema: {
        params: locationParams,
        body: switchConnectionBody,
        response: { 200: googleStatusResponse },
      },
    },
    async (request) => {
      await switchConnection(
        currentMember(request),
        request.params.locationId,
        request.body.connectionId,
        request.ip,
      );
      return googleStatus(currentMember(request));
    },
  );

  app.post(
    '/sync',
    {
      config: { access: 'member', rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: workspaceParams, body: syncBody, response: { 200: syncResponse } },
    },
    async (request) => {
      const member = currentMember(request);
      if (request.body.locationId) await assertLocationAccess(member, request.body.locationId);
      const ids = request.body.locationId
        ? [request.body.locationId]
        : await accessibleLocationIds(member);
      const active = await prisma.location.findMany({
        where: { id: { in: ids }, status: 'active' },
        select: { id: true },
      });
      let fetched = 0;
      let created = 0;
      for (const location of active) {
        const result = await syncLocation(location.id);
        fetched += result.fetched;
        created += result.created;
      }
      return { synced: active.length, fetched, created };
    },
  );
}

const connectResult = (workspaceId: string | undefined, query: string) =>
  `${callbackUrl()}?${query}${workspaceId ? `&workspace=${workspaceId}` : ''}`;

registerGoogleCallbackFlow({
  purpose: 'google-connect',
  cookie: CONNECT_COOKIE,
  failUrl: (reason, payload) =>
    connectResult(
      payload ? String(payload.workspaceId) : undefined,
      `google_connected=false&error=${reason}`,
    ),
  async handle(request, reply, payload, { code, error }) {
    const workspaceId = String(payload.workspaceId);
    const userId = String(payload.userId);
    const fail = (reason: string) =>
      reply.redirect(connectResult(workspaceId, `google_connected=false&error=${reason}`));

    // They may have lost admin in the minutes since starting.
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member || member.removedAt || member.role === 'member') {
      return reply.redirect(connectResult(undefined, 'google_connected=false&error=google_state'));
    }

    if (error || !code) return fail('google_denied');
    try {
      const connectionId = await completeConnect(workspaceId, userId, code, request.ip);
      return reply.redirect(
        connectResult(workspaceId, `google_connected=true&connection=${connectionId}`),
      );
    } catch (err) {
      request.log.warn({ err }, 'google connect failed');
      return fail('google_failed');
    }
  },
});
