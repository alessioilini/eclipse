import {
  HEROES, chooseCommands, createMatch, createRng, eventsFor, resolveRound, startRound, validateCommands, viewFor,
} from '../engine';
import type {
  CardPlay, Deck, EngineEvent, HeroAction, MatchState, PublicState, SideCommands, ValidationIssue,
} from '../engine';
import { randomDeck } from '../engine/sim';
import { BLOOD_PACT_BUDGET_BONUS, ULTIMATE_ENERGY_COST, cardCost, energyBudget } from '../engine/validate';

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
};

/** createMatch + startRound: сессия ждёт команд первого раунда. */
export function newMatch(playerDeck: Deck, opts: NewMatchOpts): MatchSession {
  const created = createMatch(playerDeck, opts.opponentDeck, opts.seed);
  const { state } = startRound(created);
  return {
    state,
    botSeed: opts.seed,
    mode: opts.mode,
    ...(opts.tutorialId !== undefined ? { tutorialId: opts.tutorialId } : {}),
    playerDeck,
    opponentDeck: opts.opponentDeck,
    ...(opts.enemy ? { enemy: opts.enemy } : {}),
  };
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
 * выбранных скиллов, ульт (2) и карты. Действия павших героинь не стоят ничего.
 */
export function draftEnergy(state: MatchState, draft: Draft): { budget: number; spent: number } {
  const own = state.sides.A;
  let budget = energyBudget(state, 'A');
  let spent = 0;
  draft.actions.forEach((action, slot) => {
    const hero = own.active[slot];
    if (!action || !hero || hero.hp <= 0) return;
    if (action.type === 'skill') spent += HEROES[hero.id].skill.cost;
    else if (action.type === 'ultimate') spent += ULTIMATE_ENERGY_COST;
  });
  const cardId = draft.card ? own.hand[draft.card.handIndex] : undefined;
  if (cardId !== undefined) {
    spent += cardCost(state, 'A', cardId);
    if (cardId === 'bloodPact') budget += BLOOD_PACT_BUDGET_BONUS;
  }
  return { budget, spent };
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

// TODO(Task 12): заменить на архетип по `seed % 4` через buildPreset.
export function opponentDeckFor(seed: number): Deck {
  return randomDeck(createRng(seed));
}
