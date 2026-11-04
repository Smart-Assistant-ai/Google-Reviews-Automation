import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';

export interface JobDefinition {
  name: string;
  everyMs: number;
  // How long another process must wait before assuming this run crashed. Must exceed the longest run.
  leaseMs?: number;
  run: () => Promise<void>;
}

const DEFAULT_LEASE_MS = 10 * 60_000;

// A job claims its row with one atomic statement, so two processes can't run it together. It works
// through a connection pool, unlike a session lock, and a crash simply frees the job when the lease ends.
async function claim(job: JobDefinition): Promise<boolean> {
  const lease = job.leaseMs ?? DEFAULT_LEASE_MS;
  const claimed = await prisma.$executeRaw`
    INSERT INTO job_runs (name, last_started_at, locked_until)
    VALUES (${job.name}, now(), now() + make_interval(secs => ${lease / 1000}))
    ON CONFLICT (name) DO UPDATE
      SET last_started_at = now(), locked_until = now() + make_interval(secs => ${lease / 1000})
      WHERE (job_runs.locked_until IS NULL OR job_runs.locked_until < now())
        AND (job_runs.last_started_at IS NULL
             OR job_runs.last_started_at <= now() - make_interval(secs => ${job.everyMs / 1000}))`;
  return claimed > 0;
}

async function runOne(job: JobDefinition): Promise<void> {
  if (!(await claim(job))) return;
  let lastError: string | null = null;
  try {
    await job.run();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    console.error(`[job:${job.name}]`, err);
    Sentry.captureException(err);
  }
  await prisma.jobRun.update({
    where: { name: job.name },
    data: { lastFinishedAt: new Date(), lockedUntil: null, lastError },
  });
}

export function createJobRunner(jobs: JobDefinition[], options: { tickMs?: number } = {}) {
  const tickMs = options.tickMs ?? 5000;
  const running = new Set<string>();
  const inFlight = new Set<Promise<void>>();
  let timer: NodeJS.Timeout | null = null;

  async function tick(): Promise<void> {
    const started = jobs
      .filter((job) => !running.has(job.name))
      .map((job) => {
        running.add(job.name);
        const run = runOne(job)
          .catch((err) => console.error(`[job:${job.name}]`, err))
          .finally(() => {
            running.delete(job.name);
            inFlight.delete(run);
          });
        inFlight.add(run);
        return run;
      });
    await Promise.all(started);
  }

  return {
    tick,
    start() {
      timer = setInterval(() => void tick(), tickMs);
    },
    // Stops new work, then waits for what is already running, so a restart doesn't cut a job in half.
    async stop(): Promise<void> {
      if (timer) clearInterval(timer);
      timer = null;
      await Promise.all(inFlight);
    },
  };
}
