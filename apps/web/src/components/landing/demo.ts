// The sample in the hero plays like the real thing: a review arrives, ReplyPilot drafts a reply,
// the draft types itself out, the owner approves it, and it goes live. demoFrame says what to show
// a given number of milliseconds into one sample.
export const DEMO_TIMING = {
  review: 900,
  drafting: 1400,
  perLetter: 24,
  approving: 1100,
  live: 2800,
};

export type DemoPhase = 'review' | 'drafting' | 'typing' | 'approving' | 'live';

export function demoLength(reply: string) {
  const t = DEMO_TIMING;
  return t.review + t.drafting + reply.length * t.perLetter + t.approving + t.live;
}

export function demoFrame(elapsed: number, reply: string): { phase: DemoPhase; typed: number } {
  const t = DEMO_TIMING;
  let time = Math.max(0, elapsed);
  if (time < t.review) return { phase: 'review', typed: 0 };
  time -= t.review;
  if (time < t.drafting) return { phase: 'drafting', typed: 0 };
  time -= t.drafting;
  const typing = reply.length * t.perLetter;
  if (time < typing) return { phase: 'typing', typed: Math.floor(time / t.perLetter) };
  time -= typing;
  if (time < t.approving) return { phase: 'approving', typed: reply.length };
  return { phase: 'live', typed: reply.length };
}
