// Packs the generated PNGs into WebP for the game (spec §7): `npm run art:pack` reads `art/out/<id>-portrait.png`
// and `<id>-full.png` and writes `public/art/<id>-portrait-128.webp`, `-portrait-512.webp`, `-full-512.webp` and
// `-full-1024.webp`. A missing source is skipped with one log line, so a partial generation still packs.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { HERO_IDS } from '../src/engine';

/** Output widths and heights per kind; the width is also the `srcSet` descriptor in `HeroArt`. */
const VARIANTS = {
  portrait: [[128, 128], [512, 512]],
  full: [[512, 768], [1024, 1536]],
} as const;

const QUALITY = 80;

/** Returns the written WebP paths and the skipped (missing) source PNG paths. */
export async function packArt(opts: { inDir: string; outDir: string }): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = [];
  const skipped: string[] = [];
  mkdirSync(opts.outDir, { recursive: true });
  for (const id of HERO_IDS) {
    for (const kind of ['portrait', 'full'] as const) {
      const src = join(opts.inDir, `${id}-${kind}.png`);
      if (!existsSync(src)) {
        skipped.push(src);
        console.log(`${id} ${kind}: нет исходника ${src}, пропуск`);
        continue;
      }
      for (const [width, height] of VARIANTS[kind]) {
        const out = join(opts.outDir, `${id}-${kind}-${width}.webp`);
        await sharp(src).resize(width, height, { fit: 'cover' }).webp({ quality: QUALITY }).toFile(out);
        written.push(out);
      }
    }
  }
  console.log(`готово: ${written.length} WebP, пропущено исходников: ${skipped.length}`);
  return { written, skipped };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const inDir = fileURLToPath(new URL('../art/out/', import.meta.url));
  const outDir = fileURLToPath(new URL('../public/art/', import.meta.url));
  packArt({ inDir, outDir }).catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
