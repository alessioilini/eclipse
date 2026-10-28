import { useEffect, useMemo, useRef } from 'react';
import { CARDS } from '../../engine';
import { ECLIPSE_ROUND } from '../../engine/damage';
import type { OpponentView, Side, Slot } from '../../engine';
import { SPEED_FACTOR } from '../../game/playback/timings';
import { applyBeat, viewFromPublic } from '../../game/playback/viewReducer';
import { playerView } from '../../game/session';
import type { MatchSession } from '../../game/session';
import { ru } from '../../i18n/ru';
import { navigate } from '../../router';
import { useStore } from '../../store';
import { Button } from '../../ui/Button';
import { Hand } from '../../ui/Hand';
import { HeroCard } from '../../ui/HeroCard';
import { MoonWidget } from '../../ui/MoonWidget';
import { ReserveCard } from '../../ui/ReserveCard';
import { ResourceBar } from '../../ui/ResourceBar';
import styles from './Battle.module.css';
import {
  BloodMoonFlash, CardFlights, HeroFxLayer, LayoutSlot, cardFlights, fxKey, heroEffects,
} from './BeatEffects';
import { OpponentBar } from './Planning';

const noop = () => {};

/**
 * Проигрывание раунда (спека §4): отображение — свёртка битов `0..beatIndex` от `viewBeforePlayback`,
 * текущий бит анимируется и через `durationMs × SPEED_FACTOR[speed]` сменяется следующим. Тап по полю
 * сразу переходит к следующему биту, «Пропустить» доигрывает раунд. После последнего бита
 * `finishPlayback()` отдаёт экран планированию или, если матч окончен, экрану результата.
 */
export function Playback({ session }: { session: MatchSession }) {
  const beats = useStore((s) => s.beats);
  const beatIndex = useStore((s) => s.beatIndex);
  const speed = useStore((s) => s.speed);
  const before = useStore((s) => s.viewBeforePlayback);
  const advanceBeat = useStore((s) => s.advanceBeat);
  const skipPlayback = useStore((s) => s.skipPlayback);
  const finishPlayback = useStore((s) => s.finishPlayback);

  const engineView = useMemo(() => playerView(session), [session]);
  const base = useMemo(() => before ?? viewFromPublic(engineView), [before, engineView]);
  const view = useMemo(
    () => beats.slice(0, Math.min(beatIndex + 1, beats.length)).reduce(applyBeat, base),
    [beats, beatIndex, base],
  );
  const beat = beats[beatIndex];
  const ms = beat ? beat.durationMs * SPEED_FACTOR[speed] : 0;

  useEffect(() => {
    if (!beat) return;
    const timer = setTimeout(advanceBeat, ms);
    return () => clearTimeout(timer);
  }, [beat, beatIndex, ms, advanceBeat]);

  const done = beatIndex >= beats.length;
  const finished = useRef(false);
  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    finishPlayback();
    if (useStore.getState().phase === 'finished') navigate({ name: 'result' });
  }, [done, finishPlayback]);

  const events = useMemo(() => beat?.events ?? [], [beat]);
  const fx = useMemo(() => heroEffects(events), [events]);
  const flights = useMemo(() => cardFlights(events), [events]);
  const bloodMoon = events.some((e) => e.type === 'bloodMoon');

  const own = view.sides.A;
  const foe = view.sides.B;
  const hand = own.hand ?? [];

  const row = (side: Side) =>
    view.sides[side].active.map((h, i) => {
      const ref = { side, slot: i as Slot };
      const heroFx = fx.get(fxKey(ref));
      const shake = heroFx?.shake ?? false;
      return (
        <LayoutSlot key={h.heroId} id={`${side}-${h.heroId}`}>
          <div key={shake ? `shake-${beatIndex}` : 'still'} className={shake ? styles.shake : undefined}>
            <HeroCard hero={h} side={side} slot={i as Slot} chipStruck={heroFx?.fizzle !== undefined} />
          </div>
          <HeroFxLayer fx={heroFx} />
        </LayoutSlot>
      );
    });

  return (
    <>
      <div className={styles.board} data-testid="playback-board" onClick={advanceBeat}>
        <OpponentBar foe={foe} deckSize={(engineView.sides.B as OpponentView).deckSize} />
        <section className={styles.row}>{row('B')}</section>
        <section className={styles.center}>
          <MoonWidget phase={view.moon} eclipse={view.round >= ECLIPSE_ROUND} bloodMoon={own.bloodMoon} />
          <CardFlights key={beatIndex} flights={flights} durationMs={ms} />
        </section>
        <section className={styles.row}>{row('A')}</section>
        <section className={styles.reserveRow}>
          {own.reserve.map((h, i) => (
            <LayoutSlot key={h.heroId} id={`A-${h.heroId}`}>
              <ReserveCard hero={h} side="A" index={i as Slot} />
            </LayoutSlot>
          ))}
        </section>
        <ResourceBar energy={own.energy} energyMax={Math.max(own.energy, base.sides.A.energy)} spent={0} luna={own.luna} />
        <Hand cards={hand} selectedIndex={null} costs={hand.map((c) => CARDS[c].cost)} onTap={noop} />
      </div>
      <div className={styles.confirm}>
        <Button variant="secondary" size="lg" testId="skip" onClick={skipPlayback}>
          {ru.battle.skip}
        </Button>
      </div>
      {bloodMoon && <BloodMoonFlash key={beatIndex} durationMs={ms} />}
    </>
  );
}
