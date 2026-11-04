import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The product is for any small business. This stops wording from one industry creeping back in.
const OLD_INDUSTRY = /\b(hotels?|guests?|housekeeping|concierge|front desk|check-?ins?|lobby|rooms?|habitaci[oó]n|estancia|desayuno|breakfast|san francisco|nob hill|harbor & pine|hospitality)\b/i;

const ROOTS = ['apps/api/src', 'apps/web/src', 'apps/web/index.html', 'packages/shared/src'];
const repoRoot = resolve(__dirname, '../../../..');

function files(path: string): string[] {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return [path];
  return readdirSync(path).flatMap((entry) => files(join(path, entry)));
}

describe('generic wording', () => {
  const all = ROOTS.flatMap((root) => files(join(repoRoot, root)));

  it('checks a real set of files', () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it.each(all.map((file) => [file.replace(`${repoRoot}/`, ''), file]))('%s has no industry-specific wording', (_label, file) => {
    const lines = readFileSync(file!, 'utf8').split('\n');
    const hits = lines.map((line, i) => [i + 1, line] as const).filter(([, line]) => OLD_INDUSTRY.test(line));
    expect(hits.map(([n, line]) => `${n}: ${line.trim()}`)).toEqual([]);
  });
});
