import { describe, expect, it } from 'vitest';
import { DEMO_TIMING as t, demoFrame, demoLength } from './demo';

const reply = 'Thank you!';
const typingStarts = t.review + t.drafting;
const typingEnds = typingStarts + reply.length * t.perLetter;

describe('demoFrame', () => {
  it('starts with only the review', () => {
    expect(demoFrame(0, reply)).toEqual({ phase: 'review', typed: 0 });
    expect(demoFrame(-50, reply)).toEqual({ phase: 'review', typed: 0 });
  });

  it('drafts before typing anything', () => {
    expect(demoFrame(t.review, reply)).toEqual({ phase: 'drafting', typed: 0 });
    expect(demoFrame(typingStarts - 1, reply)).toEqual({ phase: 'drafting', typed: 0 });
  });

  it('types one more letter every few milliseconds', () => {
    expect(demoFrame(typingStarts, reply)).toEqual({ phase: 'typing', typed: 0 });
    expect(demoFrame(typingStarts + t.perLetter * 3, reply)).toEqual({ phase: 'typing', typed: 3 });
    expect(demoFrame(typingEnds - 1, reply)).toEqual({ phase: 'typing', typed: reply.length - 1 });
  });

  it('waits for approval with the whole reply shown, then goes live', () => {
    expect(demoFrame(typingEnds, reply)).toEqual({ phase: 'approving', typed: reply.length });
    expect(demoFrame(typingEnds + t.approving, reply)).toEqual({
      phase: 'live',
      typed: reply.length,
    });
  });

  it('never shows more than the reply', () => {
    expect(demoFrame(demoLength(reply) * 5, reply)).toEqual({ phase: 'live', typed: reply.length });
  });
});

describe('demoLength', () => {
  it('adds up every step, with typing time growing with the reply', () => {
    expect(demoLength(reply)).toBe(typingEnds + t.approving + t.live);
    expect(demoLength(reply + reply) - demoLength(reply)).toBe(reply.length * t.perLetter);
  });
});
