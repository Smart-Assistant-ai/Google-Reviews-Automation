import { describe, expect, it } from 'vitest';
import { slug, toCsv } from './csv';

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(
      toCsv([
        ['a', 1],
        ['b', 2.5],
      ]),
    ).toBe('a,1\r\nb,2.5');
  });

  it('leaves empty cells for missing values', () => {
    expect(toCsv([[null, undefined, Number.NaN, 0]])).toBe(',,,0');
  });

  it('quotes cells with commas, quotes or line breaks', () => {
    expect(toCsv([['Smith, Jo', 'say "hi"', 'two\nlines']])).toBe(
      '"Smith, Jo","say ""hi""","two\nlines"',
    );
  });

  it('stops spreadsheet apps from running text as a formula', () => {
    expect(toCsv([['=SUM(A1)', '+1', '@x', 'fine']])).toBe("'=SUM(A1),'+1,'@x,fine");
  });

  it('keeps negative numbers as numbers', () => {
    expect(toCsv([[-3]])).toBe('-3');
  });
});

describe('slug', () => {
  it('makes a name safe for a file', () => {
    expect(slug('  Café Rosé & Co. (Main St) ')).toBe('cafe-rose-co-main-st');
    expect(slug('Résumé')).toBe('resume');
  });
});
