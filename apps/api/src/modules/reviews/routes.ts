import {
  okResponse,
  postReplyBody,
  regenerateReplyBody,
  reviewListQuery,
  reviewListResponse,
  reviewSchema,
  saveReplyBody,
  simulateReviewBody,
  statsQuery,
  statsResponse,
  uuidSchema,
  voiceBody,
  voiceQuery,
  voiceResponse,
} from '@replypilot/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { assertEmailVerified, currentMember } from '../../plugins/access';
import { mockGbp } from '../../providers/gbp/mock';
import { usesFakeData } from '../google/connection.service';
import { syncLocation } from '../google/sync.service';
import { assertLocationAccess } from '../workspaces/access';
import { deleteReply, postReply, regenerate, saveDraft } from './replies.service';
import { getReview, listReviews } from './reviews.service';
import { overview } from './stats.service';
import { clearLocationVoice, getVoice, updateDefaultVoice, updateLocationVoice } from './voice.service';

const workspaceParams = z.object({ workspaceId: uuidSchema });
const reviewParams = workspaceParams.extend({ reviewId: uuidSchema });
const locationParams = workspaceParams.extend({ locationId: uuidSchema });

export async function reviewRoutes(instance: FastifyInstance): Promise<void> {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/reviews',
    { config: { access: 'member' }, schema: { params: workspaceParams, querystring: reviewListQuery, response: { 200: reviewListResponse } } },
    async (request) => listReviews(currentMember(request), request.query),
  );

  app.get(
    '/reviews/:reviewId',
    { config: { access: 'member' }, schema: { params: reviewParams, response: { 200: reviewSchema } } },
    async (request) => getReview(currentMember(request), request.params.reviewId),
  );

  app.put(
    '/reviews/:reviewId/reply',
    { config: { access: 'member' }, schema: { params: reviewParams, body: saveReplyBody, response: { 200: reviewSchema } } },
    async (request) => {
      const member = currentMember(request);
      await saveDraft(member, request.params.reviewId, request.body.text, request.ip);
      return getReview(member, request.params.reviewId);
    },
  );

  app.post(
    '/reviews/:reviewId/reply/regenerate',
    {
      config: { access: 'member', rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: reviewParams, body: regenerateReplyBody, response: { 200: reviewSchema } },
    },
    async (request) => {
      const member = currentMember(request);
      await regenerate(member, request.params.reviewId, request.body.instructions, request.ip);
      return getReview(member, request.params.reviewId);
    },
  );

  app.post(
    '/reviews/:reviewId/reply/post',
    { config: { access: 'member' }, schema: { params: reviewParams, body: postReplyBody, response: { 200: reviewSchema } } },
    async (request) => {
      assertEmailVerified(request);
      const member = currentMember(request);
      await postReply(member, request.params.reviewId, request.body.text, request.ip);
      return getReview(member, request.params.reviewId);
    },
  );

  app.delete(
    '/reviews/:reviewId/reply',
    { config: { access: 'member' }, schema: { params: reviewParams, response: { 200: reviewSchema } } },
    async (request) => {
      assertEmailVerified(request);
      const member = currentMember(request);
      await deleteReply(member, request.params.reviewId, request.ip);
      return getReview(member, request.params.reviewId);
    },
  );

  app.get(
    '/stats',
    { config: { access: 'member' }, schema: { params: workspaceParams, querystring: statsQuery, response: { 200: statsResponse } } },
    async (request) => overview(currentMember(request), request.query),
  );

  app.get(
    '/voice',
    { config: { access: 'member' }, schema: { params: workspaceParams, querystring: voiceQuery, response: { 200: voiceResponse } } },
    async (request) => getVoice(currentMember(request), request.query.locationId),
  );

  app.put(
    '/voice',
    { config: { access: 'admin' }, schema: { params: workspaceParams, body: voiceBody, response: { 200: voiceResponse } } },
    async (request) => updateDefaultVoice(currentMember(request), request.body, request.ip),
  );

  app.put(
    '/voice/locations/:locationId',
    { config: { access: 'member' }, schema: { params: locationParams, body: voiceBody, response: { 200: voiceResponse } } },
    async (request) => updateLocationVoice(currentMember(request), request.params.locationId, request.body, request.ip),
  );

  app.delete(
    '/voice/locations/:locationId',
    { config: { access: 'member' }, schema: { params: locationParams, response: { 200: voiceResponse } } },
    async (request) => clearLocationVoice(currentMember(request), request.params.locationId, request.ip),
  );

  // Demo helper for sample data only. A real location answers 404.
  app.post(
    '/dev/simulate-review',
    { config: { access: 'member' }, schema: { params: workspaceParams, body: simulateReviewBody, response: { 200: okResponse } } },
    async (request) => {
      const member = currentMember(request);
      const { locationId, ...overrides } = request.body;
      await assertLocationAccess(member, locationId);
      const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId }, include: { connection: true } });
      if (!usesFakeData(location.connection)) throw notFound();
      mockGbp.simulateNewReview(location.googleAccountName, location.googleLocationName, overrides);
      await syncLocation(locationId);
      return { ok: true as const };
    },
  );
}
