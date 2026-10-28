import { createRng } from './rng';
import { HEROES } from './data/heroes';
import { CARDS } from './data/cards';
import type { CardId, Deck, HeroId, HeroState, MatchState, SideState } from './types';

/** Spec §2.1. Returns every violation found; an empty array means the deck is valid. */
export function validateDeck(deck: Deck): string[] {
  const errors: string[] = [];

  if (deck.heroes.length !== 6) errors.push('deck must have exactly 6 heroes');
  const seenHeroes = new Set<HeroId>();
  for (const id of deck.heroes) {
    if (!(id in HEROES)) errors.push(`unknown hero: ${id}`);
    else if (seenHeroes.has(id)) errors.push(`duplicate hero: ${id}`);
    seenHeroes.add(id);
  }

  const st = deck.starting;
  const startingOk = Array.isArray(st) && st.length === 3
    && st.every((i) => Number.isInteger(i) && i >= 0 && i <= 5)
    && new Set(st).size === 3;
  if (!startingOk) errors.push('starting must be 3 distinct indices 0..5');

  if (deck.cards.length !== 12) errors.push('deck must have exactly 12 cards');
  const counts = new Map<CardId, number>();
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  let legendaryTotal = 0;
  for (const [id, n] of counts) {
    const def = CARDS[id];
    if (!def) { errors.push(`unknown card: ${id}`); continue; }
    if (n > 2) errors.push(`more than 2 copies of ${id}`);
    if (def.rarity === 'legendary') {
      legendaryTotal += n;
      if (n > 1) errors.push(`more than 1 copy of legendary ${id}`);
    }
  }
  if (legendaryTotal > 2) errors.push('more than 2 legendary cards');

  return errors;
}

function createHero(id: HeroId): HeroState {
  const hp = HEROES[id].hp;
  return { id, hp, maxHp: hp, shield: 0, shieldExpiresAtRound: null, statuses: [],
    ultimateUsed: false, bloodMoon: false, once: {} };
}

function createSide(deck: Deck, shuffled: CardId[]): SideState {
  const heroes = deck.heroes.map(createHero);
  const startingSet = new Set<number>(deck.starting);
  const active = deck.starting.map((i) => heroes[i]!) as SideState['active'];
  const reserve = heroes.filter((_, i) => !startingSet.has(i)) as SideState['reserve'];
  return {
    energy: 0, maxEnergyBonus: 0, luna: 0,
    hand: shuffled.slice(0, 3), deck: shuffled.slice(3), discard: [],
    lastCardPlayed: null, bloodMoonUsed: false, damageDealt: 0, cardsPlayedThisRound: 0,
    active, reserve, armedReactions: [],
    flags: { swapBanned: false, energyBonus: 0, cardCostDelta: 0 },
    nextCardCostUp: null,
  };
}

/** Builds the initial state: shuffles both decks (A first, then B) and draws the starting hands of 3. */
export function createMatch(deckA: Deck, deckB: Deck, seed: number): MatchState {
  const rng = createRng(seed);
  const shuffledA = rng.shuffle(deckA.cards);
  const shuffledB = rng.shuffle(deckB.cards);
  return {
    seed, rngState: rng.state(), round: 0, moon: 'new',
    sides: { A: createSide(deckA, shuffledA), B: createSide(deckB, shuffledB) },
    roundFlags: { moonShifted: false, ultLunaDelta: 0 },
    deaths: [], result: null, awaitingCommands: false,
  };
}

function allHeroes(side: SideState): HeroState[] {
  return [...side.active, ...side.reserve];
}

/** Spec §2.2. Pure: returns null while the match is not over. */
export function getWinner(state: MatchState): MatchState['result'] {
  const a = state.sides.A, b = state.sides.B;
  const aliveA = allHeroes(a).filter((h) => h.hp > 0).length;
  const aliveB = allHeroes(b).filter((h) => h.hp > 0).length;

  if (aliveA === 0 && aliveB === 0) return { winner: 'draw', reason: 'wipe' };
  if (aliveB === 0) return { winner: 'A', reason: 'wipe' };
  if (aliveA === 0) return { winner: 'B', reason: 'wipe' };
  if (state.round < 10) return null;

  if (aliveA !== aliveB) return { winner: aliveA > aliveB ? 'A' : 'B', reason: 'heroes' };

  const pct = (s: SideState) => allHeroes(s).reduce((sum, h) => sum + h.hp / h.maxHp, 0);
  const pctA = pct(a), pctB = pct(b);
  if (pctA !== pctB) return { winner: pctA > pctB ? 'A' : 'B', reason: 'hpPct' };

  if (a.damageDealt !== b.damageDealt) {
    return { winner: a.damageDealt > b.damageDealt ? 'A' : 'B', reason: 'damage' };
  }
  return { winner: 'draw', reason: 'draw' };
}
