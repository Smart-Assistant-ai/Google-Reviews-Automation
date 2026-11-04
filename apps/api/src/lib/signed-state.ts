import { createHmac } from 'node:crypto';
import { env } from '../config';
import { safeEqual } from './crypto';

type Payload = Record<string, unknown>;

const sign = (purpose: string, body: string) =>
  createHmac('sha256', `${purpose}:${env.JWT_SECRET}`).update(body).digest('base64url');

// A short-lived value the browser carries through a Google redirect. It can't be changed or
// reused for another flow, because the signature covers both the content and the purpose.
export function signState(purpose: string, payload: Payload, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  return `${body}.${sign(purpose, body)}`;
}

export function verifyState(purpose: string, state: string | undefined): Payload | null {
  if (!state) return null;
  const [body, signature] = state.split('.');
  if (!body || !signature || !safeEqual(signature, sign(purpose, body))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload & { exp: number };
  return payload.exp > Date.now() / 1000 ? payload : null;
}
