import { prisma } from '../../src/lib/prisma';

// Wipes every table between tests. The global setup has already refused any non-test database.
export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
  if (tables) await prisma.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
}
