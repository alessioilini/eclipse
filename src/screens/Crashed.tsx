import { ru } from '../i18n/ru';
import { navigate } from '../router';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import styles from './Crashed.module.css';

/** Экран после ошибки рендера (U41): сбросить матч (частая причина — несовместимое состояние) или в меню. */
export function Crashed({ onDone }: { onDone: () => void }) {
  const resetMatch = () => {
    useStore.getState().clearMatch();
    navigate({ name: 'menu' });
    onDone();
  };
  const toMenu = () => {
    navigate({ name: 'menu' });
    onDone();
  };
  return (
    <main className={styles.screen} role="alert" data-testid="crashed">
      <p className={styles.text}>{ru.common.crashed}</p>
      <Button variant="primary" onClick={resetMatch}>{ru.common.resetMatch}</Button>
      <Button variant="secondary" onClick={toMenu}>{ru.common.toMenu}</Button>
    </main>
  );
}
