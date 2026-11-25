import { describe, expect, it } from 'vitest';
import { planTotal } from '../src/billing';

// The totals in the "ReplyPilot Proposal" tab of the pricing sheet, so the app charges what was agreed.
describe('planTotal', () => {
  it.each([
    [1, 19],
    [2, 28],
    [3, 37],
    [5, 55],
    [10, 100],
    [15, 125],
    [25, 175],
    [50, 300],
    [100, 550],
  ])('%i locations cost $%i a month', (locations, total) => {
    expect(planTotal(locations, 'month')).toBe(total);
  });

  it('charges 10 months for a year', () => {
    expect(planTotal(1, 'year')).toBe(190);
    expect(planTotal(10, 'year')).toBe(1000);
  });

  it('charges for at least one location', () => {
    expect(planTotal(0, 'month')).toBe(19);
  });
});
