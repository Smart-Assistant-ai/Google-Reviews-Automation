import {
  activityQuery,
  activityResponse,
  acceptInvitationBody,
  createInvitationBody,
  createWorkspaceBody,
  createdInvitationResponse,
  invitationListResponse,
  invitationPreviewResponse,
  meResponse,
  memberListResponse,
  memberSchema,
  okResponse,
  transferOwnershipBody,
  updateMemberBody,
  updateWorkspaceBody,
  uuidSchema,
  workspaceListResponse,
  workspaceSchema,
} from '@replypilot/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentAuth, currentMember } from '../../plugins/access';
import { me } from '../auth/service';
import * as invitations from './invitations';
import * as workspaces from './service';

const workspaceParams = z.object({ workspaceId: uuidSchema });
const memberParams = workspaceParams.extend({ memberId: uuidSchema });
const invitationParams = workspaceParams.extend({ invitationId: uuidSchema });

export async function workspaceRoutes(instance: FastifyInstance): Promise<void> {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get('/', { config: { access: 'authenticated' }, schema: { response: { 200: workspaceListResponse } } }, async (request) => ({
    workspaces: await workspaces.listWorkspaces(currentAuth(request).userId),
  }));

  app.post(
    '/',
    { config: { access: 'authenticated' }, schema: { body: createWorkspaceBody, response: { 200: workspaceSchema } } },
    async (request) => workspaces.createWorkspace(currentAuth(request).userId, request.body.name, request.ip),
  );

  app.get(
    '/:workspaceId',
    { config: { access: 'member' }, schema: { params: workspaceParams, response: { 200: workspaceSchema } } },
    async (request) => workspaces.getWorkspace(currentMember(request)),
  );

  app.patch(
    '/:workspaceId',
    { config: { access: 'admin' }, schema: { params: workspaceParams, body: updateWorkspaceBody, response: { 200: workspaceSchema } } },
    async (request) => workspaces.renameWorkspace(currentMember(request), request.body.name, request.ip),
  );

  app.delete(
    '/:workspaceId',
    { config: { access: 'owner' }, schema: { params: workspaceParams, response: { 200: okResponse } } },
    async (request) => {
      await workspaces.deleteWorkspace(currentMember(request), request.ip);
      return { ok: true as const };
    },
  );

  app.post(
    '/:workspaceId/leave',
    { config: { access: 'member' }, schema: { params: workspaceParams, response: { 200: okResponse } } },
    async (request) => {
      await workspaces.leaveWorkspace(currentMember(request), request.ip);
      return { ok: true as const };
    },
  );

  app.post(
    '/:workspaceId/transfer-ownership',
    { config: { access: 'owner' }, schema: { params: workspaceParams, body: transferOwnershipBody, response: { 200: okResponse } } },
    async (request) => {
      await workspaces.transferOwnership(currentMember(request), request.body.memberId, request.ip);
      return { ok: true as const };
    },
  );

  app.get(
    '/:workspaceId/members',
    { config: { access: 'member' }, schema: { params: workspaceParams, response: { 200: memberListResponse } } },
    async (request) => ({ members: await workspaces.listMembers(currentMember(request)) }),
  );

  app.patch(
    '/:workspaceId/members/:memberId',
    { config: { access: 'admin' }, schema: { params: memberParams, body: updateMemberBody, response: { 200: memberSchema } } },
    async (request) => workspaces.updateMember(currentMember(request), request.params.memberId, request.body, request.ip),
  );

  app.delete(
    '/:workspaceId/members/:memberId',
    { config: { access: 'admin' }, schema: { params: memberParams, response: { 200: okResponse } } },
    async (request) => {
      await workspaces.removeMember(currentMember(request), request.params.memberId, request.ip);
      return { ok: true as const };
    },
  );

  app.get(
    '/:workspaceId/invitations',
    { config: { access: 'admin' }, schema: { params: workspaceParams, response: { 200: invitationListResponse } } },
    async (request) => ({ invitations: await invitations.listInvitations(currentMember(request)) }),
  );

  app.post(
    '/:workspaceId/invitations',
    {
      config: { access: 'admin', rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: workspaceParams, body: createInvitationBody, response: { 200: createdInvitationResponse } },
    },
    async (request) => invitations.createInvitation(currentMember(request), request.body, request.log, request.ip),
  );

  app.delete(
    '/:workspaceId/invitations/:invitationId',
    { config: { access: 'admin' }, schema: { params: invitationParams, response: { 200: okResponse } } },
    async (request) => {
      await invitations.revokeInvitation(currentMember(request), request.params.invitationId, request.ip);
      return { ok: true as const };
    },
  );

  app.get(
    '/:workspaceId/activity',
    { config: { access: 'admin' }, schema: { params: workspaceParams, querystring: activityQuery, response: { 200: activityResponse } } },
    async (request) => ({ items: await workspaces.listActivity(currentMember(request), request.query.limit) }),
  );
}

export async function invitationRoutes(instance: FastifyInstance): Promise<void> {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/preview',
    {
      config: { access: 'public', rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { querystring: z.object({ token: z.string().min(1) }), response: { 200: invitationPreviewResponse } },
    },
    async (request) => invitations.previewInvitation(request.query.token),
  );

  app.post(
    '/accept',
    { config: { access: 'authenticated' }, schema: { body: acceptInvitationBody, response: { 200: meResponse } } },
    async (request) => {
      const { userId, user } = currentAuth(request);
      await invitations.acceptInvitation(userId, user.email, request.body.token, request.ip);
      return me(userId);
    },
  );
}
