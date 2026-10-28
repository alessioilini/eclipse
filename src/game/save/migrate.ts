import type { SaveV1 } from './defaults';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Приводит сырую запись к актуальной версии; null, если версия неизвестна или форма неверна. */
export function migrate(raw: unknown): SaveV1 | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  if (!isObject(raw.profile) || !Array.isArray(raw.decks) || !isObject(raw.settings)) return null;
  return raw as unknown as SaveV1;
}
