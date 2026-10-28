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
/** `gpt-image-1` отключена OpenAI 23 октября 2026. Основная модель Sunburst (точнее держит лицо в edits),
 * альтернатива `gpt-image-2.5-flare`; переопределяется `--model` или переменной `OPENAI_IMAGE_MODEL`. */
export const DEFAULT_MODEL = 'gpt-image-2.5-sunburst';
/** Качество по умолчанию; `high`/`xhigh` заметно лучше рисуют руки, но дороже в 3–6 раз. */
export const DEFAULT_QUALITY = 'medium';
const QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Quality = (typeof QUALITIES)[number];
const isQuality = (q: string): q is Quality => (QUALITIES as readonly string[]).includes(q);
const PORTRAIT_SIZE = '1024x1024';
const FULL_SIZE = '1024x1536';

export type ImageSize = typeof PORTRAIT_SIZE | typeof FULL_SIZE;
export type ImageRequest =
  | { endpoint: 'generations'; prompt: string; size: ImageSize }
  | { endpoint: 'edits'; prompt: string; size: ImageSize; image: Uint8Array };

/** A non-2xx answer of the Images API: the status plus the API's own error code/message (never the request). */
export class ImagesError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null = null,
  ) {
    super(detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`);
  }
}

/** Reads `error.code` / `error.message` from an error body; the key never appears there. */
async function errorDetail(res: Response): Promise<string | null> {
  try {
    const json = (await res.json()) as {
      error?: { code?: unknown; message?: unknown };
    };
    const code = typeof json.error?.code === 'string' ? json.error.code : null;
    const message = typeof json.error?.message === 'string' ? json.error.message.slice(0, 300) : null;
    return [code, message].filter(Boolean).join(' — ') || null;
  } catch {
    return null;
  }
}

/** One Images API call; returns the PNG bytes of `data[0].b64_json`. */
export async function callImages(
  fetchImpl: typeof fetch,
  apiKey: string,
  req: ImageRequest,
  model = DEFAULT_MODEL,
  quality: Quality = DEFAULT_QUALITY,
): Promise<Buffer> {
  const auth = { Authorization: `Bearer ${apiKey}` };
  let res: Response;
  if (req.endpoint === 'generations') {
    res = await fetchImpl(`${API}/generations`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: req.prompt,
        size: req.size,
        quality,
        n: 1,
      }),
    });
  } else {
    const form = new FormData();
    form.append('model', model);
    // Blob takes ArrayBuffer-backed views; a Buffer is typed as possibly SharedArrayBuffer-backed, so copy it.
    form.append('image', new Blob([new Uint8Array(req.image)], { type: 'image/png' }), 'portrait.png');
    form.append('prompt', req.prompt);
    form.append('size', req.size);
    form.append('quality', quality);
    form.append('n', '1');
    // Content-Type with the multipart boundary is set by fetch itself.
    res = await fetchImpl(`${API}/edits`, {
      method: 'POST',
      headers: auth,
      body: form,
    });
  }
  if (!res.ok) throw new ImagesError(res.status, await errorDetail(res));
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('пустой ответ: нет data[0].b64_json');
  return Buffer.from(b64, 'base64');
}

interface Options {
  ids: HeroId[];
  kinds: ArtKind[];
  force: boolean;
  model: string | null;
  quality: Quality | null;
  /** Сколько кандидатов рисовать на картинку: при N > 1 файлы `<id>-<kind>-v1..N.png`, основной файл не трогается. */
  variants: number;
}

function parseArgs(argv: string[]): Options | string {
  const opts: Options = {
    ids: [...HERO_IDS],
    kinds: ['portrait', 'full'],
    force: false,
    model: null,
    quality: null,
    variants: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = (argv[i] ?? '').split('=');
    if (flag === '--variants') {
      const n = Number(inline ?? argv[++i]);
      if (!Number.isInteger(n) || n < 1 || n > 8) return '--variants принимает целое число от 1 до 8';
      opts.variants = n;
    } else if (flag === '--quality') {
      const q = inline ?? argv[++i];
      if (!q || !isQuality(q)) return `--quality принимает ${QUALITIES.join('|')}, а не ${q ?? '(пусто)'}`;
      opts.quality = q;
    } else if (flag === '--model') {
      const model = inline ?? argv[++i];
      if (!model) return '--model требует имя модели, например gpt-image-2.5-flare';
      opts.model = model;
    } else if (flag === '--force') {
      opts.force = true;
    } else if (flag === '--only') {
      const id = inline ?? argv[++i];
      if (!HERO_IDS.includes(id as HeroId))
        return `неизвестная героиня: ${id ?? '(пусто)'}; есть ${HERO_IDS.join(', ')}`;
      opts.ids = [id as HeroId];
    } else if (flag === '--kind') {
      const kind = inline ?? argv[++i];
      if (kind !== 'portrait' && kind !== 'full')
        return `--kind принимает portrait или full, а не ${kind ?? '(пусто)'}`;
      opts.kinds = [kind];
    } else {
      return `неизвестный аргумент: ${flag}`;
    }
  }
  return opts;
}

/** Причина сбоя без деталей запроса: статус HTTP или код сетевой ошибки (ENOTFOUND, ECONNRESET, …). */
const describeError = (e: unknown): string => {
  if (e instanceof ImagesError) return e.message;
  const cause = e instanceof Error ? (e.cause as { code?: unknown } | undefined) : undefined;
  const code = cause && typeof cause.code === 'string' ? cause.code : null;
  return code ? `сбой запроса (${code})` : 'сбой запроса';
};

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
    log(
      'Нет ключа OpenAI. Запустите так: OPENAI_API_KEY=ваш_ключ npm run art -- [--only aira] [--kind portrait|full] [--force]',
    );
    return 1;
  }
  // Ключ попадает в заголовок HTTP: не-ASCII символы (например, оставленный шаблон «ваш_ключ») ломают каждый запрос.
  if (!/^[\x21-\x7e]+$/.test(apiKey)) {
    log('Ключ OpenAI содержит недопустимые символы: подставьте настоящий ключ вместо шаблона.');
    return 1;
  }
  const opts = parseArgs(argv);
  if (typeof opts === 'string') {
    log(opts);
    return 1;
  }
  const model = opts.model ?? env.OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL;
  const envQuality = env.OPENAI_IMAGE_QUALITY;
  if (envQuality !== undefined && !isQuality(envQuality)) {
    log(`OPENAI_IMAGE_QUALITY принимает ${QUALITIES.join('|')}, а не ${envQuality}`);
    return 1;
  }
  const quality: Quality = opts.quality ?? envQuality ?? DEFAULT_QUALITY;
  log(`модель: ${model}, качество: ${quality}`);
  mkdirSync(outDir, { recursive: true });

  let failed = 0;
  for (const id of opts.ids) {
    const portraitPath = join(outDir, `${id}-portrait.png`);
    const fullPath = join(outDir, `${id}-full.png`);
    // A kept full-body art (a chosen variant) is the portrait's reference; when the full is about to be redrawn
    // in this run, the portrait is drawn fresh and the full then follows it as usual.
    const fullWillBeRedrawn = opts.kinds.includes('full') && (opts.force || !existsSync(fullPath));
    for (const kind of opts.kinds) {
      const file = join(outDir, `${id}-${kind}.png`);
      if (opts.variants === 1 && existsSync(file) && !opts.force) {
        log(`${id} ${kind}: уже есть, пропуск`);
        continue;
      }
      const text = prompt(id, kind);
      for (let v = 1; v <= opts.variants; v++) {
        const target = opts.variants === 1 ? file : join(outDir, `${id}-${kind}-v${v}.png`);
        const label = opts.variants === 1 ? `${id} ${kind}` : `${id} ${kind} v${v}`;
        try {
          let png: Buffer;
          if (kind === 'portrait' && existsSync(fullPath) && !fullWillBeRedrawn) {
            // The full-body art already exists (a chosen variant): it is the reference so the face matches.
            try {
              const image = readFileSync(fullPath);
              png = await callImages(
                fetchImpl,
                apiKey,
                { endpoint: 'edits', prompt: text, size: PORTRAIT_SIZE, image },
                model,
                quality,
              );
            } catch (e) {
              log(`${id} portrait: edits — ${describeError(e)}, генерация без референса`);
              png = await callImages(
                fetchImpl,
                apiKey,
                { endpoint: 'generations', prompt: text, size: PORTRAIT_SIZE },
                model,
                quality,
              );
            }
          } else if (kind === 'portrait') {
            png = await callImages(
              fetchImpl,
              apiKey,
              { endpoint: 'generations', prompt: text, size: PORTRAIT_SIZE },
              model,
              quality,
            );
          } else if (existsSync(portraitPath)) {
            // The portrait is the reference, so the face and the costume match.
            try {
              const image = readFileSync(portraitPath);
              png = await callImages(
                fetchImpl,
                apiKey,
                { endpoint: 'edits', prompt: text, size: FULL_SIZE, image },
                model,
                quality,
              );
            } catch (e) {
              log(`${id} full: edits — ${describeError(e)}, генерация без референса`);
              png = await callImages(
                fetchImpl,
                apiKey,
                { endpoint: 'generations', prompt: text, size: FULL_SIZE },
                model,
                quality,
              );
            }
          } else {
            log(`${id} full: нет портрета, генерация без референса`);
            png = await callImages(
              fetchImpl,
              apiKey,
              { endpoint: 'generations', prompt: text, size: FULL_SIZE },
              model,
              quality,
            );
          }
          writeFileSync(target, png);
          log(`${label}: готово`);
        } catch (e) {
          failed++;
          log(`${label}: ошибка ${describeError(e)}`);
        }
      }
      if (opts.variants > 1) log(`${id} ${kind}: выберите вариант и скопируйте его в ${file}`);
    }
  }
  if (failed > 0) log(`не получилось: ${failed}; повторный запуск догенерирует только недостающие`);
  return failed > 0 ? 1 : 0;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const outDir = fileURLToPath(new URL('../art/out/', import.meta.url));
  run(process.argv.slice(2), {
    env: process.env,
    fetchImpl: fetch,
    outDir,
    log: (l) => console.log(l),
  })
    .then((code) => {
      process.exitCode = code;
    })
    // Only the message: error objects could carry request details. Messages here never contain the key.
    .catch((e: unknown) => {
      console.error(`gen-art: ${e instanceof Error ? e.message : 'ошибка'}`);
      process.exitCode = 1;
    });
}
