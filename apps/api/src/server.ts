import * as Sentry from '@sentry/node';
import { env } from './config';
import { buildApp } from './app';
import { createJobRunner } from './jobs/runner';
import { prisma } from './lib/prisma';
import { reviewJobs } from './modules/reviews/jobs';

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });

  await prisma.$queryRaw`SELECT 1`;
  const app = await buildApp();
  const jobs = createJobRunner(reviewJobs);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info(`Received ${signal}, shutting down`);
    const forceExit = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();
    try {
      // New work stops first, then in-flight jobs and requests finish, then connections close.
      await jobs.stop();
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.HOST, port: env.PORT });
  jobs.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
