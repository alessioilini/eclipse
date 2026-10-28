import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HERO_IDS } from '../src/engine';
import { packArt } from './art-pack';

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'art-pack-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function pngAt(path: string): Promise<void> {
  await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 60, b: 40 } } })
    .png()
    .toFile(path);
}

describe('art-pack', () => {
  it('из исходных PNG делает четыре WebP нужных размеров и пропускает отсутствующие', async () => {
    const inDir = tempDir();
    const outDir = join(tempDir(), 'public-art');
    await pngAt(join(inDir, 'aira-portrait.png'));
    await pngAt(join(inDir, 'aira-full.png'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { written, skipped } = await packArt({ inDir, outDir });

    const expected: Array<[string, number, number]> = [
      ['aira-portrait-128.webp', 128, 128],
      ['aira-portrait-512.webp', 512, 512],
      ['aira-full-512.webp', 512, 768],
      ['aira-full-1024.webp', 1024, 1536],
    ];
    expect(written.map((p) => p.slice(outDir.length + 1)).sort()).toEqual(expected.map(([f]) => f).sort());
    for (const [file, width, height] of expected) {
      const meta = await sharp(join(outDir, file)).metadata();
      expect(meta.format).toBe('webp');
      expect([meta.width, meta.height]).toEqual([width, height]);
    }

    // Остальные одиннадцать героинь без исходников: по два пропуска и по строке в логе на каждый.
    expect(skipped).toHaveLength((HERO_IDS.length - 1) * 2);
    expect(skipped).toContain(join(inDir, 'fenna-portrait.png'));
    expect(skipped).toContain(join(inDir, 'selena-full.png'));
    expect(log).toHaveBeenCalledTimes(skipped.length + 1);
  });

  it('один портрет без арта в рост: два файла записаны, full пропущен', async () => {
    const inDir = tempDir();
    const outDir = tempDir();
    await pngAt(join(inDir, 'nerisa-portrait.png'));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { written, skipped } = await packArt({ inDir, outDir });

    expect(written.map((p) => p.slice(outDir.length + 1)).sort())
      .toEqual(['nerisa-portrait-128.webp', 'nerisa-portrait-512.webp']);
    expect(skipped).toContain(join(inDir, 'nerisa-full.png'));
  });
});
