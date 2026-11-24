import { describe, expect, it } from 'vitest';
import {
  earlierSignOffs,
  signOffFor,
  splitEnding,
  withSignOff,
} from '../../src/modules/reviews/sign-off';

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
  it('never doubles a sign-off the draft has after a single line break', () => {
    expect(withSignOff('Thanks, Ana!\n– Sam', '– Sam')).toBe('Thanks, Ana!\n\n– Sam');
    expect(withSignOff('Thanks, Ana!\n  – Sam  \n', '– Sam')).toBe('Thanks, Ana!\n\n– Sam');
  });
  it('never doubles a sign-off on several lines', () => {
    expect(withSignOff('Thanks, Ana!\n\nBest,\nSam', 'Best,\nSam')).toBe(
      'Thanks, Ana!\n\nBest,\nSam',
    );
    expect(withSignOff('Thanks, Ana!\nBest,\n  Sam\n', 'Best,\nSam')).toBe(
      'Thanks, Ana!\n\nBest,\nSam',
    );
  });
  it('swaps an earlier sign-off that comes after a single line break', () => {
    expect(withSignOff('Thanks, Ana!\n– Old name', '– New name', ['– Old name'])).toBe(
      'Thanks, Ana!\n\n– New name',
    );
  });
  it('keeps a sign-off that is the whole draft as it is', () => {
    expect(withSignOff('– Sam', '– Sam')).toBe('– Sam');
  });
  it('leaves a sign-off inside the last sentence alone', () => {
    expect(withSignOff('Ask for Sam', 'Sam')).toBe('Ask for Sam\n\nSam');
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

describe('earlierSignOffs', () => {
  it('keeps signatures and leaves out ordinary closing sentences', () => {
    expect(
      earlierSignOffs([
        'Thanks, Ana!\n\n– Old team',
        'Thanks, Ben!\n\nBest, Sam',
        'Sorry, Chris.\n\nPlease contact us directly.',
        'Thanks, Dee!\n\n— Sam.',
        'One paragraph only.',
      ]),
    ).toEqual(['– Old team', 'Best, Sam', '— Sam.']);
  });
  it('leaves out closing sentences in other languages too', () => {
    const replies = [
      'ありがとうございました。\n\nまたのお越しをお待ちしております。',
      '¡Gracias, Ana!\n\n¡Te esperamos pronto!',
      'شكرا لك\n\nهل ستعود قريبا؟',
    ];
    const earlier = earlierSignOffs(replies);
    expect(earlier).toEqual([]);
    expect(withSignOff(replies[0]!, '– Sam', earlier)).toBe(`${replies[0]}\n\n– Sam`);
  });
  it('lets a draft keep a closing sentence an earlier reply also ended with', () => {
    const earlier = earlierSignOffs(['Sorry, Chris.\n\nPlease contact us directly.']);
    expect(withSignOff('Sorry, Ana.\n\nPlease contact us directly.', '', earlier)).toBe(
      'Sorry, Ana.\n\nPlease contact us directly.',
    );
  });
});
