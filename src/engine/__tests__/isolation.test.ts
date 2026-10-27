import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ENGINE_DIR = join(__dirname, '..');

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('изоляция движка', () => {
  it('файлы src/engine импортируют только относительные пути', () => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(ENGINE_DIR)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1]!;
        if (!spec.startsWith('.')) offenders.push(`${relative(ENGINE_DIR, file)}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
