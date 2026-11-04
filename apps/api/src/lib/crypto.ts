import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

// Authenticated encryption for values at rest, such as Google tokens. GCM also detects tampering.
export function encrypt<T extends string | null | undefined>(value: T): T extends string ? string : null {
  if (!value) return null as never;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('hex'), tag.toString('hex'), body.toString('hex')].join(':') as never;
}

export function decrypt<T extends string | null | undefined>(value: T): T extends string ? string : null {
  if (!value) return null as never;
  const [version, iv, tag, body] = value.split(':');
  if (version !== VERSION || !iv || !tag || body === undefined) {
    throw new Error('Unrecognised encrypted value');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'hex')), decipher.final()]).toString('utf8') as never;
}

export const randomToken = () => randomBytes(32).toString('base64url');

// Login and email tokens are long and random, so a plain fast hash is enough and only the hash is stored.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
