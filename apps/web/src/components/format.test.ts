import { describe, expect, it } from 'vitest';
import { capitalize, plural } from './format';

describe('plural', () => {
  it('uses the single word only for exactly one', () => {
    expect(plural(1, 'review')).toBe('1 review');
    expect(plural(0, 'review')).toBe('0 reviews');
    expect(plural(2, 'review')).toBe('2 reviews');
  });

  it('takes an irregular plural', () => {
    expect(plural(3, 'reply', 'replies')).toBe('3 replies');
  });
});

describe('capitalize', () => {
  it('capitalises only the first letter', () => {
    expect(capitalize('supportive trainers')).toBe('Supportive trainers');
    expect(capitalize('price & billing')).toBe('Price & billing');
    expect(capitalize('Wi-Fi')).toBe('Wi-Fi');
    expect(capitalize('')).toBe('');
  });
});
