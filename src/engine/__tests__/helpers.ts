import { createMatch } from '../match';
import { CARD_IDS } from '../data/cards';
import type { CardId, CardPlay, HeroAction, HeroId, MatchState, Side, Slot, SideCommands, SlotRef } from '../types';

export function makeMatch(opts: { a?: HeroId[]; b?: HeroId[]; cardsA?: CardId[]; cardsB?: CardId[]; seed?: number } = {}): MatchState {
  const heroesA = opts.a ?? ['aira', 'fenna', 'nerisa', 'tali', 'zefira', 'liraya'];
  const heroesB = opts.b ?? ['aurora', 'justina', 'nokta', 'kira', 'mira', 'selena'];
  return createMatch(
    { heroes: heroesA, starting: [0, 1, 2], cards: opts.cardsA ?? CARD_IDS.slice(0, 12) },
    { heroes: heroesB, starting: [0, 1, 2], cards: opts.cardsB ?? CARD_IDS.slice(0, 12) },
    opts.seed ?? 1,
  );
}

export const enemy = (slot: Slot): SlotRef => ({ side: 'B', slot });
export const ally = (slot: Slot): SlotRef => ({ side: 'A', slot });

// `slot` (the acting hero's slot) is positional only: cmd() assigns actions by argument order.
export const basic = (_slot: Slot, target: SlotRef): HeroAction => ({ type: 'basic', target });
export const skill = (_slot: Slot, target?: SlotRef): HeroAction =>
  target ? { type: 'skill', target } : { type: 'skill' };
export const ult = (_slot: Slot, target?: SlotRef): HeroAction =>
  target ? { type: 'ultimate', target } : { type: 'ultimate' };
export const swap = (_slot: Slot, reserveIndex: Slot): HeroAction => ({ type: 'swap', reserveIndex });
export const none = (): HeroAction => ({ type: 'none' });

export const cmd = (a0: HeroAction, a1: HeroAction, a2: HeroAction, card?: CardPlay): SideCommands =>
  card ? { actions: [a0, a1, a2], card } : { actions: [a0, a1, a2] };

export function setHand(state: MatchState, side: Side, cards: CardId[]): MatchState {
  const s = structuredClone(state);
  s.sides[side].hand = [...cards];
  return s;
}

export function setHp(state: MatchState, ref: SlotRef, hp: number): MatchState {
  const s = structuredClone(state);
  s.sides[ref.side].active[ref.slot].hp = hp;
  return s;
}

export function setLuna(state: MatchState, side: Side, n: number): MatchState {
  const s = structuredClone(state);
  s.sides[side].luna = n;
  return s;
}

export function setRound(state: MatchState, round: number): MatchState {
  const s = structuredClone(state);
  s.round = round;
  return s;
}
