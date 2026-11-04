import { describe, expect, it } from 'vitest';
import { GOOGLE_REPLY_MAX_BYTES, byteLength, emailSchema, hasAtLeast, passwordSchema } from '../src';

describe('emailSchema', () => {
  it('stores every email in one form, so lookups and duplicates behave', () => {
    expect(emailSchema.parse('  Owner@Business.COM ')).toBe('owner@business.com');
  });
  it('refuses something that is not an email', () => {
    expect(emailSchema.safeParse('nope').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('needs at least 8 characters', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('long-enough').success).toBe(true);
  });
  it('refuses more than 72 bytes, because bcrypt silently ignores the rest', () => {
    expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
    expect(passwordSchema.safeParse('é'.repeat(37)).success).toBe(false);
  });
});

describe('byteLength', () => {
  it('counts UTF-8 bytes, not characters, because that is how Google limits replies', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('atención')).toBe(9);
    expect(GOOGLE_REPLY_MAX_BYTES).toBe(4096);
  });
});

describe('hasAtLeast', () => {
  it('ranks owner over admin over member', () => {
    expect(hasAtLeast('owner', 'admin')).toBe(true);
    expect(hasAtLeast('admin', 'admin')).toBe(true);
    expect(hasAtLeast('member', 'admin')).toBe(false);
    expect(hasAtLeast('admin', 'owner')).toBe(false);
  });
});
