import type { CloudStorage } from '../../platform/types';
import type { SaveV1 } from './defaults';

/** Ключи облака Telegram (спека §6): матч в облако не попадает, он живёт только в localStorage. */
export const CLOUD_KEYS = {
  profile: 'eclipse.profile',
  decks: 'eclipse.decks',
  settings: 'eclipse.settings',
} as const;

/** Предел длины значения в CloudStorage Telegram. */
export const CLOUD_VALUE_LIMIT = 4096;

export type CloudSections = Partial<Pick<SaveV1, 'profile' | 'decks' | 'activeDeckId' | 'settings'>>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isProfile = (v: unknown): v is SaveV1['profile'] =>
  isObject(v) && Array.isArray(v.unlocked) && typeof v.tutorialStep === 'number' && isObject(v.stats);

const isDecks = (v: unknown): v is Pick<SaveV1, 'decks' | 'activeDeckId'> =>
  isObject(v) && Array.isArray(v.decks) && (v.activeDeckId === null || typeof v.activeDeckId === 'string');

const isSettings = (v: unknown): v is SaveV1['settings'] =>
  isObject(v) && (v.speed === 'normal' || v.speed === 'fast') && typeof v.sound === 'boolean';

/** Разбирает значение ключа; битый JSON или неверная форма — предупреждение и null. */
function parse<T>(key: string, raw: string, check: (v: unknown) => v is T): T | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    console.warn(`[cloud] повреждённый JSON в ${key}, раздел пропущен`, e);
    return null;
  }
  if (!check(value)) {
    console.warn(`[cloud] неверная форма ${key}, раздел пропущен`);
    return null;
  }
  return value;
}

const present = (raw: string | null): raw is string => raw !== null && raw !== '';

/**
 * Читает разделы сохранения из облака. null — облако пусто (первый запуск в Telegram); иначе только
 * найденные и корректные разделы. Ошибка самого облака (отказ getItem) пробрасывается вызывающему.
 */
export async function loadCloud(cloud: CloudStorage): Promise<CloudSections | null> {
  const [profileRaw, decksRaw, settingsRaw] = await Promise.all([
    cloud.getItem(CLOUD_KEYS.profile),
    cloud.getItem(CLOUD_KEYS.decks),
    cloud.getItem(CLOUD_KEYS.settings),
  ]);
  if (!present(profileRaw) && !present(decksRaw) && !present(settingsRaw)) return null;

  const out: CloudSections = {};
  if (present(profileRaw)) {
    const profile = parse(CLOUD_KEYS.profile, profileRaw, isProfile);
    if (profile) out.profile = profile;
  }
  if (present(decksRaw)) {
    const decks = parse(CLOUD_KEYS.decks, decksRaw, isDecks);
    if (decks) {
      out.decks = decks.decks;
      out.activeDeckId = decks.activeDeckId;
    }
  }
  if (present(settingsRaw)) {
    const settings = parse(CLOUD_KEYS.settings, settingsRaw, isSettings);
    if (settings) out.settings = settings;
  }
  return out;
}

/** Сериализованные разделы сохранения по ключам облака. */
function sections(save: SaveV1): [string, string][] {
  return [
    [CLOUD_KEYS.profile, JSON.stringify(save.profile)],
    [CLOUD_KEYS.decks, JSON.stringify({ decks: save.decks, activeDeckId: save.activeDeckId })],
    [CLOUD_KEYS.settings, JSON.stringify(save.settings)],
  ];
}

export type CloudWriter = { write(save: SaveV1): void; flush(): Promise<void> };

/**
 * Отложенная запись в облако: записи в пределах `delayMs` сливаются в одну (таймер не перезапускается),
 * отправляются только разделы, чья строка изменилась с последней успешной записи. Значение длиннее
 * 4096 символов пропускается с предупреждением; отказ setItem предупреждается один раз на писателя,
 * игра продолжает жить на localStorage. Записи выполняются по очереди.
 */
export function createCloudWriter(cloud: CloudStorage, delayMs = 1000): CloudWriter {
  const written = new Map<string, string>();
  let pending: SaveV1 | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let rejectWarned = false;

  async function perform(save: SaveV1): Promise<void> {
    let tooLongWarned = false;
    await Promise.all(sections(save).map(async ([key, value]) => {
      if (written.get(key) === value) return;
      if (value.length > CLOUD_VALUE_LIMIT) {
        if (!tooLongWarned) {
          tooLongWarned = true;
          console.warn(`[cloud] ${key}: ${value.length} символов больше предела ${CLOUD_VALUE_LIMIT}, раздел не записан`);
        }
        return;
      }
      try {
        await cloud.setItem(key, value);
        written.set(key, value);
      } catch (e) {
        if (!rejectWarned) {
          rejectWarned = true;
          console.warn('[cloud] не удалось записать в облако, сохранение остаётся в localStorage', e);
        }
      }
    }));
  }

  function run(): Promise<void> {
    timer = null;
    const save = pending;
    pending = null;
    if (save) chain = chain.then(() => perform(save));
    return chain;
  }

  return {
    write(save) {
      pending = save;
      if (timer === null) timer = setTimeout(() => void run(), delayMs);
    },
    flush() {
      if (timer !== null) clearTimeout(timer);
      return run();
    },
  };
}
