import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('слои', () => {
  it.each(['game', 'store'])('src/%s не импортирует React', (dir) => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(join(SRC, dir))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1]!;
        if (spec === 'react' || spec.startsWith('react/') || spec.startsWith('react-dom')) {
          offenders.push(`${relative(SRC, file)}: ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
