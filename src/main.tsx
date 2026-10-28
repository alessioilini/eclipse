import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadSave } from './game/save/storage';
import { createPlatform } from './platform';
import { attachPersistence, hydrate } from './store';
import './styles/tokens.css';
import './styles/global.css';

type SaveStorage = Parameters<typeof loadSave>[0];

/** Загружает сохранение в стор и подключает его запись; возвращает отписку записи. */
export function boot(storage?: SaveStorage): () => void {
  hydrate(loadSave(storage));
  return attachPersistence(storage);
}

const root = document.getElementById('root');
if (root) {
  // Платформа (Telegram или web) создаётся до загрузки и отрисовки: экраны берут её через getPlatform().
  const platform = await createPlatform();
  platform.ready();
  boot();
  createRoot(root).render(<App />);
}
