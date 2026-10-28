import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const outDir = resolve(root, '.tmp-dist');

describe('базовый путь сборки (медленный тест)', () => {
  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('сборка с BASE_PATH=/eclipse/ даёт index.html с путями /eclipse/assets/', () => {
    rmSync(outDir, { recursive: true, force: true });
    execSync('npx vite build --outDir .tmp-dist --emptyOutDir', {
      cwd: root,
      env: { ...process.env, BASE_PATH: '/eclipse/' },
      stdio: 'pipe',
    });
    const indexPath = resolve(outDir, 'index.html');
    expect(existsSync(indexPath)).toBe(true);
    const html = readFileSync(indexPath, 'utf8');

    const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
    const assetRefs = refs.filter((r) => /\.(js|css)$/.test(r));
    expect(assetRefs.length).toBeGreaterThan(0);
    for (const r of assetRefs) {
      expect(r.startsWith('/eclipse/assets/')).toBe(true);
    }
    expect(html).not.toMatch(/(?:src|href)="\/assets\//);

    // встроенная оболочка (инлайновый стиль/скрипт из index.html) сохранилась
    const source = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(source).toMatch(/<(style|script)(?![^>]*\bsrc=)[^>]*>/);
    expect(html).toMatch(/<(style|script)(?![^>]*\bsrc=)[^>]*>/);
    expect(html).toContain('id="root"');
  }, 120_000);
});
