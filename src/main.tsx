import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadCloud, type CloudSections } from './game/save/cloud';
import { isUnsynced, loadSave } from './game/save/storage';
import { createPlatform, type Platform } from './platform';
import { attachPersistence, hydrate, type PersistenceHooks } from './store';
import './styles/tokens.css';
import './styles/global.css';

type SaveStorage = Parameters<typeof loadSave>[0];

/** Сколько ждать чтения облака при запуске; дольше — облако на этот запуск отключено. */
export const CLOUD_BOOT_TIMEOUT_MS = 3000;

/** Гонка с таймером: по истечении `ms` — отказ; таймер снимается при любом исходе. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`облако не ответило за ${ms} мс`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Уход страницы в фон: `pagehide` окна и `visibilitychange` в состояние hidden. Возвращает отписку.
 * Telegram и мобильные браузеры могут выгрузить страницу без `beforeunload`, поэтому облако досылается здесь.
 */
export function onPageHide(win: Window, doc: Document): (cb: () => void) => () => void {
  return (cb) => {
    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') cb();
    };
    win.addEventListener('pagehide', cb);
    doc.addEventListener('visibilitychange', onVisibility);
    return () => {
      win.removeEventListener('pagehide', cb);
      doc.removeEventListener('visibilitychange', onVisibility);
    };
  };
}

/**
 * Загружает сохранение в стор и подключает его запись; возвращает отписку записи. С облаком Telegram
 * (спека §6) профиль, колоды и настройки берутся из облака поверх localStorage; пустое облако
 * получает локальный прогресс. Если локальное сохранение помечено как не дошедшее до облака
 * (`isUnsynced`: прошлый запуск писал без облака или не успел дослать), берётся локальное и
 * отправляется в облако. Компромисс: с меткой локальное побеждает даже более новое облако с другого
 * устройства. Отказ облака при чтении или молчание дольше `CLOUD_BOOT_TIMEOUT_MS` — предупреждение,
 * облако на этот запуск отключено (метка при этом остаётся и ставится заново при каждой записи).
 */
export async function boot(
  storage?: SaveStorage, platform?: Platform, hooks: Pick<PersistenceHooks, 'onHide'> = {},
): Promise<() => void> {
  const local = loadSave(storage);
  let cloud = platform?.cloud ?? null;
  let fromCloud: CloudSections | null = null;
  if (cloud) {
    try {
      fromCloud = await withTimeout(loadCloud(cloud), CLOUD_BOOT_TIMEOUT_MS);
    } catch (e) {
      console.warn('[cloud] облако недоступно, игра работает на localStorage', e);
      cloud = null;
    }
  }
  // Облако пусто (первый запуск в Telegram) или отстаёт от локального: локальное в облако, не задерживая
  // запуск (отказ записи писатель сам предупреждает, метка тогда остаётся до следующего раза).
  const pushLocal = cloud !== null && (fromCloud === null || isUnsynced(storage));
  const save = fromCloud && !pushLocal ? { ...local, ...fromCloud } : local;
  hydrate(save);
  return attachPersistence(storage, cloud ?? undefined, { ...hooks, pushNow: pushLocal });
}

const root = document.getElementById('root');
if (root) {
  // Без top-level await: сборка остаётся на целевых браузерах Vite по умолчанию.
  void (async () => {
    // Платформа (Telegram или web) создаётся до загрузки и отрисовки: экраны берут её через getPlatform().
    const platform = await createPlatform();
    platform.ready();
    await boot(undefined, platform, { onHide: onPageHide(window, document) });
    createRoot(root).render(<App />);
  })();
}
