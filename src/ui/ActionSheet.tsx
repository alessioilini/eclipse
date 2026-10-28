import styles from './ActionSheet.module.css';
import { cx } from './cx';

export type SheetItem = { key: string; label: string; detail?: string; disabled?: boolean; reason?: string };

export type ActionSheetProps = { items: SheetItem[]; onPick: (key: string) => void; onClose: () => void };

export function ActionSheet({ items, onPick, onClose }: ActionSheetProps) {
  return (
    <div className={styles.root}>
      <div className={styles.backdrop} data-testid="sheet-backdrop" onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-modal="true">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            data-testid={`sheet-item-${item.key}`}
            className={cx(styles.item, item.disabled && 'disabled')}
            disabled={item.disabled}
            onClick={() => onPick(item.key)}
          >
            <span className={styles.row}>
              <span className={styles.label}>{item.label}</span>
              {item.detail && <span className={styles.detail}>{item.detail}</span>}
            </span>
            {item.disabled && item.reason && <span className={styles.reason}>{item.reason}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
