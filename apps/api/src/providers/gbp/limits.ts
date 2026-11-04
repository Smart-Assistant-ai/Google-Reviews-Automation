// Google's limits, counted in memory, which is correct while the API runs as one process.
export class CallWindow {
  private calls: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.calls = this.calls.filter((at) => now - at < this.windowMs);
      if (this.calls.length < this.max) {
        this.calls.push(now);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, this.windowMs - (now - this.calls[0]!) + 1));
    }
  }
}

// 300 calls a minute is the quota once Google approves API access.
export const googleCalls = new CallWindow(300, 60_000);

export function editLimiter(max = 10, windowMs = 60_000) {
  const edits = new Map<string, number[]>();
  return {
    tryTake(key: string): boolean {
      const now = Date.now();
      const recent = (edits.get(key) ?? []).filter((at) => now - at < windowMs);
      if (recent.length >= max) {
        edits.set(key, recent);
        return false;
      }
      recent.push(now);
      edits.set(key, recent);
      return true;
    },
  };
}

// Google allows 10 reply edits a minute per profile.
export const replyEdits = editLimiter();
