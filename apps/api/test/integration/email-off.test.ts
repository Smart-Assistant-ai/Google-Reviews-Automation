import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config';
import { prisma } from '../../src/lib/prisma';
import { notifyProblems } from '../../src/modules/reviews/jobs';
import { sendEmail } from '../../src/providers/email';
import { sentEmails } from '../../src/providers/email/mock';
import { mockGbp } from '../../src/providers/gbp/mock';
import { signup, testApp, uniqueEmail, type TestUser } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { connectGoogle, googleStatus } from '../helpers/google';

// A server without a Resend key runs with EMAIL_PROVIDER=off. Everything that needs an email is
// switched off with it, and nothing that doesn't is held up waiting for one.
let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  mockGbp.reset();
  sentEmails.length = 0;
  env.SIGNUP_MODE = 'open';
  env.EMAIL_PROVIDER = 'off';
});
afterEach(() => {
  env.EMAIL_PROVIDER = 'mock';
});

const call = (method: 'GET' | 'POST', url: string, user?: TestUser, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, headers: user?.headers, payload });

describe('with email switched off', () => {
  it('tells the web app, so it hides what needs an email', async () => {
    expect((await call('GET', '/auth/config')).json().emails).toBe(false);
  });

  it('signs people up without a confirmation email', async () => {
    const user = await signup(app);
    expect(sentEmails).toHaveLength(0);
    expect((await call('GET', '/auth/me', user)).json().user.emailVerified).toBe(false);
  });

  it('lets a new account connect Google and post a reply without confirming its email', async () => {
    const user = await signup(app);
    await connectGoogle(app, user, { email: `${user.id}@sample.test` });
    const review = await prisma.review.findFirstOrThrow({
      where: { workspaceId: user.workspaceId },
    });
    const res = await call(
      'POST',
      `/workspaces/${user.workspaceId}/reviews/${review.id}/reply/post`,
      user,
      { text: 'Thank you for your feedback.' },
    );
    expect(res.statusCode).toBe(200);
  });

  it('offers no confirmation link and no password reset', async () => {
    const user = await signup(app);
    expect((await call('POST', '/auth/resend-verification', user)).statusCode).toBe(404);
    expect(
      (await call('POST', '/auth/forgot-password', undefined, { email: user.email })).statusCode,
    ).toBe(404);
    expect(sentEmails).toHaveLength(0);
  });

  it("doesn't invite teammates, because the link would never reach them", async () => {
    const owner = await signup(app);
    const res = await call('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, {
      email: uniqueEmail('member'),
    });
    expect(res.statusCode).toBe(404);
    expect(await prisma.workspaceInvitation.count()).toBe(0);
  });

  it('sends no Google problem emails, and sends one once email is switched on', async () => {
    const user = await signup(app);
    await connectGoogle(app, user, { email: `${user.id}@sample.test` });
    const connection = (await googleStatus(app, user)).connections[0]!;
    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: { status: 'needs_reconnect' },
    });
    await notifyProblems();
    expect(sentEmails).toHaveLength(0);

    env.EMAIL_PROVIDER = 'mock';
    await notifyProblems();
    expect(sentEmails.map((m) => m.subject)).toEqual(['Please reconnect your Google account']);
  });

  it('refuses to send if anything still tries', async () => {
    const message = { to: 'owner@business.com', subject: 'Hello', text: 'Hi', html: '<p>Hi</p>' };
    await expect(sendEmail(message)).rejects.toThrow(/switched off/);
    expect(sentEmails).toHaveLength(0);
  });
});
