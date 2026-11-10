import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, hashToken, randomToken, safeEqual } from '../../src/lib/crypto';

describe('encrypt and decrypt', () => {
  it('round-trips a value', () => {
    expect(decrypt(encrypt('refresh-token-value'))).toBe('refresh-token-value');
  });

  it('gives a different result each time, so equal tokens do not look equal in the database', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('refuses a value that has been tampered with', () => {
    const encrypted = encrypt('secret-value');
    const parts = encrypted.split(':');
    const body = parts[3]!;
    const flipped = body.slice(0, -1) + (body.endsWith('0') ? '1' : '0');
    expect(() => decrypt([parts[0], parts[1], parts[2], flipped].join(':'))).toThrow();
  });

  it('passes null through', () => {
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
  });
});

describe('tokens', () => {
  it('makes long, unique random tokens', () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(randomToken().length).toBeGreaterThanOrEqual(43);
  });

  it('hashes without storing the original', () => {
    const token = randomToken();
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('compares safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
