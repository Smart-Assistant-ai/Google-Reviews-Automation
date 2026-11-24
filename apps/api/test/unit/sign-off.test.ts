import { describe, expect, it } from 'vitest';
import { signOffFor, splitEnding, withSignOff } from '../../src/modules/reviews/sign-off';

describe('signOffFor', () => {
  it("uses the voice's sign-off as typed, special characters included", () => {
    expect(signOffFor({ signOff: ' – Café "Rosé" & Co. ', ownerName: 'Sam' })).toBe(
      '– Café "Rosé" & Co.',
    );
  });
  it('falls back to the owner name, or nothing', () => {
    expect(signOffFor({ signOff: null, ownerName: 'Sam' })).toBe('– Sam');
    expect(signOffFor({ signOff: '  ', ownerName: null })).toBe('');
  });
});

describe('splitEnding', () => {
  it('finds a short last line in a paragraph of its own', () => {
    expect(splitEnding('Thanks, Ana!\n\n– The Team\n')).toEqual({
      body: 'Thanks, Ana!',
      ending: '– The Team',
    });
  });
  it('finds nothing in a reply of one paragraph', () => {
    expect(splitEnding('Thanks, Ana! See you soon.')).toEqual({
      body: 'Thanks, Ana! See you soon.',
      ending: null,
    });
  });
});

describe('withSignOff', () => {
  it('adds the sign-off on its own line', () => {
    expect(withSignOff('Thanks, Ana!', '– The Team')).toBe('Thanks, Ana!\n\n– The Team');
  });
  it('never doubles a sign-off the draft already has', () => {
    expect(withSignOff('Thanks, Ana!\n\n– The Team', '– The Team')).toBe(
      'Thanks, Ana!\n\n– The Team',
    );
  });
  it('swaps a sign-off copied from earlier replies for the current one', () => {
    expect(withSignOff('Thanks, Ana!\n\n– Old name', '– New name', ['– Old name'])).toBe(
      'Thanks, Ana!\n\n– New name',
    );
  });
  it('keeps a last paragraph that is part of the reply', () => {
    expect(withSignOff('Thanks, Ana!\n\nSee you soon.', '– The Team', ['– Old name'])).toBe(
      'Thanks, Ana!\n\nSee you soon.\n\n– The Team',
    );
  });
  it('leaves the draft alone when there is no sign-off to add', () => {
    expect(withSignOff('Thanks, Ana!\n', '')).toBe('Thanks, Ana!');
  });
});
