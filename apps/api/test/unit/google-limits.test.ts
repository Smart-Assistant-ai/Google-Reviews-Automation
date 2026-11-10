import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallWindow, editLimiter } from '../../src/providers/gbp/limits';

afterEach(() => vi.useRealTimers());

describe('CallWindow', () => {
  it('lets calls through until the limit, then makes the next one wait', async () => {
    vi.useFakeTimers();
    const gate = new CallWindow(2, 60_000);
    await gate.acquire();
    await gate.acquire();
    let third = false;
    const pending = gate.acquire().then(() => {
      third = true;
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(third).toBe(false);
    await vi.advanceTimersByTimeAsync(31_000);
    await pending;
    expect(third).toBe(true);
  });
});

describe('editLimiter', () => {
  it("allows 10 reply edits a minute per location, because that is Google's limit", () => {
    vi.useFakeTimers();
    const limit = editLimiter();
    for (let i = 0; i < 10; i += 1) expect(limit.tryTake('a')).toBe(true);
    expect(limit.tryTake('a')).toBe(false);
    expect(limit.tryTake('b')).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(limit.tryTake('a')).toBe(true);
  });
});
