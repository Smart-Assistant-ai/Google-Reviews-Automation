import { describe, expect, it } from 'vitest';
import { cleanTopics } from '../../src/modules/reviews/analysis';

describe('cleanTopics', () => {
  it('keeps only text', () => {
    expect(cleanTopics(['staff', 42, null, { name: 'x' }, 'price'])).toEqual(['staff', 'price']);
  });

  it('keeps at most three, counted after dropping the rest', () => {
    expect(cleanTopics([1, 'a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });

  it('trims each topic and drops blank ones before counting three', () => {
    expect(cleanTopics(['  staff ', '', '   ', 'price', 'wait time', 'parking'])).toEqual([
      'staff',
      'price',
      'wait time',
    ]);
  });

  it('gives nothing for anything that is not a list', () => {
    expect(cleanTopics('staff')).toEqual([]);
    expect(cleanTopics(undefined)).toEqual([]);
    expect(cleanTopics({ 0: 'staff' })).toEqual([]);
  });
});
