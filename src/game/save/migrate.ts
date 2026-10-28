import type { SaveV1 } from './defaults';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isDeck = (v: unknown): boolean => isObject(v) && Array.isArray(v.heroes) && Array.isArray(v.cards);

/** Поверхностная проверка формы сохранённого матча: состояние со сторонами A/B, обе колоды, режим. */
function isMatch(v: unknown): boolean {
  if (!isObject(v) || !isObject(v.state) || !isObject(v.state.sides)) return false;
  const { sides } = v.state;
  return isObject(sides.A) && isObject(sides.B)
    && isDeck(v.playerDeck) && isDeck(v.opponentDeck)
    && (v.mode === 'free' || v.mode === 'tutorial');
}

/**
 * Приводит сырую запись к актуальной версии; null, если версия неизвестна или форма неверна.
 * Матч неверной формы отбрасывается (с предупреждением), профиль и колоды сохраняются.
 */
export function migrate(raw: unknown): SaveV1 | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  if (!isObject(raw.profile) || !Array.isArray(raw.decks) || !isObject(raw.settings)) return null;
  if (raw.match !== null && raw.match !== undefined && !isMatch(raw.match)) {
    console.warn('[save] повреждённый матч в сохранении, матч сброшен');
    return { ...raw, match: null } as unknown as SaveV1;
  }
  return { ...raw, match: raw.match ?? null } as unknown as SaveV1;
}
