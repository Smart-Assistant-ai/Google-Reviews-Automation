// Counts failed attempts per key in memory, which is correct while the API runs as one process.
export class AttemptLimiter {
  private readonly attempts = new Map<string, { count: number; startedAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private current(key: string) {
    const entry = this.attempts.get(key);
    if (!entry) return null;
    if (Date.now() - entry.startedAt > this.windowMs) {
      this.attempts.delete(key);
      return null;
    }
    return entry;
  }

  isBlocked(key: string): boolean {
    return (this.current(key)?.count ?? 0) >= this.max;
  }

  fail(key: string): void {
    const entry = this.current(key);
    if (entry) entry.count += 1;
    else this.attempts.set(key, { count: 1, startedAt: Date.now() });
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
