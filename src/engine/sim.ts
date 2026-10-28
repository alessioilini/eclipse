import { chooseCommands } from './bot';
import { MAX_ROUNDS, createMatch, validateDeck } from './match';
import { createRng } from './rng';
import type { Rng } from './rng';
import { resolveRound, startRound } from './resolve/round';
import { viewFor } from './view';
import { CARDS, CARD_IDS } from './data/cards';
import { HERO_IDS } from './data/heroes';
import type { EngineEvent, EventSource } from './events';
import type { CardId, Deck, HeroId, MatchState, Side, SideCommands, SlotRef } from './types';

const SIDES: Side[] = ['A', 'B'];

export type ResultReason = NonNullable<MatchState['result']>['reason'];
const RESULT_REASONS: ResultReason[] = ['wipe', 'heroes', 'hpPct', 'damage', 'draw'];
/** Spec §2.2: everything but a wipe is decided by the round-10 tie-break. */
const ROUND_LIMIT_REASONS: ResultReason[] = ['heroes', 'hpPct', 'damage', 'draw'];

/** Per-heroine tallies of one match (matchStats) or per-match averages (SimReport). */
export type HeroTally = {
  /** HP removed by her `damage` events (hits). */
  hits: number;
  /** HP removed by her direct damage: detonate, Nokta's «Падшая», Reflect, «Последнее слово». */
  direct: number;
  /** HP removed by Burn ticks on targets whose Burn she applied (card Burn is nobody's). */
  burn: number;
  swaps: number;
  fizzles: number;
  ults: number;
  deaths: number;
};

export type MatchStats = {
  heroes: Record<HeroId, HeroTally>;
  /** Index r = HP lost by both sides in round r (hits, direct damage, Burn, self HP loss); index 0 unused. */
  hpLost: number[];
  healed: number[];
  shielded: number[];
  /** HP absorbed by shields, all rounds. */
  absorbed: number;
  burn: number;
  fizzlesByReason: Record<string, number>;
  cardPlays: Record<CardId, number>;
  firstBloodMoon: Side | null;
};

export type SimReport = {
  matches: number;
  avgRounds: number;
  /** Index r (1..10) = matches that ended in round r; index 0 is unused (always 0). */
  roundHistogram: number[];
  drawRate: number;
  /** Matches decided by the round-10 tie-break (reason heroes, hpPct, damage or draw) / all matches. */
  roundLimitRate: number;
  /** Matches by `result.reason`. */
  resultReasons: Record<ResultReason, number>;
  /** Matches with at least one Blood Moon event / all matches. */
  bloodMoonRate: number;
  /** Among matches with Blood Moon: share won by the side whose Blood Moon fired first. */
  bloodMoonComebackRate: number;
  /** Index r = average over the matches that played round r; index 0 unused. */
  perRound: { hpLost: number[]; healed: number[]; shielded: number[] };
  /** Per-match averages over all matches. */
  totals: { hpLost: number; healed: number; shielded: number; absorbed: number; burn: number; swaps: number; fizzles: number };
  /** Fizzles per match by reason. */
  fizzlesByReason: Record<string, number>;
  heroes: Record<HeroId, {
    picks: number; wins: number; winRate: number;
    /** HP removed per match from every source: hits + direct + burn. */
    avgDamage: number;
    damageBy: { hits: number; direct: number; burn: number };
    swaps: number; fizzles: number; ults: number; deaths: number;
  }>;
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
export function playMatch(deckA: Deck, deckB: Deck, seed: number): { state: MatchState; events: EngineEvent[]; rounds: number } {
  let state = createMatch(deckA, deckB, seed);
  const events: EngineEvent[] = [];
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

const emptyTally = (): HeroTally => ({ hits: 0, direct: 0, burn: 0, swaps: 0, fizzles: 0, ults: 0, deaths: 0 });

const isSlotRef = (src: EventSource): src is SlotRef => 'slot' in src;

/** Who stands where, replayed from the `swap` / `autoFill` events (the events carry slots, not heroines). */
class Board {
  private readonly sides: Record<Side, { active: HeroId[]; reserve: HeroId[] }>;

  constructor(decks: Record<Side, Deck>) {
    const of = (deck: Deck) => ({
      active: deck.starting.map(i => deck.heroes[i]!),
      reserve: deck.heroes.filter((_, i) => !deck.starting.includes(i as Deck['starting'][number])),
    });
    this.sides = { A: of(decks.A), B: of(decks.B) };
  }

  at(ref: SlotRef): HeroId {
    return this.sides[ref.side].active[ref.slot]!;
  }

  apply(ev: EngineEvent): void {
    if (ev.type !== 'swap' && ev.type !== 'autoFill') return;
    const b = this.sides[ev.side];
    b.reserve[ev.reserveIndex] = b.active[ev.slot]!;
    b.active[ev.slot] = ev.in;
  }
}

/** Tallies of one match from its events: damage by source and heroine, swaps, fizzles, per-round HP flow. */
export function matchStats(decks: Record<Side, Deck>, events: EngineEvent[]): MatchStats {
  const board = new Board(decks);
  const heroes = emptyRecord(HERO_IDS, emptyTally);
  const burnBy = new Map<HeroId, HeroId | null>(); // burning heroine → who applied her Burn
  const hpLost: number[] = [0];
  const healed: number[] = [0];
  const shielded: number[] = [0];
  const fizzlesByReason: Record<string, number> = {};
  const cardPlays = emptyRecord(CARD_IDS, () => 0);
  let absorbed = 0;
  let burn = 0;
  let firstBloodMoon: Side | null = null;

  const addRound = (arr: number[], round: number, v: number) => {
    while (arr.length <= round) arr.push(0);
    arr[round] = arr[round]! + v;
  };

  for (const ev of events) {
    board.apply(ev);
    switch (ev.type) {
      case 'damage':
        heroes[ev.attackerId].hits += ev.hpLoss;
        absorbed += ev.absorbed;
        addRound(hpLost, ev.round, ev.hpLoss);
        break;
      case 'directDamage':
      case 'detonate':
      case 'reflect': {
        const src = ev.type === 'reflect' ? ev.from : ev.source;
        if (isSlotRef(src)) heroes[board.at(src)].direct += ev.dmg;
        addRound(hpLost, ev.round, ev.dmg);
        break;
      }
      case 'selfHp':
        addRound(hpLost, ev.round, ev.hpLoss);
        break;
      case 'burn': {
        const by = burnBy.get(board.at(ev.target));
        if (by) heroes[by].burn += ev.dmg;
        burn += ev.dmg;
        addRound(hpLost, ev.round, ev.dmg);
        break;
      }
      case 'statusApplied':
        if (ev.status === 'burn') burnBy.set(board.at(ev.target), isSlotRef(ev.source) ? board.at(ev.source) : null);
        break;
      case 'heal':
        addRound(healed, ev.round, ev.healed);
        break;
      case 'shield':
        addRound(shielded, ev.round, ev.amount);
        break;
      case 'heroAction':
        if (ev.action === 'swap') heroes[ev.heroId].swaps += 1;
        if (ev.action === 'ultimate') heroes[ev.heroId].ults += 1;
        break;
      case 'fizzle':
        fizzlesByReason[ev.reason] = (fizzlesByReason[ev.reason] ?? 0) + 1;
        if (ev.action !== 'card') heroes[ev.heroId].fizzles += 1;
        break;
      case 'death':
        heroes[ev.heroId].deaths += 1;
        break;
      case 'cardPlayed':
        if (!ev.replay) cardPlays[ev.cardId] += 1;
        break;
      case 'bloodMoon':
        if (firstBloodMoon === null) firstBloodMoon = ev.side;
        break;
    }
  }
  return { heroes, hpLost, healed, shielded, absorbed, burn, fizzlesByReason, cardPlays, firstBloodMoon };
}

const ratio = (a: number, b: number): number => (b === 0 ? 0 : a / b);

/** `n` matches between random legal decks; the decks come from one Rng(seed), match seeds are derived from it. */
export function runSimulation(n: number, seed: number): SimReport {
  const rng = createRng(seed);
  const histogram: number[] = new Array(MAX_ROUNDS + 1).fill(0);
  const heroAcc = emptyRecord(HERO_IDS, () => ({ picks: 0, wins: 0, tally: emptyTally() }));
  const cardAcc = emptyRecord(CARD_IDS, () => ({ picks: 0, plays: 0, wins: 0 }));
  const resultReasons = emptyRecord(RESULT_REASONS, () => 0);
  const perRound = { hpLost: new Array<number>(MAX_ROUNDS + 1).fill(0), healed: new Array<number>(MAX_ROUNDS + 1).fill(0), shielded: new Array<number>(MAX_ROUNDS + 1).fill(0) };
  const roundsPlayed = new Array<number>(MAX_ROUNDS + 1).fill(0);
  const totals = { hpLost: 0, healed: 0, shielded: 0, absorbed: 0, burn: 0, swaps: 0, fizzles: 0 };
  const fizzlesByReason: Record<string, number> = {};
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
    resultReasons[state.result!.reason] += 1;
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

    const m = matchStats(decks, events);
    for (const id of HERO_IDS) {
      const t = heroAcc[id].tally;
      for (const k of Object.keys(t) as (keyof HeroTally)[]) t[k] += m.heroes[id][k];
    }
    for (const id of CARD_IDS) cardAcc[id].plays += m.cardPlays[id];
    for (let r = 1; r <= rounds; r++) {
      roundsPlayed[r]! += 1;
      perRound.hpLost[r]! += m.hpLost[r] ?? 0;
      perRound.healed[r]! += m.healed[r] ?? 0;
      perRound.shielded[r]! += m.shielded[r] ?? 0;
    }
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    totals.hpLost += sum(m.hpLost);
    totals.healed += sum(m.healed);
    totals.shielded += sum(m.shielded);
    totals.absorbed += m.absorbed;
    totals.burn += m.burn;
    for (const [reason, count] of Object.entries(m.fizzlesByReason)) {
      fizzlesByReason[reason] = (fizzlesByReason[reason] ?? 0) + count;
      totals.fizzles += count;
    }
    for (const id of HERO_IDS) totals.swaps += m.heroes[id].swaps;
    if (m.firstBloodMoon !== null) {
      bloodMoonMatches += 1;
      if (winner === m.firstBloodMoon) bloodMoonWins += 1;
    }
  }

  const heroes = emptyRecord(HERO_IDS, () => ({
    picks: 0, wins: 0, winRate: 0, avgDamage: 0, damageBy: { hits: 0, direct: 0, burn: 0 }, swaps: 0, fizzles: 0, ults: 0, deaths: 0,
  }));
  for (const id of HERO_IDS) {
    const a = heroAcc[id];
    const per = (v: number) => ratio(v, a.picks);
    const t = a.tally;
    heroes[id] = {
      picks: a.picks, wins: a.wins, winRate: ratio(a.wins, a.picks),
      avgDamage: per(t.hits + t.direct + t.burn),
      damageBy: { hits: per(t.hits), direct: per(t.direct), burn: per(t.burn) },
      swaps: per(t.swaps), fizzles: per(t.fizzles), ults: per(t.ults), deaths: per(t.deaths),
    };
  }
  const cards = emptyRecord(CARD_IDS, () => ({ picks: 0, plays: 0, winRate: 0 }));
  for (const id of CARD_IDS) {
    const a = cardAcc[id];
    cards[id] = { picks: a.picks, plays: a.plays, winRate: ratio(a.wins, a.picks) };
  }
  const perMatch = <T extends Record<string, number>>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ratio(v, n)])) as T;
  const avgByRound = (arr: number[]) => arr.map((v, r) => ratio(v, roundsPlayed[r] ?? 0));
  return {
    matches: n,
    avgRounds: ratio(totalRounds, n),
    roundHistogram: histogram,
    drawRate: ratio(draws, n),
    roundLimitRate: ratio(ROUND_LIMIT_REASONS.reduce((acc, r) => acc + resultReasons[r], 0), n),
    resultReasons,
    bloodMoonRate: ratio(bloodMoonMatches, n),
    bloodMoonComebackRate: ratio(bloodMoonWins, bloodMoonMatches),
    perRound: { hpLost: avgByRound(perRound.hpLost), healed: avgByRound(perRound.healed), shielded: avgByRound(perRound.shielded) },
    totals: perMatch(totals),
    fizzlesByReason: perMatch(fizzlesByReason),
    heroes,
    cards,
  };
}
