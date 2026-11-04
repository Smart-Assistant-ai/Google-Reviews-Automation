import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app';
import { sentEmails } from '../../src/providers/email/mock';

export const PASSWORD = 'correct-horse-battery';

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${(counter += 1)}@business.test`;

export const testApp = () => buildApp();

export function refreshCookie(res: LightMyRequestResponse): string | undefined {
  return res.cookies.find((cookie) => cookie.name === 'rp_refresh')?.value;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  workspaceId: string;
  headers: { authorization: string };
}

export async function signup(
  app: FastifyInstance,
  overrides: { email?: string; password?: string; name?: string; businessName?: string; inviteToken?: string } = {},
): Promise<TestUser> {
  const email = overrides.email ?? uniqueEmail();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: { password: PASSWORD, name: 'Test Owner', ...overrides, email },
  });
  if (res.statusCode !== 200) throw new Error(`signup failed: ${res.statusCode} ${res.body}`);
  const body = res.json();
  return {
    id: body.user.id,
    email,
    accessToken: body.accessToken,
    refreshToken: refreshCookie(res)!,
    workspaceId: body.workspaces[0]?.id,
    headers: bearer(body.accessToken),
  };
}

// The token in the most recent email to this person, read the same way a person would: from the link.
export function tokenFromEmail(to: string, path: string): string {
  const email = [...sentEmails].reverse().find((message) => message.to === to && message.text.includes(path));
  if (!email) throw new Error(`no email to ${to} with a link to ${path}`);
  const match = email.text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
  if (!match?.[1]) throw new Error('no token in the email');
  return match[1];
}
