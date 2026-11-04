import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { createJobRunner, type JobDefinition } from '../../src/jobs/runner';
import {
  checkPendingReplies,
  notifyProblems,
  recoverStuckReplies,
  runDraftQueue,
  syncDueLocations,
} from '../../src/modules/reviews/jobs';
import { sentEmails } from '../../src/providers/email/mock';
import { mockGbp } from '../../src/providers/gbp/mock';
import { signup, testApp } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { connectGoogle, googleStatus, verifyEmail } from '../helpers/google';

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  mockGbp.reset();
  sentEmails.length = 0;
});

async function connected() {
  const user = await signup(app);
  await verifyEmail(app, user);
  const email = `${user.id}@sample.test`;
  await connectGoogle(app, user, { email });
  return { user, email };
}

const job = (overrides: Partial<JobDefinition> = {}): JobDefinition => ({
  name: 'test-job',
  everyMs: 60_000,
  run: vi.fn(async () => {}),
  ...overrides,
});

describe('job runner', () => {
  it('runs a due job and records it', async () => {
    const definition = job();
    await createJobRunner([definition]).tick();
    expect(definition.run).toHaveBeenCalledOnce();
    const row = await prisma.jobRun.findUniqueOrThrow({ where: { name: 'test-job' } });
    expect(row.lastFinishedAt).not.toBeNull();
    expect(row.lockedUntil).toBeNull();
  });

  it('does not run again until it is due, even after a restart', async () => {
    const definition = job();
    await createJobRunner([definition]).tick();
    await createJobRunner([definition]).tick();
    expect(definition.run).toHaveBeenCalledOnce();
  });

  it('two processes ticking together run a job only once', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = vi.fn(() => blocker);
    const definition = job({ run });
    const first = createJobRunner([definition]).tick();
    const second = createJobRunner([definition]).tick();
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    await Promise.all([first, second]);
    expect(run).toHaveBeenCalledOnce();
  });

  it('records a failure so a stopped job is visible, and a failure does not stop other jobs', async () => {
    const good = job({ name: 'good-job' });
    const bad = job({
      name: 'bad-job',
      run: async () => {
        throw new Error('boom');
      },
    });
    await createJobRunner([bad, good]).tick();
    expect(good.run).toHaveBeenCalledOnce();
    expect((await prisma.jobRun.findUniqueOrThrow({ where: { name: 'bad-job' } })).lastError).toBe(
      'boom',
    );
  });

  it('a crashed job can run again once its lease runs out', async () => {
    const definition = job({ everyMs: 1 });
    await prisma.jobRun.create({
      data: {
        name: 'test-job',
        lastStartedAt: new Date(Date.now() - 3_600_000),
        lockedUntil: new Date(Date.now() - 1000),
      },
    });
    await createJobRunner([definition]).tick();
    expect(definition.run).toHaveBeenCalledOnce();
  });

  it('a job another process still holds is left alone', async () => {
    const definition = job({ everyMs: 1 });
    await prisma.jobRun.create({
      data: {
        name: 'test-job',
        lastStartedAt: new Date(Date.now() - 3_600_000),
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    await createJobRunner([definition]).tick();
    expect(definition.run).not.toHaveBeenCalled();
  });

  it('stop waits for running work', async () => {
    let finished = false;
    const definition = job({
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        finished = true;
      },
    });
    const runner = createJobRunner([definition], { tickMs: 10 });
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await runner.stop();
    expect(finished).toBe(true);
  });
});

describe('work survives a restart', () => {
  it('drafts left unfinished are picked up, because they are read from the database', async () => {
    const { user } = await connected();
    const drafting = await prisma.reply.count({
      where: { workspaceId: user.workspaceId, state: 'drafting' },
    });
    expect(drafting).toBeGreaterThan(0);
    await runDraftQueue();
    await runDraftQueue();
    await runDraftQueue();
    expect(
      await prisma.reply.count({ where: { workspaceId: user.workspaceId, state: 'drafting' } }),
    ).toBe(0);
  });

  it('a reply stuck posting after a crash becomes failed, so the owner can retry', async () => {
    const { user } = await connected();
    const review = await prisma.review.findFirstOrThrow({
      where: { workspaceId: user.workspaceId },
    });
    await prisma.reply.deleteMany({ where: { reviewId: review.id } });
    const reply = await prisma.reply.create({
      data: {
        workspaceId: user.workspaceId,
        reviewId: review.id,
        text: 'Hi',
        source: 'human',
        state: 'posting',
      },
    });
    await recoverStuckReplies();
    expect((await prisma.reply.findUniqueOrThrow({ where: { id: reply.id } })).state).toBe(
      'posting',
    );
    await prisma.$executeRaw`UPDATE replies SET updated_at = now() - interval '10 minutes' WHERE id = ${reply.id}::uuid`;
    await recoverStuckReplies();
    expect((await prisma.reply.findUniqueOrThrow({ where: { id: reply.id } })).state).toBe(
      'failed',
    );
  });
});

describe('sync schedule', () => {
  it('syncs only what is due, and skips unchosen locations and dead connections', async () => {
    const { user, email } = await connected();
    const [location] = (await googleStatus(app, user)).locations;

    mockGbp.simulateNewReview(
      location!.connectionId
        ? (await prisma.location.findUniqueOrThrow({ where: { id: location!.id } }))
            .googleAccountName
        : '',
      (await prisma.location.findUniqueOrThrow({ where: { id: location!.id } })).googleLocationName,
    );
    const before = await prisma.review.count({ where: { workspaceId: user.workspaceId } });
    await syncDueLocations();
    expect(await prisma.review.count({ where: { workspaceId: user.workspaceId } })).toBe(before);

    await prisma.location.update({
      where: { id: location!.id },
      data: { lastSyncAttemptAt: new Date(Date.now() - 16 * 60_000) },
    });
    await syncDueLocations();
    expect(await prisma.review.count({ where: { workspaceId: user.workspaceId } })).toBe(
      before + 1,
    );

    mockGbp.failReads(email, 401);
    await prisma.location.update({
      where: { id: location!.id },
      data: { lastSyncAttemptAt: new Date(Date.now() - 16 * 60_000) },
    });
    await syncDueLocations();
    await prisma.location.update({
      where: { id: location!.id },
      data: { lastSyncAttemptAt: new Date(Date.now() - 16 * 60_000) },
    });
    const attempted = (await prisma.location.findUniqueOrThrow({ where: { id: location!.id } }))
      .lastSyncAttemptAt;
    await syncDueLocations();
    expect(
      (await prisma.location.findUniqueOrThrow({ where: { id: location!.id } })).lastSyncAttemptAt,
    ).toEqual(attempted);
  });
});

describe('moderation checks', () => {
  it('asks Google about a real reply at most once a minute, which protects the quota', async () => {
    const { user } = await connected();
    const review = await prisma.review.findFirstOrThrow({
      where: { workspaceId: user.workspaceId },
    });
    await prisma.reply.deleteMany({ where: { reviewId: review.id } });
    const location = await prisma.location.findUniqueOrThrow({ where: { id: review.locationId } });
    await prisma.googleConnection.update({
      where: { id: location.connectionId },
      data: { provider: 'live' },
    });
    const checkedAt = new Date(Date.now() - 10_000);
    await prisma.reply.create({
      data: {
        workspaceId: user.workspaceId,
        reviewId: review.id,
        text: 'Hi',
        source: 'human',
        state: 'pending_google',
        lastCheckedAt: checkedAt,
      },
    });
    await checkPendingReplies();
    expect(
      (await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } })).lastCheckedAt,
    ).toEqual(checkedAt);
  });
});

describe('telling people about problems', () => {
  it('emails the owner once when a connection dies, not on every check', async () => {
    const { user, email } = await connected();
    const [location] = (await googleStatus(app, user)).locations;
    await prisma.location.update({
      where: { id: location!.id },
      data: { lastSyncAttemptAt: new Date(0) },
    });
    mockGbp.failReads(email, 401);
    await syncDueLocations();
    sentEmails.length = 0;
    await notifyProblems();
    await notifyProblems();
    expect(sentEmails.filter((m) => m.to === user.email)).toHaveLength(1);
    expect(sentEmails[0]?.subject).toMatch(/reconnect/i);
  });

  it('emails again if it dies a second time after being fixed', async () => {
    const { user, email } = await connected();
    const connection = (await googleStatus(app, user)).connections[0]!;
    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: { status: 'needs_reconnect' },
    });
    await notifyProblems();
    await connectGoogle(app, user, { email });
    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: { status: 'needs_reconnect' },
    });
    sentEmails.length = 0;
    await notifyProblems();
    expect(sentEmails).toHaveLength(1);
  });

  it('emails when a location loses access', async () => {
    const { user } = await connected();
    const [location] = (await googleStatus(app, user)).locations;
    await prisma.location.update({ where: { id: location!.id }, data: { status: 'access_lost' } });
    sentEmails.length = 0;
    await notifyProblems();
    expect(sentEmails.map((m) => m.to)).toContain(user.email);
    expect(sentEmails[0]?.text).toContain(location!.title);
  });
});
