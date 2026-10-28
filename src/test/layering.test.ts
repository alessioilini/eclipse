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

/** Все спецификаторы модулей файла: `from '…'`, `import '…'` и `import('…')`. */
function specifiers(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)) out.push(m[1]!);
  return out;
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file);

describe('слои', () => {
  it.each(['game', 'store'])('src/%s не импортирует React', (dir) => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(join(SRC, dir))) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        if (spec === 'react' || spec.startsWith('react/') || spec.startsWith('react-dom')) {
          offenders.push(`${relative(SRC, file)}: ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('вне src/engine движок импортируется только через его index', () => {
    const offenders: string[] = [];
    const engineDir = join(SRC, 'engine');
    for (const file of collectTsFiles(SRC)) {
      if (file.startsWith(engineDir)) continue;
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        const deep = spec.match(/(?:^|\/)engine\/(.+)$/);
        if (!deep || deep[1] === 'index') continue;
        // Тестам доступен симулятор (`randomDeck`): это инструмент разработки, не API движка.
        if (isTest(file) && deep[1] === 'sim') continue;
        offenders.push(`${relative(SRC, file)}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
