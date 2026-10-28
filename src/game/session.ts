import {
  chooseCommands, createMatch, createRng, eventsFor, HERO_IDS, resolveRound, startRound, validateCommands, viewFor,
} from '../engine';
import type {
  CardPlay, Deck, EngineEvent, HeroAction, MatchState, PublicState, SideCommands, Slot, SlotRef, ValidationIssue,
} from '../engine';
import { ARCHETYPE_KEYS, buildPreset } from './decks/presets';
import {
  actionEnergy, cardEnergy, energyBudget, isCoverGuardian, livingReserve, ownSide,
} from '../engine/validate';
import type { PlanningState } from '../engine/validate';

/** Матч длится не больше 10 раундов (как `MAX_ROUNDS` в `engine/sim.ts`, который движок не экспортирует). */
export const MAX_ROUNDS = 10;

const SLOTS: Slot[] = [0, 1, 2];

/** Планируемый ход игрока: действие на каждый слот (null = ещё не выбрано) и необязательная карта. */
export type Draft = {
  actions: [HeroAction | null, HeroAction | null, HeroAction | null];
  card: CardPlay | null;
};

export type MatchSession = {
  state: MatchState;
  botSeed: number;
  mode: 'free' | 'tutorial';
  tutorialId?: 1 | 2 | 3;
  playerDeck: Deck;
  opponentDeck: Deck;
  enemy?: (round: number, view: PublicState) => SideCommands;
  surrendered?: true;
};

export type NewMatchOpts = {
  opponentDeck: Deck;
  seed: number;
  mode: 'free' | 'tutorial';
  tutorialId?: 1 | 2 | 3;
  enemy?: (round: number, view: PublicState) => SideCommands;
  /** Стартовое HP героинь противника в порядке `opponentDeck.heroes` (раненые противницы обучения). */
  opponentHp?: number[];
};

/** Ставит героиням B стартовое HP из `hp` (по порядку колоды), в пределах 1..maxHp. */
function woundOpponent(state: MatchState, deck: Deck, hp: number[] | undefined): MatchState {
  if (!hp) return state;
  const next = structuredClone(state);
  const side = next.sides.B;
  for (const hero of [...side.active, ...side.reserve]) {
    const value = hp[deck.heroes.indexOf(hero.id)];
    if (value !== undefined) hero.hp = Math.min(hero.maxHp, Math.max(1, Math.round(value)));
  }
  return next;
}

/** createMatch + startRound: сессия ждёт команд первого раунда. */
export function newMatch(playerDeck: Deck, opts: NewMatchOpts): MatchSession {
  return openMatch(playerDeck, opts).session;
}

/** Как `newMatch`, плюс события начала первого раунда для игрока (roundStart, добор) — для журнала. */
export function openMatch(playerDeck: Deck, opts: NewMatchOpts): { session: MatchSession; events: EngineEvent[] } {
  const created = woundOpponent(createMatch(playerDeck, opts.opponentDeck, opts.seed), opts.opponentDeck, opts.opponentHp);
  const { state, events } = startRound(created);
  const session: MatchSession = {
    state,
    botSeed: opts.seed,
    mode: opts.mode,
    ...(opts.tutorialId !== undefined ? { tutorialId: opts.tutorialId } : {}),
    playerDeck,
    opponentDeck: opts.opponentDeck,
    ...(opts.enemy ? { enemy: opts.enemy } : {}),
  };
  return { session, events: eventsFor(events, 'A') };
}

/** Погибшие слоты получают `none` сразу (движок принимает только его), живые ждут выбора. */
export function emptyDraft(state: MatchState): Draft {
  const actions = state.sides.A.active.map(h => (h.hp > 0 ? null : { type: 'none' as const })) as Draft['actions'];
  return { actions, card: null };
}

/** null, пока хотя бы у одного слота нет действия. */
export function draftToCommands(draft: Draft): SideCommands | null {
  const [a, b, c] = draft.actions;
  if (a === null || b === null || c === null) return null;
  return { actions: [a, b, c], ...(draft.card ? { card: draft.card } : {}) };
}

/** Ошибки движка для полного черновика; для неполного пусто (UI знает это по `draftToCommands`). */
export function draftIssues(state: MatchState, draft: Draft): ValidationIssue[] {
  const cmds = draftToCommands(draft);
  return cmds ? validateCommands(state, 'A', cmds) : [];
}

/** Черновик в форме, которую принимают `legalActions` / `legalCardPlays` (пустые слоты — `null`, движок их пропускает). */
export function draftForEngine(draft: Draft): Partial<SideCommands> {
  return { actions: draft.actions as SideCommands['actions'], ...(draft.card ? { card: draft.card } : {}) };
}

/**
 * Энергия черновика игрока: бюджет раунда (с +2 от Кровавой сделки, если она выбрана) и сумма цен
 * выбранных действий и карты — по тем же функциям, что и `validateCommands`.
 */
export function draftEnergy(state: PlanningState, draft: Draft): { budget: number; spent: number } {
  const card = cardEnergy(state, 'A', draft.card ?? undefined);
  let spent = card.cost;
  draft.actions.forEach((action, slot) => {
    spent += actionEnergy(state, 'A', slot as Slot, action ?? undefined);
  });
  return { budget: energyBudget(state, 'A') + card.bonus, spent };
}

/**
 * Кандидаты второй цели карты игрока: живые стражи среди активных («Прикрытие») или живые
 * героини резерва («Экстренная замена»). Правила — предикаты движка. `target` (первая цель) пока
 * не сужает список: движок не запрещает совпадение.
 */
export function secondaryCandidates(
  view: PlanningState, kind: 'guardian' | 'reserve', target?: SlotRef,
): { heroes: SlotRef[] } | { reserve: Slot[] } {
  void target;
  if (kind === 'reserve') return { reserve: livingReserve(ownSide(view, 'A')) };
  const refs = SLOTS.map((slot): SlotRef => ({ side: 'A', slot }));
  return { heroes: refs.filter(ref => isCoverGuardian(view, 'A', ref)) };
}

/** Бот (или сценарный противник) → resolveRound → события игрока → startRound следующего раунда. */
export function confirmRound(session: MatchSession, draft: Draft): { session: MatchSession; events: EngineEvent[] } {
  const cmds = draftToCommands(draft);
  if (!cmds) throw new Error('draft incomplete');
  const issues = validateCommands(session.state, 'A', cmds);
  if (issues.length > 0) throw new Error('invalid draft: ' + issues.map(i => i.code).join(', '));

  const botView = viewFor(session.state, 'B');
  const round = session.state.round;
  const bot = session.enemy
    ? session.enemy(round, botView)
    : chooseCommands(botView, 'B', createRng(session.botSeed * 7919 + round));

  const resolved = resolveRound(session.state, { A: cmds, B: bot });
  let state = resolved.state;
  const events = eventsFor(resolved.events, 'A');
  if (state.result === null) {
    const next = startRound(state);
    state = next.state;
    events.push(...eventsFor(next.events, 'A'));
  }
  return { session: { ...session, state }, events };
}

/** Сдача: движок не трогаем, результат ставим вручную. */
export function surrender(session: MatchSession): MatchSession {
  const state = structuredClone(session.state);
  state.result = { winner: 'B', reason: 'wipe' };
  state.awaitingCommands = false;
  return { ...session, state, surrendered: true };
}

export function playerView(session: MatchSession): PublicState {
  return viewFor(session.state, 'A');
}

export function isFinished(session: MatchSession): boolean {
  return session.state.result !== null;
}

/** Бот играет колодой архетипа по seed матча из всех 12 героинь. */
export function opponentDeckFor(seed: number): Deck {
  return buildPreset(ARCHETYPE_KEYS[Math.abs(seed) % 4]!, HERO_IDS);
}
