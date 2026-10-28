import { ru } from '../i18n/ru';
import { Button } from './Button';
import styles from './Overlay.module.css';
import { cx } from './cx';

export type AnchorRect = { top: number; left: number; width: number; height: number };

export type OverlayProps = { text: string; anchorRect?: AnchorRect; onNext: () => void };

/**
 * Tutorial overlay: dims the screen, cuts a spotlight hole over `anchorRect`
 * (box-shadow trick) and shows a text bubble. Taps outside the hole are blocked;
 * taps inside the hole reach the highlighted element.
 */
export function Overlay({ text, anchorRect: a, onNext }: OverlayProps) {
  const bubbleOnTop = a !== undefined && a.top + a.height / 2 > window.innerHeight / 2;
  return (
    <div className={styles.root}>
      {a ? (
        <>
          <div className={styles.hole} style={{ top: a.top, left: a.left, width: a.width, height: a.height }} />
          <div className={styles.block} style={{ top: 0, left: 0, right: 0, height: a.top }} />
          <div className={styles.block} style={{ top: a.top + a.height, left: 0, right: 0, bottom: 0 }} />
          <div className={styles.block} style={{ top: a.top, left: 0, width: a.left, height: a.height }} />
          <div className={styles.block} style={{ top: a.top, left: a.left + a.width, right: 0, height: a.height }} />
        </>
      ) : (
        <div className={cx(styles.block, styles.full)} />
      )}
      <div className={cx(styles.bubble, bubbleOnTop ? styles.top : styles.bottom)} role="status">
        <p className={styles.text}>{text}</p>
        <Button variant="primary" onClick={onNext}>
          {ru.tutorial.next}
        </Button>
      </div>
    </div>
  );
}
