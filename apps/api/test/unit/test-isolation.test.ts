import { describe, expect, it } from 'vitest';
// Prisma first, on purpose: creating its client is what reads the developer's .env.
import { prisma } from '../../src/lib/prisma';
import { env } from '../../src/config';
import { usingAi } from '../../src/modules/reviews/draft.service';

// A developer's own .env holds real keys, and Prisma loads that file by itself. Tests must still
// never call OpenAI, Google, Resend or Sentry with them.
describe('tests stay away from real services', () => {
  it('uses no real keys and no real providers', async () => {
    await prisma.$connect().catch(() => {});
    expect(env.OPENAI_API_KEY ?? '').toBe('');
    expect(usingAi()).toBe(false);
    expect(env.GOOGLE_CLIENT_ID ?? '').toBe('');
    expect(env.GOOGLE_CLIENT_SECRET ?? '').toBe('');
    expect(env.RESEND_API_KEY ?? '').toBe('');
    expect(env.SENTRY_DSN ?? '').toBe('');
    expect(env.GBP_PROVIDER).toBe('mock');
    expect(env.EMAIL_PROVIDER).toBe('mock');
    expect(env.GOOGLE_POSTING_ENABLED).toBe(false);
    expect(env.API_URL).toBe(env.APP_URL);
  });
});
