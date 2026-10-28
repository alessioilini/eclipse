import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prompt } from '../art/prompts';
import { callImages, run } from './gen-art';

const KEY = 'sk-test-secret-123';
const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'gen-art-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ok = (bytes: string) =>
  new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(bytes).toString('base64') }] }), { status: 200 });

type Call = { url: string; init: RequestInit };
function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return respond(url, init ?? {});
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function harness(argv: string[], env: Record<string, string | undefined>, fetchImpl: typeof fetch, outDir: string) {
  const lines: string[] = [];
  const done = run(argv, { env, fetchImpl, outDir, log: (l) => lines.push(l) });
  return { done, lines };
}

describe('gen-art', () => {
  it('без OPENAI_API_KEY выходит с подсказкой и не ходит в сеть', async () => {
    const { fetch, calls } = fakeFetch(() => ok('x'));
    const { done, lines } = harness([], {}, fetch, tempDir());
    expect(await done).toBe(1);
    expect(calls).toHaveLength(0);
    expect(lines.join('\n')).toMatch(/OPENAI_API_KEY/);
    expect(lines.join('\n')).toMatch(/[а-я]/);
  });

  it('неизвестная героиня в --only — ошибка без запросов', async () => {
    const { fetch, calls } = fakeFetch(() => ok('x'));
    const { done } = harness(['--only', 'nobody'], { OPENAI_API_KEY: KEY }, fetch, tempDir());
    expect(await done).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it('портрет: JSON в generations, PNG в <id>-portrait.png, ключ не попадает в лог', async () => {
    const outDir = tempDir();
    const { fetch, calls } = fakeFetch(() => ok('PORTRAIT'));
    const { done, lines } = harness(['--only', 'aira', '--kind', 'portrait'], { OPENAI_API_KEY: KEY }, fetch, outDir);
    expect(await done).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/images/generations');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      model: 'gpt-image-1', prompt: prompt('aira', 'portrait'), size: '1024x1024', quality: 'medium', n: 1,
    });
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe(`Bearer ${KEY}`);
    expect(readFileSync(join(outDir, 'aira-portrait.png'), 'utf8')).toBe('PORTRAIT');
    expect(lines.join('\n')).not.toContain(KEY);
    expect(lines.join('\n')).toContain('aira');
  });

  it('существующие файлы пропускаются без --force и перезаписываются с ним', async () => {
    const outDir = tempDir();
    writeFileSync(join(outDir, 'aira-portrait.png'), 'OLD-P');
    writeFileSync(join(outDir, 'aira-full.png'), 'OLD-F');
    const first = fakeFetch(() => ok('NEW'));
    expect(await harness(['--only', 'aira'], { OPENAI_API_KEY: KEY }, first.fetch, outDir).done).toBe(0);
    expect(first.calls).toHaveLength(0);
    expect(readFileSync(join(outDir, 'aira-portrait.png'), 'utf8')).toBe('OLD-P');

    const forced = fakeFetch(() => ok('NEW'));
    expect(await harness(['--only', 'aira', '--force'], { OPENAI_API_KEY: KEY }, forced.fetch, outDir).done).toBe(0);
    expect(forced.calls.map((c) => c.url.split('/').pop())).toEqual(['generations', 'edits']);
    expect(readFileSync(join(outDir, 'aira-portrait.png'), 'utf8')).toBe('NEW');
    expect(readFileSync(join(outDir, 'aira-full.png'), 'utf8')).toBe('NEW');
  });

  it('арт в рост: edits с портретом; при ошибке edits — generations 1024x1536', async () => {
    const outDir = tempDir();
    writeFileSync(join(outDir, 'nerisa-portrait.png'), 'PORTRAIT-BYTES');
    const { fetch, calls } = fakeFetch((url) =>
      url.endsWith('/edits') ? new Response('{"error":{}}', { status: 400 }) : ok('FULL'),
    );
    const { done, lines } = harness(['--only', 'nerisa', '--kind', 'full'], { OPENAI_API_KEY: KEY }, fetch, outDir);
    expect(await done).toBe(0);

    expect(calls.map((c) => c.url)).toEqual([
      'https://api.openai.com/v1/images/edits',
      'https://api.openai.com/v1/images/generations',
    ]);
    const form = calls[0]!.init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('model')).toBe('gpt-image-1');
    expect(form.get('prompt')).toBe(prompt('nerisa', 'full'));
    expect(form.get('size')).toBe('1024x1536');
    expect(form.get('n')).toBe('1');
    expect(form.get('quality')).toBe('medium');
    const image = form.get('image') as Blob;
    expect(image).toBeInstanceOf(Blob);
    expect(Buffer.from(await image.arrayBuffer()).toString('utf8')).toBe('PORTRAIT-BYTES');

    expect(JSON.parse(String(calls[1]!.init.body))).toMatchObject({
      model: 'gpt-image-1', prompt: prompt('nerisa', 'full'), size: '1024x1536', n: 1,
    });
    expect(readFileSync(join(outDir, 'nerisa-full.png'), 'utf8')).toBe('FULL');
    expect(lines.join('\n')).toMatch(/nerisa.*400/);
    expect(lines.join('\n')).not.toContain(KEY);
  });

  it('ошибка портрета — код 1, файл не создаётся, остальные героини продолжаются', async () => {
    const outDir = tempDir();
    const { fetch } = fakeFetch(() => new Response('nope', { status: 500 }));
    const { done, lines } = harness(['--kind', 'portrait'], { OPENAI_API_KEY: KEY }, fetch, outDir);
    expect(await done).toBe(1);
    expect(existsSync(join(outDir, 'aira-portrait.png'))).toBe(false);
    expect(lines.filter((l) => /500/.test(l))).toHaveLength(12);
  });

  it('callImages бросает ошибку со статусом на не-2xx', async () => {
    const { fetch } = fakeFetch(() => new Response('', { status: 429 }));
    await expect(callImages(fetch, KEY, { endpoint: 'generations', prompt: 'p', size: '1024x1024' }))
      .rejects.toMatchObject({ status: 429 });
  });
});
