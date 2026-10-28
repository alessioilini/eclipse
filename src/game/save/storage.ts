import { defaultSave, type SaveV1 } from './defaults';
import { migrate } from './migrate';

export type { SaveV1 } from './defaults';

export const SAVE_KEY = 'eclipse.save';

type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): SaveStorage | undefined {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : undefined;
  } catch {
    return undefined; // SecurityError при заблокированном хранилище
  }
}

export function loadSave(storage: SaveStorage | undefined = defaultStorage()): SaveV1 {
  if (!storage) return defaultSave();
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (e) {
    console.warn('[save] не удалось прочитать хранилище, взято сохранение по умолчанию', e);
    return defaultSave();
  }
  if (raw === null) return defaultSave();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('[save] повреждённый JSON, взято сохранение по умолчанию', e);
    return defaultSave();
  }
  const migrated = migrate(parsed);
  if (!migrated) {
    console.warn('[save] неизвестная версия или форма записи, взято сохранение по умолчанию');
    return defaultSave();
  }
  return migrated;
}

export function writeSave(save: SaveV1, storage: SaveStorage | undefined = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {
    console.warn('[save] не удалось записать сохранение', e);
  }
}

/**
 * Метка «локальное сохранение новее облака»: ставится при каждой записи сохранения и снимается, когда
 * облако приняло все разделы. С меткой при запуске локальные разделы важнее облачных (спека §12).
 */
export const UNSYNCED_KEY = 'eclipse.unsynced';

export function markUnsynced(storage: SaveStorage | undefined = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(UNSYNCED_KEY, '1');
  } catch (e) {
    console.warn('[save] не удалось записать метку несинхронизированного сохранения', e);
  }
}

export function clearUnsynced(storage: SaveStorage | undefined = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(UNSYNCED_KEY);
  } catch (e) {
    console.warn('[save] не удалось снять метку несинхронизированного сохранения', e);
  }
}

export function isUnsynced(storage: SaveStorage | undefined = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(UNSYNCED_KEY) === '1';
  } catch {
    return false;
  }
}
