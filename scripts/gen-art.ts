// Art generation through OpenAI Images (spec §7). Run by hand: `OPENAI_API_KEY=… npm run art -- [--only aira]
// [--kind portrait|full] [--force]`. The key is read from the environment and never printed; the log carries only
// the heroine id, the image kind and a status.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prompt } from '../art/prompts';
import type { ArtKind } from '../art/prompts';
import { HERO_IDS } from '../src/engine';
import type { HeroId } from '../src/engine';

const API = 'https://api.openai.com/v1/images';
const MODEL = 'gpt-image-1';
const QUALITY = 'medium';
const PORTRAIT_SIZE = '1024x1024';
const FULL_SIZE = '1024x1536';

export type ImageSize = typeof PORTRAIT_SIZE | typeof FULL_SIZE;
export type ImageRequest =
  | { endpoint: 'generations'; prompt: string; size: ImageSize }
  | { endpoint: 'edits'; prompt: string; size: ImageSize; image: Uint8Array };

/** A non-2xx answer of the Images API: only the status is kept (the body is not logged). */
export class ImagesError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** One Images API call; returns the PNG bytes of `data[0].b64_json`. */
export async function callImages(fetchImpl: typeof fetch, apiKey: string, req: ImageRequest): Promise<Buffer> {
  const auth = { Authorization: `Bearer ${apiKey}` };
  let res: Response;
  if (req.endpoint === 'generations') {
    res = await fetchImpl(`${API}/generations`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: req.prompt, size: req.size, quality: QUALITY, n: 1 }),
    });
  } else {
    const form = new FormData();
    form.append('model', MODEL);
    // Blob takes ArrayBuffer-backed views; a Buffer is typed as possibly SharedArrayBuffer-backed, so copy it.
    form.append('image', new Blob([new Uint8Array(req.image)], { type: 'image/png' }), 'portrait.png');
    form.append('prompt', req.prompt);
    form.append('size', req.size);
    form.append('quality', QUALITY);
    form.append('n', '1');
    // Content-Type with the multipart boundary is set by fetch itself.
    res = await fetchImpl(`${API}/edits`, { method: 'POST', headers: auth, body: form });
  }
  if (!res.ok) throw new ImagesError(res.status);
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('пустой ответ: нет data[0].b64_json');
  return Buffer.from(b64, 'base64');
}

interface Options {
  ids: HeroId[];
  kinds: ArtKind[];
  force: boolean;
}

function parseArgs(argv: string[]): Options | string {
  const opts: Options = { ids: [...HERO_IDS], kinds: ['portrait', 'full'], force: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = (argv[i] ?? '').split('=');
    if (flag === '--force') {
      opts.force = true;
    } else if (flag === '--only') {
      const id = inline ?? argv[++i];
      if (!HERO_IDS.includes(id as HeroId)) return `неизвестная героиня: ${id ?? '(пусто)'}; есть ${HERO_IDS.join(', ')}`;
      opts.ids = [id as HeroId];
    } else if (flag === '--kind') {
      const kind = inline ?? argv[++i];
      if (kind !== 'portrait' && kind !== 'full') return `--kind принимает portrait или full, а не ${kind ?? '(пусто)'}`;
      opts.kinds = [kind];
    } else {
      return `неизвестный аргумент: ${flag}`;
    }
  }
  return opts;
}

const describeError = (e: unknown): string => (e instanceof ImagesError ? `HTTP ${e.status}` : 'сбой запроса');

export interface RunDeps {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  outDir: string;
  log: (line: string) => void;
}

/** The CLI body; returns the process exit code. */
export async function run(argv: string[], deps: RunDeps): Promise<number> {
  const { env, fetchImpl, outDir, log } = deps;
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    log('Нет ключа OpenAI. Запустите так: OPENAI_API_KEY=ваш_ключ npm run art -- [--only aira] [--kind portrait|full] [--force]');
    return 1;
  }
  const opts = parseArgs(argv);
  if (typeof opts === 'string') {
    log(opts);
    return 1;
  }
  mkdirSync(outDir, { recursive: true });

  let failed = 0;
  for (const id of opts.ids) {
    const portraitPath = join(outDir, `${id}-portrait.png`);
    for (const kind of opts.kinds) {
      const file = join(outDir, `${id}-${kind}.png`);
      if (existsSync(file) && !opts.force) {
        log(`${id} ${kind}: уже есть, пропуск`);
        continue;
      }
      const text = prompt(id, kind);
      try {
        let png: Buffer;
        if (kind === 'portrait') {
          png = await callImages(fetchImpl, apiKey, { endpoint: 'generations', prompt: text, size: PORTRAIT_SIZE });
        } else if (existsSync(portraitPath)) {
          // The portrait is the reference, so the face and the costume match.
          try {
            const image = readFileSync(portraitPath);
            png = await callImages(fetchImpl, apiKey, { endpoint: 'edits', prompt: text, size: FULL_SIZE, image });
          } catch (e) {
            log(`${id} full: edits — ${describeError(e)}, генерация без референса`);
            png = await callImages(fetchImpl, apiKey, { endpoint: 'generations', prompt: text, size: FULL_SIZE });
          }
        } else {
          log(`${id} full: нет портрета, генерация без референса`);
          png = await callImages(fetchImpl, apiKey, { endpoint: 'generations', prompt: text, size: FULL_SIZE });
        }
        writeFileSync(file, png);
        log(`${id} ${kind}: готово`);
      } catch (e) {
        failed++;
        log(`${id} ${kind}: ошибка ${describeError(e)}`);
      }
    }
  }
  if (failed > 0) log(`не получилось: ${failed}; повторный запуск догенерирует только недостающие`);
  return failed > 0 ? 1 : 0;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const outDir = fileURLToPath(new URL('../art/out/', import.meta.url));
  run(process.argv.slice(2), { env: process.env, fetchImpl: fetch, outDir, log: (l) => console.log(l) })
    .then((code) => { process.exitCode = code; });
}
