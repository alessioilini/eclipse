import type { ReactNode } from 'react';
import styles from './Button.module.css';
import { cx } from './cx';

export type ButtonProps = {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
};

export function Button({ variant, size = 'md', disabled, onClick, children, testId }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(styles.button, styles[variant], size === 'lg' && styles.lg)}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
