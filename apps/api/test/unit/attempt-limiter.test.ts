import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttemptLimiter } from '../../src/lib/attempt-limiter';

afterEach(() => vi.useRealTimers());

describe('AttemptLimiter', () => {
  it('blocks a key after too many failures', () => {
    const limiter = new AttemptLimiter(2, 60_000);
    expect(limiter.isBlocked('a')).toBe(false);
    limiter.fail('a');
    limiter.fail('a');
    expect(limiter.isBlocked('a')).toBe(true);
    expect(limiter.isBlocked('b')).toBe(false);
  });

  it('forgets failures after a success', () => {
    const limiter = new AttemptLimiter(1, 60_000);
    limiter.fail('a');
    limiter.reset('a');
    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('lets a key try again once the window has passed', () => {
    vi.useFakeTimers();
    const limiter = new AttemptLimiter(1, 60_000);
    limiter.fail('a');
    vi.advanceTimersByTime(60_001);
    expect(limiter.isBlocked('a')).toBe(false);
  });
});
