import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';

const valid = {
  NODE_ENV: 'production',
  APP_URL: 'https://app.example.com',
  DATABASE_URL: 'postgresql://user:pass@db.internal:5432/replypilot',
  JWT_SECRET: 'a7f3c91e5d2b48607e1a9c3f5b7d2e40a7f3c91e',
  ENCRYPTION_KEY: '6f1d2c3b4a5968778695a4b3c2d1e0f06f1d2c3b4a5968778695a4b3c2d1e0f0',
  GBP_PROVIDER: 'live',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_live_key',
  EMAIL_FROM: 'ReplyPilot <hello@example.com>',
};

describe('parseEnv', () => {
  it('accepts a complete production config', () => {
    const env = parseEnv(valid);
    expect(env.GBP_PROVIDER).toBe('live');
    expect(env.SIGNUP_MODE).toBe('allowlist');
    expect(env.GOOGLE_POSTING_ENABLED).toBe(true);
  });

  it.each([
    ['JWT_SECRET', 'dev-secret'],
    ['JWT_SECRET', 'change-me'],
    ['JWT_SECRET', 'change-me-in-production-min-32-chars'],
    ['JWT_SECRET', 'short'],
    ['ENCRYPTION_KEY', 'change-me'],
  ])('refuses a placeholder or weak %s (%s)', (key, value) => {
    expect(() => parseEnv({ ...valid, [key]: value })).toThrow(key);
  });

  it.each(['JWT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL', 'APP_URL'])(
    'refuses to start without %s',
    (key) => {
      const { [key as keyof typeof valid]: _removed, ...rest } = valid;
      expect(() => parseEnv(rest)).toThrow(key);
    },
  );

  it('requires GBP_PROVIDER to be chosen in production, so fake Google is never a silent default', () => {
    const { GBP_PROVIDER: _removed, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow('GBP_PROVIDER');
  });

  it('defaults to the mock provider in development', () => {
    const { GBP_PROVIDER: _g, EMAIL_PROVIDER: _e, ...rest } = valid;
    expect(parseEnv({ ...rest, NODE_ENV: 'development' }).GBP_PROVIDER).toBe('mock');
  });

  it('requires Google credentials when using the live provider', () => {
    const { GOOGLE_CLIENT_ID: _removed, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow('GOOGLE_CLIENT_ID');
  });

  it('refuses the mock email provider in production', () => {
    expect(() => parseEnv({ ...valid, EMAIL_PROVIDER: 'mock' })).toThrow('EMAIL_PROVIDER');
  });

  it('requires a Resend key when sending real email', () => {
    const { RESEND_API_KEY: _removed, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow('RESEND_API_KEY');
  });

  it('keeps real Google posting off outside production unless asked for', () => {
    const dev = { ...valid, NODE_ENV: 'development' };
    expect(parseEnv(dev).GOOGLE_POSTING_ENABLED).toBe(false);
    expect(parseEnv({ ...dev, GOOGLE_POSTING_ENABLED: 'true' }).GOOGLE_POSTING_ENABLED).toBe(true);
  });

  it('can switch off real Google posting in production', () => {
    expect(parseEnv({ ...valid, GOOGLE_POSTING_ENABLED: 'false' }).GOOGLE_POSTING_ENABLED).toBe(false);
  });

  it('marks cookies Secure when the app runs on https', () => {
    expect(parseEnv(valid).COOKIE_SECURE).toBe(true);
    const dev = { ...valid, NODE_ENV: 'development', APP_URL: 'http://localhost:5173' };
    expect(parseEnv(dev).COOKIE_SECURE).toBe(false);
  });
});
