import { useMemo } from 'react';
import { CARDS, HEROES, legalActions, legalCardPlays } from '../../engine';
import { ECLIPSE_ROUND } from '../../engine/damage';
import type { LegalCardPlay, OpponentView, PublicState, Slot, SlotRef } from '../../engine';
import { viewFromPublic } from '../../game/playback/viewReducer';
import type { ViewState } from '../../game/playback/viewReducer';
import {
  draftEnergy, draftForEngine, draftIssues, draftToCommands, playerView, secondaryCandidates,
} from '../../game/session';
import type { Draft, MatchSession } from '../../game/session';
import type { AllowSet } from '../../game/tutorial/runner';
import { fmt, ru } from '../../i18n/ru';
import { useStore } from '../../store';
import type { Sheet } from '../../store';
import { useAllowed, useHidden } from '../../store/tutorial';
import { ActionSheet, type SheetItem } from '../../ui/ActionSheet';
import { Button } from '../../ui/Button';
import type { CardBlock } from '../../ui/CardView';
import { Hand } from '../../ui/Hand';
import { HeroCard } from '../../ui/HeroCard';
import { MoonWidget } from '../../ui/MoonWidget';
import { ReserveCard } from '../../ui/ReserveCard';
import { ResourceBar } from '../../ui/ResourceBar';
import styles from './Battle.module.css';
import { LayoutSlot } from './BeatEffects';

const SLOTS: Slot[] = [0, 1, 2];

const refKey = (r: SlotRef) => `${r.side}-${r.slot}`;

/** Почему карту нельзя сыграть: не хватает энергии или нет ни одной легальной цели. */
const cardBlock = (play: LegalCardPlay): CardBlock | undefined =>
  play.blocked ?? (play.targets !== 'auto' && play.targets.length === 0 ? 'noTarget' : undefined);

/** Что подсвечено сейчас: легальные цели среди активных героинь или индексы резерва игрока. */
type Highlight = { heroes: Set<string>; reserve: Set<number>; hint: string } | null;

function highlightFor(sheet: Sheet | null, view: PublicState, display: ViewState, draft: Draft): Highlight {
  if (!sheet) return null;
  const engineDraft = draftForEngine(draft);
  switch (sheet.kind) {
    case 'targets': {
      const la = legalActions(view, 'A', sheet.slot, engineDraft);
      const list = sheet.action === 'basic' ? la.basic : la[sheet.action].targets;
      return { heroes: new Set(list === 'auto' ? [] : list.map(refKey)), reserve: new Set(), hint: ru.battle.pickTarget };
    }
    case 'reserve': {
      const la = legalActions(view, 'A', sheet.slot, engineDraft);
      return { heroes: new Set(), reserve: new Set(la.swap), hint: ru.battle.pickReserve };
    }
    case 'card': {
      const play = legalCardPlays(view, 'A', sheet.handIndex, engineDraft);
      const cardId = display.sides.A.hand?.[sheet.handIndex];
      const name = cardId ? `${CARDS[cardId].name}: ` : '';
      if (sheet.step === 'target') {
        const list = play.targets === 'auto' ? [] : play.targets;
        return { heroes: new Set(list.map(refKey)), reserve: new Set(), hint: name + ru.battle.pickTarget };
      }
      const candidates = secondaryCandidates(view, play.secondary ?? 'guardian', sheet.target);
      if ('reserve' in candidates) {
        return { heroes: new Set(), reserve: new Set(candidates.reserve), hint: name + ru.battle.pickReserve };
      }
      return { heroes: new Set(candidates.heroes.map(refKey)), reserve: new Set(), hint: name + ru.battle.pickGuardian };
    }
    default:
      return null;
  }
}

/** Обучение: подсветка сужается до целей и резерва, разрешённых текущим шагом. */
function restrict(highlight: Highlight, allow: AllowSet | null): Highlight {
  if (!highlight || !allow) return highlight;
  const { targets, reserve } = allow;
  return {
    ...highlight,
    heroes: targets === 'any' ? highlight.heroes : new Set(targets.map(refKey).filter(k => highlight.heroes.has(k))),
    reserve: reserve === 'any' ? highlight.reserve : new Set(reserve.filter(i => highlight.reserve.has(i))),
  };
}

function actionItems(view: PublicState, slot: Slot, draft: Draft): SheetItem[] {
  const la = legalActions(view, 'A', slot, draftForEngine(draft));
  const noTargets = (t: SlotRef[] | 'auto') => t !== 'auto' && t.length === 0;
  const item = (key: string, label: string, disabled: boolean, reason?: string, detail?: string): SheetItem => ({
    key, label, disabled,
    ...(reason ? { reason } : {}),
    ...(detail ? { detail } : {}),
  });
  return [
    item('basic', ru.battle.actions.basic, la.basic.length === 0),
    item(
      'skill', ru.battle.actions.skill,
      la.skill.blocked !== undefined || noTargets(la.skill.targets),
      la.skill.blocked && ru.blocked[la.skill.blocked],
      fmt(ru.battle.costEnergy, { n: la.skill.cost }),
    ),
    item(
      'ultimate', ru.battle.actions.ultimate,
      la.ultimate.blocked !== undefined || noTargets(la.ultimate.targets),
      la.ultimate.blocked && ru.blocked[la.ultimate.blocked],
      fmt(ru.battle.costUltimate, { e: la.ultimate.energy, l: la.ultimate.luna }),
    ),
    item(
      'swap', ru.battle.actions.swap,
      la.swapBlocked !== undefined || la.swap.length === 0,
      la.swapBlocked && ru.blocked[la.swapBlocked],
    ),
  ];
}

/** Карточка героини только для чтения (долгое нажатие); Task 14 заменит её содержимым HeroDetail. */
function HeroSheet({ display, target, onClose }: { display: ViewState; target: SlotRef; onClose: () => void }) {
  const hero = display.sides[target.side].active[target.slot];
  if (!hero) return null;
  const def = HEROES[hero.heroId];
  return (
    <div className={styles.sheetRoot}>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-modal="true" data-testid="hero-sheet">
        <h2 className={styles.sheetTitle}>{def.name}</h2>
        <p className={styles.muted}>{fmt(ru.battle.stats, { hp: `${hero.hp}/${hero.maxHp}`, atk: def.atk, spd: def.spd })}</p>
        <p>
          <b>{`${ru.battle.passive}: ${def.passive.name}`}</b>
          <br />
          {def.passive.text}
        </p>
        <p>
          <b>{`${ru.battle.actions.skill}: ${def.skill.name}`}</b> {fmt(ru.battle.costEnergy, { n: def.skill.cost })}
        </p>
        <p>
          <b>{`${ru.battle.actions.ultimate}: ${def.ultimate.name}`}</b> {fmt(ru.battle.costEnergy, { n: def.ultimate.cost })}
        </p>
        <Button variant="secondary" onClick={onClose}>
          {ru.battle.close}
        </Button>
      </div>
    </div>
  );
}

/** Резерв противника, рубашки его руки, размер колоды и Luna (общая полоса планирования и проигрывания). */
export function OpponentBar({ foe, deckSize }: { foe: ViewState['sides']['B']; deckSize: number }) {
  return (
    <section className={styles.oppReserve}>
      <div className={styles.reserveRow}>
        {foe.reserve.map((h, i) => (
          <LayoutSlot key={h.heroId} id={`B-${h.heroId}`}>
            <ReserveCard hero={h} side="B" index={i as Slot} />
          </LayoutSlot>
        ))}
      </div>
      <div className={styles.oppInfo}>
        <span className={styles.oppHand} data-testid="opp-hand" aria-label={fmt(ru.battle.hand, { n: foe.handSize })}>
          {Array.from({ length: foe.handSize }, (_, i) => (
            <span key={i} className={styles.cardBack} aria-hidden="true" />
          ))}
          <span className={styles.count}>{foe.handSize}</span>
        </span>
        <span className={styles.muted}>{fmt(ru.battle.deck, { n: deckSize })}</span>
        <span className={styles.muted}>{fmt(ru.battle.lunaCount, { n: foe.luna })}</span>
      </div>
    </section>
  );
}

export function Planning({ session }: { session: MatchSession }) {
  const draft = useStore((s) => s.draft);
  const sheet = useStore((s) => s.sheet);
  const setAction = useStore((s) => s.setAction);
  const setCard = useStore((s) => s.setCard);
  const confirm = useStore((s) => s.confirm);
  const openSheet = useStore((s) => s.openSheet);
  const closeSheet = useStore((s) => s.closeSheet);
  // Обучение: что разрешает текущий шаг (null — свободный матч) и что скрыто сценарием.
  const allow = useAllowed();
  const hidden = useHidden();

  const view = useMemo(() => playerView(session), [session]);
  const display = useMemo(() => viewFromPublic(view), [view]);
  const own = display.sides.A;
  const foe = display.sides.B;
  const foeView = view.sides.B as OpponentView;
  const hand = own.hand ?? [];

  const highlight = restrict(highlightFor(sheet, view, display, draft), allow);
  const energy = draftEnergy(session.state, draft);
  const canConfirm = draftToCommands(draft) !== null && draftIssues(session.state, draft).length === 0
    && (allow === null || allow.confirm);
  const cardPlays = hand.map((_, i) => legalCardPlays(view, 'A', i, draftForEngine(draft)));
  const cardBlocks = cardPlays.map(cardBlock);

  const pickHero = (ref: SlotRef) => {
    if (!sheet) return;
    if (sheet.kind === 'targets') {
      setAction(sheet.slot, { type: sheet.action, target: ref });
      closeSheet();
    } else if (sheet.kind === 'card' && sheet.step === 'target') {
      const play = cardPlays[sheet.handIndex];
      if (play?.secondary) {
        openSheet({ kind: 'card', handIndex: sheet.handIndex, step: 'secondary', target: ref });
      } else {
        setCard({ handIndex: sheet.handIndex, target: ref });
        closeSheet();
      }
    } else if (sheet.kind === 'card' && sheet.target) {
      setCard({ handIndex: sheet.handIndex, target: sheet.target, secondary: ref });
      closeSheet();
    }
  };

  const onHeroTap = (ref: SlotRef) => {
    if (highlight) {
      if (highlight.heroes.has(refKey(ref))) pickHero(ref);
      return;
    }
    if (allow && !allow.slots.includes(ref.slot)) return;
    if (ref.side === 'A' && own.active[ref.slot]?.alive) openSheet({ kind: 'actions', slot: ref.slot });
  };

  const onReserveTap = (index: Slot) => {
    if (!highlight?.reserve.has(index) || !sheet) return;
    if (sheet.kind === 'reserve') {
      setAction(sheet.slot, { type: 'swap', reserveIndex: index });
      closeSheet();
    } else if (sheet.kind === 'card' && sheet.target) {
      setCard({ handIndex: sheet.handIndex, target: sheet.target, secondary: { reserveIndex: index } });
      closeSheet();
    }
  };

  const onPickAction = (slot: Slot, key: string) => {
    const la = legalActions(view, 'A', slot, draftForEngine(draft));
    if (key === 'skill' || key === 'ultimate') {
      if (la[key].targets === 'auto') {
        setAction(slot, { type: key });
        closeSheet();
        return;
      }
    }
    // Новое действие заменяет старое: чип снимается сразу, пока игрок выбирает цель.
    setAction(slot, null);
    if (key === 'swap') openSheet({ kind: 'reserve', slot });
    else if (key === 'basic' || key === 'skill' || key === 'ultimate') openSheet({ kind: 'targets', slot, action: key });
  };

  const onCardTap = (index: number) => {
    if (allow && !allow.cards.includes(index)) return;
    if (draft.card?.handIndex === index) {
      setCard(null);
      closeSheet();
      return;
    }
    if (sheet?.kind === 'card' && sheet.handIndex === index) {
      closeSheet();
      return;
    }
    const play = cardPlays[index];
    if (!play || cardBlock(play)) return;
    if (play.targets === 'auto') {
      setCard({ handIndex: index });
      closeSheet();
    } else {
      setCard(null);
      openSheet({ kind: 'card', handIndex: index, step: 'target' });
    }
  };

  const heroProps = (ref: SlotRef) => {
    if (highlight) {
      const on = highlight.heroes.has(refKey(ref));
      return { selected: on, dimmed: highlight.heroes.size > 0 && !on };
    }
    return { selected: sheet?.kind === 'actions' && ref.side === 'A' && sheet.slot === ref.slot };
  };

  const selectedCard = draft.card?.handIndex ?? (sheet?.kind === 'card' ? sheet.handIndex : null);

  return (
    <>
      <OpponentBar foe={foe} deckSize={foeView.deckSize} />

      <section className={styles.row}>
        {foe.active.map((h, i) => {
          const ref: SlotRef = { side: 'B', slot: i as Slot };
          return (
            <HeroCard
              key={i}
              hero={h}
              side="B"
              slot={i as Slot}
              {...heroProps(ref)}
              onTap={() => onHeroTap(ref)}
              onLongPress={() => openSheet({ kind: 'hero', ref })}
            />
          );
        })}
      </section>

      <section className={styles.center}>
        <MoonWidget phase={display.moon} eclipse={display.round >= ECLIPSE_ROUND} bloodMoon={own.bloodMoon} />
      </section>

      <section className={styles.row}>
        {own.active.map((h, i) => {
          const ref: SlotRef = { side: 'A', slot: i as Slot };
          const action = draft.actions[i];
          return (
            <HeroCard
              key={i}
              hero={h}
              side="A"
              slot={i as Slot}
              {...heroProps(ref)}
              {...(action ? { chip: action } : {})}
              onTap={() => onHeroTap(ref)}
            />
          );
        })}
      </section>

      {!hidden.includes('reserve') && (
        <section className={styles.reserveRow}>
          {own.reserve.map((h, i) => {
            const on = highlight?.reserve.has(i) ?? false;
            return (
              <ReserveCard
                key={i}
                hero={h}
                side="A"
                index={i as Slot}
                highlighted={on}
                dimmed={highlight !== null && highlight.reserve.size > 0 && !on}
                onTap={() => onReserveTap(i as Slot)}
              />
            );
          })}
        </section>
      )}

      <ResourceBar energy={energy.budget} energyMax={energy.budget} spent={energy.spent} luna={own.luna} />

      {highlight && (
        <div className={styles.hint} data-testid="target-hint">
          <span>{highlight.hint}</span>
          <Button variant="ghost" onClick={closeSheet}>
            {ru.battle.cancel}
          </Button>
        </div>
      )}

      {!hidden.includes('cards') && (
        <Hand
          cards={hand}
          selectedIndex={selectedCard}
          costs={cardPlays.map((p) => p.cost)}
          blocked={cardBlocks}
          onTap={onCardTap}
        />
      )}

      <div className={styles.confirm}>
        <Button variant="primary" size="lg" testId="confirm" disabled={!canConfirm} onClick={confirm}>
          {ru.battle.confirm}
        </Button>
      </div>

      {sheet?.kind === 'actions' && (
        <ActionSheet
          items={actionItems(view, sheet.slot, draft).filter((item) =>
            (allow === null || allow.actions.includes(item.key as AllowSet['actions'][number]))
            && !(item.key === 'ultimate' && hidden.includes('ultimate'))
            && !(item.key === 'swap' && hidden.includes('swap')))}
          onPick={(key) => onPickAction(sheet.slot, key)}
          onClose={closeSheet}
        />
      )}
      {sheet?.kind === 'hero' && <HeroSheet display={display} target={sheet.ref} onClose={closeSheet} />}
    </>
  );
}
