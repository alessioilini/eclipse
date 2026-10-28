import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { CARDS } from '../../engine';
import type { EngineEvent, Side, SlotRef } from '../../engine';
import { ru } from '../../i18n/ru';
import { FloatingNumber, type FloatingNumberProps } from '../../ui/FloatingNumber';
import { cx } from '../../ui/cx';
import styles from './Battle.module.css';

// Анимации текущего бита (спека §4.2). Состояние карточек (HP, смерть, чипы, Луна) уже применено
// редуктором; здесь только то, что живёт один бит: числа, тряска, срыв, полёт карты, вспышка.

export const fxKey = (r: SlotRef): string => `${r.side}-${r.slot}`;

type Floating = { value: number; kind: FloatingNumberProps['kind'] };
/** Эффекты бита на одной активной героине. */
export type HeroFx = { numbers: Floating[]; shake: boolean; fizzle?: string };
/** Карта текущего бита: сыгранная или сорванная (с причиной). */
export type CardFlight = { side: Side; label: string; fizzle?: string };

/** Урон по цели (`damage`, Burn, детонация, прямой урон, отражение, потеря HP): число и тряска. */
function hit(ev: EngineEvent): { target: SlotRef; value: number } | null {
  switch (ev.type) {
    case 'damage': return { target: ev.target, value: ev.dmg };
    case 'burn': case 'directDamage': case 'detonate': return { target: ev.target, value: ev.dmg };
    case 'reflect': return { target: ev.to, value: ev.dmg };
    case 'selfHp': return { target: ev.target, value: ev.hpLoss };
    default: return null;
  }
}

/** Эффекты бита по активным героиням, ключ — `fxKey`. */
export function heroEffects(events: EngineEvent[]): Map<string, HeroFx> {
  const map = new Map<string, HeroFx>();
  const at = (r: SlotRef): HeroFx => {
    const key = fxKey(r);
    let fx = map.get(key);
    if (!fx) {
      fx = { numbers: [], shake: false };
      map.set(key, fx);
    }
    return fx;
  };
  for (const ev of events) {
    const h = hit(ev);
    if (h) {
      const fx = at(h.target);
      fx.numbers.push({ value: h.value, kind: 'damage' });
      fx.shake = true;
    } else if (ev.type === 'heal' && ev.healed > 0) {
      at(ev.target).numbers.push({ value: ev.healed, kind: 'heal' });
    } else if (ev.type === 'shield' && ev.target) {
      at(ev.target).numbers.push({ value: ev.amount, kind: 'shield' });
    } else if (ev.type === 'fizzle' && ev.action !== 'card') {
      at({ side: ev.side, slot: ev.slot }).fizzle = ru.battle.fizzleReasons[ev.reason];
    }
  }
  return map;
}

/** Карты бита: сыгранные (без повторов «Повторения») и сорванные. */
export function cardFlights(events: EngineEvent[]): CardFlight[] {
  const out: CardFlight[] = [];
  for (const ev of events) {
    if (ev.type === 'cardPlayed' && !ev.replay) {
      out.push({ side: ev.side, label: CARDS[ev.cardId]?.name ?? ru.battle.cardBack });
    } else if (ev.type === 'fizzle' && ev.action === 'card' && !ev.replay) {
      out.push({ side: ev.side, label: CARDS[ev.cardId]?.name ?? ru.battle.cardBack, fizzle: ru.battle.fizzleReasons[ev.reason] });
    }
  }
  return out;
}

/**
 * Обёртка карточки с `layoutId` по героине: замена, автозаполнение и воскрешение двигают карточку
 * слайдом между активным рядом и резервом.
 */
export function LayoutSlot({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <motion.div layout layoutId={id} className={cx(styles.slot, className)}>
      {children}
    </motion.div>
  );
}

/** Числа и подпись срыва над карточкой героини. */
export function HeroFxLayer({ fx }: { fx: HeroFx | undefined }) {
  if (!fx || (fx.numbers.length === 0 && !fx.fizzle)) return null;
  return (
    <span className={styles.fx} aria-hidden="true">
      {fx.numbers.map((n, i) => (
        <span key={i} className={styles.fxItem}>
          <FloatingNumber value={n.value} kind={n.kind} />
        </span>
      ))}
      {fx.fizzle && <span className={styles.fizzleNote}>{`${ru.battle.fizzle}: ${fx.fizzle}`}</span>}
    </span>
  );
}

/** Карта летит из руки (своя, снизу) или от рубашек противника (сверху) к центру и растворяется. */
export function CardFlights({ flights, durationMs }: { flights: CardFlight[]; durationMs: number }) {
  if (flights.length === 0) return null;
  const s = durationMs / 1000;
  return (
    <div className={styles.flights}>
      {flights.map((f, i) => (
        <motion.div
          key={i}
          data-testid="card-flight"
          className={cx(styles.flight, f.fizzle && styles.struck)}
          initial={{ opacity: 0, y: f.side === 'A' ? 96 : -96, scale: 0.8 }}
          animate={{ opacity: [0, 1, 1, 0], y: 0, scale: 1 }}
          transition={{ duration: s, times: [0, 0.3, 0.8, 1] }}
        >
          <span className={styles.flightName}>{f.label}</span>
          {f.fizzle && <span className={styles.flightReason}>{`${ru.battle.fizzle}: ${f.fizzle}`}</span>}
        </motion.div>
      ))}
    </div>
  );
}

/** Красная вспышка Кровавой Луны на весь экран. */
export function BloodMoonFlash({ durationMs }: { durationMs: number }) {
  return (
    <motion.div
      className={styles.flash}
      data-testid="blood-moon-flash"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: durationMs / 1000 }}
    >
      {ru.battle.bloodMoon}
    </motion.div>
  );
}
