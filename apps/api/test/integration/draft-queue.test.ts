import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { draftForReview } from '../../src/modules/reviews/draft.service';
import { runDraftQueue } from '../../src/modules/reviews/jobs';
import { signup, testApp } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { addLocation } from '../helpers/seed-location';

// The drafter is swapped out, so a test can decide what happens while a draft is being written.
vi.mock('../../src/modules/reviews/draft.service', async (original) => ({
  ...(await original<typeof import('../../src/modules/reviews/draft.service')>()),
  draftForReview: vi.fn(),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  vi.mocked(draftForReview).mockReset();
});

async function waitingForDraft(draftAttempts: number) {
  const owner = await signup(app);
  const location = await addLocation(owner.workspaceId);
  const review = await prisma.review.create({
    data: {
      workspaceId: owner.workspaceId,
      locationId: location.id,
      googleReviewId: `r-${Date.now()}`,
      reviewerName: 'Sam P.',
      starRating: 5,
      comment: 'Quick service.',
      createTime: new Date(),
    },
  });
  return prisma.reply.create({
    data: {
      workspaceId: owner.workspaceId,
      reviewId: review.id,
      source: 'ai',
      state: 'drafting',
      draftAttempts,
    },
  });
}

describe('the draft queue', () => {
  it('gives up on a draft after its last attempt fails', async () => {
    const reply = await waitingForDraft(4);
    vi.mocked(draftForReview).mockRejectedValue(new Error('AI is down'));

    await runDraftQueue();
    expect(await prisma.reply.findUniqueOrThrow({ where: { id: reply.id } })).toMatchObject({
      state: 'failed',
      draftAttempts: 5,
    });
  });

  it('keeps the answer a sync brought in while the draft was failing', async () => {
    const reply = await waitingForDraft(4);
    // Google's reply arrives through a sync while the drafter is still working, then it fails.
    vi.mocked(draftForReview).mockImplementation(async () => {
      await prisma.reply.update({
        where: { id: reply.id },
        data: { state: 'live', source: 'google', text: 'Thanks, Sam!' },
      });
      throw new Error('AI is down');
    });

    await runDraftQueue();
    expect(await prisma.reply.findUniqueOrThrow({ where: { id: reply.id } })).toMatchObject({
      state: 'live',
      text: 'Thanks, Sam!',
      error: null,
    });
  });
});
