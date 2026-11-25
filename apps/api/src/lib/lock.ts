import { prisma } from './prisma';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs `work` while no other call holds the same key, in this process or any other one using the
// same database. A caller that finds the key taken lets go of its database connection and tries
// again shortly, so a burst of waiters can't use up the pool the holder needs for its own work.
export async function withLock<T>(
  key: string,
  work: () => Promise<T>,
  waitMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    let held = false;
    let result: T | undefined;
    // The lock lasts as long as this transaction, and Postgres releases it however it ends.
    await prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`;
        if (!row?.locked) return;
        held = true;
        result = await work();
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
    if (held) return result as T;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for the lock on ${key}`);
    await sleep(100 + Math.random() * 150);
  }
}
