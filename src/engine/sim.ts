import { chooseCommands } from './bot';
import { createMatch, validateDeck } from './match';
import { createRng } from './rng';
import type { Rng } from './rng';
import { resolveRound, startRound } from './resolve/round';
import { viewFor } from './view';
import { CARDS, CARD_IDS } from './data/cards';
import { HERO_IDS } from './data/heroes';
import type { CardId, Deck, GameEvent, HeroId, MatchState, Side, SideCommands } from './types';

const SIDES: Side[] = ['A', 'B'];
/** Spec §2.2: a match never lasts longer than this; hitting it is an engine bug. */
const MAX_ROUNDS = 10;

export type SimReport = {
  matches: number;
  avgRounds: number;
  /** Index r (1..10) = matches that ended in round r; index 0 is unused (always 0). */
  roundHistogram: number[];
  drawRate: number;
  /** Matches with at least one Blood Moon event / all matches. */
  bloodMoonRate: number;
  /** Among matches with Blood Moon: share won by the side whose Blood Moon fired first. */
  bloodMoonComebackRate: number;
  heroes: Record<HeroId, { picks: number; wins: number; winRate: number; avgDamage: number }>;
  cards: Record<CardId, { picks: number; plays: number; winRate: number }>;
};

/** A random legal deck (spec §2.1): 6 distinct heroines, first three start, 12 cards respecting validateDeck. */
export function randomDeck(rng: Rng): Deck {
  const heroes = rng.shuffle(HERO_IDS).slice(0, 6);
  const counts = new Map<CardId, number>();
  const cards: CardId[] = [];
  let legendary = 0;
  while (cards.length < 12) {
    const eligible = CARD_IDS.filter(id => {
      const def = CARDS[id];
      const n = counts.get(id) ?? 0;
      if (def.rarity === 'legendary') return n < 1 && legendary < 2;
      return n < 2;
    });
    const id = rng.pick(eligible);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (CARDS[id].rarity === 'legendary') legendary += 1;
    cards.push(id);
  }
  const deck: Deck = { heroes, starting: [0, 1, 2], cards };
  if (validateDeck(deck).length !== 0) throw new Error('randomDeck produced an illegal deck: ' + validateDeck(deck).join('; '));
  return deck;
}

/**
 * Bot vs bot. Each side's bot gets its own Rng per round, seeded deterministically from the match seed:
 * `createRng(seed * 7919 + round * 2 + (side === 'B' ? 1 : 0))`.
 */
export function playMatch(deckA: Deck, deckB: Deck, seed: number): { state: MatchState; events: GameEvent[]; rounds: number } {
  let state = createMatch(deckA, deckB, seed);
  const events: GameEvent[] = [];
  while (state.result === null) {
    if (state.round >= MAX_ROUNDS) throw new Error(`match exceeded ${MAX_ROUNDS} rounds (seed ${seed})`);
    const started = startRound(state);
    events.push(...started.events);
    const round = started.state.round;
    const cmds = {} as Record<Side, SideCommands>;
    SIDES.forEach((side, i) => {
      const botRng = createRng(seed * 7919 + round * 2 + i);
      cmds[side] = chooseCommands(viewFor(started.state, side), side, botRng);
    });
    const resolved = resolveRound(started.state, cmds);
    events.push(...resolved.events);
    state = resolved.state;
  }
  return { state, events, rounds: state.round };
}

const emptyRecord = <K extends string, V>(keys: K[], make: () => V): Record<K, V> =>
  Object.fromEntries(keys.map(k => [k, make()])) as Record<K, V>;

/** `n` matches between random legal decks; the decks come from one Rng(seed), match seeds are derived from it. */
export function runSimulation(n: number, seed: number): SimReport {
  const rng = createRng(seed);
  const histogram: number[] = new Array(MAX_ROUNDS + 1).fill(0);
  const heroAcc = emptyRecord(HERO_IDS, () => ({ picks: 0, wins: 0, damage: 0 }));
  const cardAcc = emptyRecord(CARD_IDS, () => ({ picks: 0, plays: 0, wins: 0 }));
  let totalRounds = 0;
  let draws = 0;
  let bloodMoonMatches = 0;
  let bloodMoonWins = 0;

  for (let i = 0; i < n; i++) {
    const decks: Record<Side, Deck> = { A: randomDeck(rng), B: randomDeck(rng) };
    const { state, events, rounds } = playMatch(decks.A, decks.B, rng.int(2 ** 31));
    const winner = state.result!.winner;
    totalRounds += rounds;
    histogram[rounds] = (histogram[rounds] ?? 0) + 1;
    if (winner === 'draw') draws += 1;

    for (const side of SIDES) {
      const won = winner === side;
      for (const id of decks[side].heroes) {
        heroAcc[id].picks += 1;
        if (won) heroAcc[id].wins += 1;
      }
      for (const id of decks[side].cards) {
        cardAcc[id].picks += 1;
        if (won) cardAcc[id].wins += 1;
      }
    }

    let firstBloodMoon: Side | null = null;
    for (const ev of events) {
      if (ev.type === 'damage') {
        const id = ev['attackerId'] as HeroId;
        heroAcc[id].damage += ev['hpLoss'] as number;
      } else if (ev.type === 'cardPlayed' && !ev['replay']) {
        cardAcc[ev['cardId'] as CardId].plays += 1;
      } else if (ev.type === 'bloodMoon' && firstBloodMoon === null) {
        firstBloodMoon = ev['side'] as Side;
      }
    }
    if (firstBloodMoon !== null) {
      bloodMoonMatches += 1;
      if (winner === firstBloodMoon) bloodMoonWins += 1;
    }
  }

  const ratio = (a: number, b: number): number => (b === 0 ? 0 : a / b);
  const heroes = emptyRecord(HERO_IDS, () => ({ picks: 0, wins: 0, winRate: 0, avgDamage: 0 }));
  for (const id of HERO_IDS) {
    const a = heroAcc[id];
    heroes[id] = { picks: a.picks, wins: a.wins, winRate: ratio(a.wins, a.picks), avgDamage: ratio(a.damage, a.picks) };
  }
  const cards = emptyRecord(CARD_IDS, () => ({ picks: 0, plays: 0, winRate: 0 }));
  for (const id of CARD_IDS) {
    const a = cardAcc[id];
    cards[id] = { picks: a.picks, plays: a.plays, winRate: ratio(a.wins, a.picks) };
  }
  return {
    matches: n,
    avgRounds: ratio(totalRounds, n),
    roundHistogram: histogram,
    drawRate: ratio(draws, n),
    bloodMoonRate: ratio(bloodMoonMatches, n),
    bloodMoonComebackRate: ratio(bloodMoonWins, bloodMoonMatches),
    heroes,
    cards,
  };
}
