import { ru } from '../i18n/ru';
import { Button } from './Button';
import styles from './Overlay.module.css';
import { cx } from './cx';

export type AnchorRect = { top: number; left: number; width: number; height: number };

export type OverlayProps = {
  text: string;
  anchorRect?: AnchorRect;
  onNext?: () => void;
  /** testid подсвеченного элемента и цели шага — для сквозных тестов (`data-anchor`, `data-anchor-target`). */
  anchorId?: string;
  targetId?: string;
};

/**
 * Tutorial overlay. With `onNext` (a text step): dims the screen, cuts a spotlight hole over
 * `anchorRect` (box-shadow trick) and shows a text bubble with «Дальше». Taps outside the hole are
 * blocked; taps inside the hole reach the highlighted element.
 * Without `onNext` (a step that waits for an action): a hint — only an outline around the anchor and
 * a text bubble, nothing is dimmed or blocked (what is allowed is decided by the planning screen).
 */
export function Overlay({ text, anchorRect: a, onNext, anchorId, targetId }: OverlayProps) {
  const bubbleOnTop = a !== undefined && a.top + a.height / 2 > window.innerHeight / 2;
  const box = a && { top: a.top, left: a.left, width: a.width, height: a.height };
  const blocking = onNext !== undefined;
  return (
    <div className={styles.root} data-testid="tutorial-overlay" data-anchor={anchorId} data-anchor-target={targetId}>
      {blocking && box && a ? (
        <>
          <div className={styles.hole} style={box} />
          <div className={styles.block} style={{ top: 0, left: 0, right: 0, height: a.top }} />
          <div className={styles.block} style={{ top: a.top + a.height, left: 0, right: 0, bottom: 0 }} />
          <div className={styles.block} style={{ top: a.top, left: 0, width: a.left, height: a.height }} />
          <div className={styles.block} style={{ top: a.top, left: a.left + a.width, right: 0, height: a.height }} />
        </>
      ) : blocking ? (
        <div className={cx(styles.block, styles.full)} />
      ) : (
        box && <div className={styles.ring} style={box} />
      )}
      <div
        className={cx(styles.bubble, bubbleOnTop ? styles.top : styles.bottom, !blocking && styles.hint)}
        role="status"
      >
        <p className={styles.text}>{text}</p>
        {onNext && (
          <Button variant="primary" onClick={onNext}>
            {ru.tutorial.next}
          </Button>
        )}
      </div>
    </div>
  );
}
