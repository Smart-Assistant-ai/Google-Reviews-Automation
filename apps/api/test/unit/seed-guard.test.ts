import { describe, expect, it } from 'vitest';
import { assertSeedAllowed } from '../../src/lib/seed-guard';

describe('assertSeedAllowed', () => {
  it('refuses production, even when asked', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', ALLOW_DB_SEED: 'true' })).toThrow(
      /production/,
    );
  });
  it('refuses without the explicit flag', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).toThrow(/ALLOW_DB_SEED/);
  });
  it('allows development with the flag', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'development', ALLOW_DB_SEED: 'true' }),
    ).not.toThrow();
  });
});
