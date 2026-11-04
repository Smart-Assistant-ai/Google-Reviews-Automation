import { describe, expect, it } from 'vitest';
import { assertTestDatabase } from '../../src/lib/test-database-guard';

describe('assertTestDatabase', () => {
  it('allows a database whose name ends in _test', () => {
    expect(() => assertTestDatabase('postgresql://u:p@host:5432/replypilot_test')).not.toThrow();
    expect(() =>
      assertTestDatabase('postgresql://u:p@host:5432/replypilot_test?sslmode=require'),
    ).not.toThrow();
  });

  it.each([
    'postgresql://u:p@host:5432/replypilot',
    'postgresql://u:p@host:5432/replypilot_dev',
    'postgresql://u:p@host:5432/test_replypilot',
    undefined,
  ])('refuses %s, because the tests wipe every table', (url) => {
    expect(() => assertTestDatabase(url)).toThrow(/_test/);
  });
});
