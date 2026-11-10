import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { env } from '../../src/config';
import { sentEmails } from '../../src/providers/email/mock';
import { signup, testApp } from '../helpers/app';
import { resetDb } from '../helpers/db';

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  sentEmails.length = 0;
});

describe('local inbox', () => {
  it('shows emails that would have been sent, newest first, with their links', async () => {
    const first = await signup(app);
    const second = await signup(app);
    const res = await app.inject({ url: '/api/v1/dev/outbox' });
    expect(res.statusCode).toBe(200);
    const { emails } = res.json();
    expect(emails.map((e: { to: string }) => e.to)).toEqual([second.email, first.email]);
    expect(emails[0].subject).toBe('Confirm your email');
    expect(emails[0].text).toMatch(/\/verify-email\?token=/);
    expect(emails[0].sentAt).toBeTruthy();
  });

  it('does not exist when real email is set up', async () => {
    const before = env.EMAIL_PROVIDER;
    env.EMAIL_PROVIDER = 'resend';
    try {
      const real = await buildApp();
      expect((await real.inject({ url: '/api/v1/dev/outbox' })).statusCode).toBe(404);
      const config = await real.inject({ url: '/api/v1/auth/config' });
      expect(config.json().devOutbox).toBe(false);
      await real.close();
    } finally {
      env.EMAIL_PROVIDER = before;
    }
  });
});
