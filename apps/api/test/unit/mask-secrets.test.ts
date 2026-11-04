import { describe, expect, it } from 'vitest';
import { maskSecrets } from '../../src/lib/audit';

describe('maskSecrets', () => {
  it('hides secret-looking keys at any depth and keeps the rest', () => {
    expect(
      maskSecrets({
        email: 'a@b.com',
        password: 'hunter2',
        nested: { refreshToken: 'abc', accessToken: 'def', apiKey: 'ghi', note: 'ok' },
        list: [{ secret: 'x', keep: 1 }],
      }),
    ).toEqual({
      email: 'a@b.com',
      password: '[redacted]',
      nested: { refreshToken: '[redacted]', accessToken: '[redacted]', apiKey: '[redacted]', note: 'ok' },
      list: [{ secret: '[redacted]', keep: 1 }],
    });
  });
});
