import { afterEach, describe, expect, it, vi } from 'vitest';
import { signState, verifyState } from '../../src/lib/signed-state';

afterEach(() => vi.useRealTimers());

describe('signed state', () => {
  it('reads back what was signed', () => {
    const state = signState('google-connect', { workspaceId: 'w1' }, 600);
    expect(verifyState('google-connect', state)).toMatchObject({ workspaceId: 'w1' });
  });

  it('refuses a changed payload', () => {
    const state = signState('google-connect', { workspaceId: 'w1' }, 600);
    const [, signature] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({ workspaceId: 'attacker', exp: 9999999999 }),
    ).toString('base64url');
    expect(verifyState('google-connect', `${forged}.${signature}`)).toBeNull();
  });

  it('refuses a state signed for a different purpose', () => {
    const state = signState('google-signin', { a: 1 }, 600);
    expect(verifyState('google-connect', state)).toBeNull();
  });

  it('refuses an expired state', () => {
    vi.useFakeTimers();
    const state = signState('google-connect', { a: 1 }, 600);
    vi.advanceTimersByTime(601_000);
    expect(verifyState('google-connect', state)).toBeNull();
  });

  it('refuses rubbish', () => {
    expect(verifyState('google-connect', 'not-a-state')).toBeNull();
    expect(verifyState('google-connect', undefined)).toBeNull();
  });
});
