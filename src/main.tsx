import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createCloudWriter, loadCloud, type CloudSections } from './game/save/cloud';
import { loadSave } from './game/save/storage';
import { createPlatform, type Platform } from './platform';
import { attachPersistence, hydrate } from './store';
import './styles/tokens.css';
import './styles/global.css';

type SaveStorage = Parameters<typeof loadSave>[0];

/**
 * Загружает сохранение в стор и подключает его запись; возвращает отписку записи. С облаком Telegram
 * (спека §6) профиль, колоды и настройки берутся из облака поверх localStorage; пустое облако
 * получает локальный прогресс. Отказ облака при чтении — предупреждение, облако на этот запуск отключено.
 */
export async function boot(storage?: SaveStorage, platform?: Platform): Promise<() => void> {
  const local = loadSave(storage);
  let cloud = platform?.cloud ?? null;
  let fromCloud: CloudSections | null = null;
  if (cloud) {
    try {
      fromCloud = await loadCloud(cloud);
    } catch (e) {
      console.warn('[cloud] облако недоступно, игра работает на localStorage', e);
      cloud = null;
    }
  }
  const save = fromCloud ? { ...local, ...fromCloud } : local;
  if (cloud && !fromCloud) {
    // Первый запуск в Telegram: переносим локальный прогресс в облако.
    const writer = createCloudWriter(cloud);
    writer.write(save);
    await writer.flush();
  }
  hydrate(save);
  return attachPersistence(storage, cloud ?? undefined);
}

const root = document.getElementById('root');
if (root) {
  // Платформа (Telegram или web) создаётся до загрузки и отрисовки: экраны берут её через getPlatform().
  const platform = await createPlatform();
  platform.ready();
  await boot(undefined, platform);
  createRoot(root).render(<App />);
}
