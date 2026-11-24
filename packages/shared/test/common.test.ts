import { describe, expect, it } from 'vitest';
import {
  GOOGLE_REPLY_MAX_BYTES,
  byteLength,
  emailSchema,
  hasAtLeast,
  nameText,
  passwordSchema,
} from '../src';

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

describe('nameText', () => {
  const name = nameText(120, 'Your name');
  it('keeps the punctuation real names use', () => {
    for (const value of ["O'Brien", 'José-María', 'Smith & Sons Ltd.', '7-Eleven', '李小龍'])
      expect(name.safeParse(value).success).toBe(true);
  });
  it('refuses a name made only of symbols, and says why', () => {
    const result = name.safeParse('@#$%');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Your name needs at least one letter or number');
  });
  it('refuses a blank name and trims spaces', () => {
    expect(name.safeParse('   ').error?.issues[0]?.message).toBe('Enter your name');
    expect(name.parse('  Sam  ')).toBe('Sam');
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
