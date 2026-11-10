import { GOOGLE_REPLY_MAX_BYTES, byteLength } from '@replypilot/shared';
import { env } from '../../config';
import { recordAudit } from '../../lib/audit';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { replyEdits } from '../../providers/gbp/limits';
import { getContext, markNeedsReconnect, usesFakeData } from '../google/connection.service';
import { reviewResourceName } from '../google/sync.service';
import type { MemberContext } from '../workspaces/access';
import { draftForReview } from './draft.service';
import { loadReview } from './reviews.service';

function validateText(text: string): void {
  if (!text.trim()) throw new HttpError(400, 'Reply cannot be empty', 'empty_reply');
  if (byteLength(text) > GOOGLE_REPLY_MAX_BYTES) {
    throw new HttpError(
      400,
      `Reply is over Google's ${GOOGLE_REPLY_MAX_BYTES}-byte limit`,
      'reply_too_long',
    );
  }
}

const inProgress = () =>
  new HttpError(409, 'This reply is being posted right now', 'reply_in_progress');

// Only production talks to the real Google by default, so nobody posts publicly while testing.
function assertRealActionAllowed(connection: {
  provider: 'mock' | 'live';
  dataSource: 'google' | 'sample';
}): void {
  if (!usesFakeData(connection) && !env.GOOGLE_POSTING_ENABLED) {
    throw new HttpError(
      403,
      'Posting to real Google is switched off in this environment',
      'real_posting_disabled',
    );
  }
}

export async function saveDraft(
  member: MemberContext,
  reviewId: string,
  text: string,
  ip?: string,
): Promise<void> {
  const review = await loadReview(member, reviewId);
  const values = { text, source: 'human' as const, state: 'draft' as const, error: null };
  if (review.reply) {
    const saved = await prisma.reply.updateMany({
      where: { id: review.reply.id, state: { not: 'posting' } },
      data: values,
    });
    if (saved.count === 0) throw inProgress();
  } else {
    await prisma.reply.create({ data: { workspaceId: member.workspaceId, reviewId, ...values } });
  }
  await recordAudit({
    action: 'reply.edited',
    workspaceId: member.workspaceId,
    locationId: review.locationId,
    actorUserId: member.userId,
    targetType: 'review',
    targetId: reviewId,
    ip,
  });
}

export async function regenerate(
  member: MemberContext,
  reviewId: string,
  instructions: string | undefined,
  ip?: string,
): Promise<void> {
  const review = await loadReview(member, reviewId);
  if (review.reply?.state === 'posting') throw inProgress();
  if (review.reply)
    await prisma.reply.update({ where: { id: review.reply.id }, data: { state: 'drafting' } });
  else
    await prisma.reply.create({
      data: { workspaceId: member.workspaceId, reviewId, source: 'ai', state: 'drafting' },
    });
  await recordAudit({
    action: 'reply.regenerated',
    workspaceId: member.workspaceId,
    locationId: review.locationId,
    actorUserId: member.userId,
    targetType: 'review',
    targetId: reviewId,
    meta: { instructions },
    ip,
  });
  await draftForReview(reviewId, { instructions });
}

export async function postReply(
  member: MemberContext,
  reviewId: string,
  text: string | undefined,
  ip?: string,
): Promise<void> {
  const review = await loadReview(member, reviewId);
  const { location } = review;
  assertRealActionAllowed(location.connection);

  if (text !== undefined) {
    validateText(text);
    if (review.reply) {
      const edited = review.reply.text !== text;
      const saved = await prisma.reply.updateMany({
        where: { id: review.reply.id, state: { not: 'posting' } },
        data: { text, ...(edited ? { source: 'human' as const } : {}), state: 'draft' },
      });
      if (saved.count === 0) throw inProgress();
    } else {
      await prisma.reply.create({
        data: { workspaceId: member.workspaceId, reviewId, text, source: 'human', state: 'draft' },
      });
    }
  }

  const reply = await prisma.reply.findUnique({ where: { reviewId } });
  if (!reply) throw new HttpError(400, 'There is nothing to post yet', 'empty_reply');
  validateText(reply.text);

  if (!replyEdits.tryTake(location.id)) {
    throw new HttpError(
      429,
      'Google allows 10 reply changes a minute for each location. Please try again shortly.',
      'reply_rate_limited',
    );
  }

  // One atomic update decides who posts, so a double click can't post twice.
  const claimed = await prisma.reply.updateMany({
    where: {
      id: reply.id,
      state: { in: ['draft', 'failed', 'rejected', 'live', 'pending_google'] },
    },
    data: { state: 'posting' },
  });
  if (claimed.count === 0) throw inProgress();

  try {
    const { provider, ctx } = await getContext(location.connectionId);
    const result = await provider.updateReply(
      ctx,
      reviewResourceName(location, review.googleReviewId),
      reply.text,
    );
    await prisma.reply.update({
      where: { id: reply.id },
      data: {
        state: 'pending_google',
        googleReplyState: result?.replyState ?? 'PENDING',
        postedAt: new Date(),
        postedById: member.userId,
        error: null,
        policyViolation: null,
        lastCheckedAt: null,
      },
    });
    await recordAudit({
      action: 'reply.posted',
      workspaceId: member.workspaceId,
      locationId: location.id,
      actorUserId: member.userId,
      targetType: 'review',
      targetId: reviewId,
      // The location, not the reviewer: review content is purged after 30 days, the log is not.
      meta: { title: location.title },
      ip,
    });
  } catch (err) {
    const message = (err as Error).message;
    await prisma.reply.update({
      where: { id: reply.id },
      data: { state: 'failed', error: message },
    });
    if ((err as { statusCode?: number }).statusCode === 401)
      await markNeedsReconnect(location.connectionId);
    throw new HttpError(502, `Google refused the reply: ${message}`, 'google_refused');
  }
}

export async function deleteReply(
  member: MemberContext,
  reviewId: string,
  ip?: string,
): Promise<void> {
  const review = await loadReview(member, reviewId);
  const { reply, location } = review;
  if (reply?.state === 'posting') throw inProgress();
  if (reply && ['pending_google', 'live', 'rejected'].includes(reply.state)) {
    assertRealActionAllowed(location.connection);
    if (!replyEdits.tryTake(location.id)) {
      throw new HttpError(
        429,
        'Google allows 10 reply changes a minute for each location. Please try again shortly.',
        'reply_rate_limited',
      );
    }
    try {
      const { provider, ctx } = await getContext(location.connectionId);
      await provider.deleteReply(ctx, reviewResourceName(location, review.googleReviewId));
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // Already gone from Google is what we wanted. Anything else keeps our copy and says so.
      if (status !== 404) {
        if (status === 401) await markNeedsReconnect(location.connectionId);
        throw new HttpError(
          502,
          `Google refused the request: ${(err as Error).message}`,
          'google_refused',
        );
      }
    }
  }
  if (reply) await prisma.reply.delete({ where: { id: reply.id } });
  await recordAudit({
    action: 'reply.deleted',
    workspaceId: member.workspaceId,
    locationId: location.id,
    actorUserId: member.userId,
    targetType: 'review',
    targetId: reviewId,
    meta: { title: location.title },
    ip,
  });
}
