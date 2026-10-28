import { useState } from 'react';
import { ru } from '../i18n/ru';
import { Button } from '../ui/Button';
import styles from './NamePrompt.module.css';
import { useAppBack } from './useAppBack';

type Props = {
  onDone(name: string): void;
  onCancel(): void;
};

/** Поле имени: 16 символов — как в коде вызова (байтовый предел добирает `truncateName`). */
const NAME_MAX = 16;

/** Диалог имени перед первым шаринг-вызовом в браузере (спека §5); «Назад» и фон — отмена. */
export function NamePrompt({ onDone, onCancel }: Props) {
  const [value, setValue] = useState('');
  const name = value.trim();
  useAppBack(onCancel);

  const done = () => {
    if (name !== '') onDone(name);
  };

  return (
    <div className={styles.root}>
      <div className={styles.backdrop} onClick={onCancel} />
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-prompt-title"
        onSubmit={(e) => {
          e.preventDefault();
          done();
        }}
      >
        <h2 className={styles.title} id="name-prompt-title">{ru.name.title}</h2>
        <input
          className={styles.input}
          data-testid="name-input"
          aria-labelledby="name-prompt-title"
          placeholder={ru.name.placeholder}
          maxLength={NAME_MAX}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button variant="primary" disabled={name === ''} onClick={done} testId="name-done">{ru.name.done}</Button>
      </form>
    </div>
  );
}
