import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { assertTestDatabase } from '../../src/lib/test-database-guard';

// Runs once before the whole suite: refuse anything but a test database, then migrate it.
export default function globalSetup() {
  config({ path: '.env.test' });
  const url = process.env.DATABASE_URL;
  assertTestDatabase(url);
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
