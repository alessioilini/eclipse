import type {
  CardId, EngineEvent, HeroState, PublicState, Side, Slot, SlotRef, Status, StatusId,
} from '../../engine';
import type { Beat } from './toBeats';
import type { ViewHero, ViewState } from './types';

export type { ViewHero, ViewState } from './types';

const SIDES: Side[] = ['A', 'B'];
const MAX_BURN_STACKS = 3;
/** «Переписать судьбу» brings the dying heroine back at 1 HP (engine reactions.ts); its event carries no hp. */
const REWRITE_FATE_HP = 1;
/** `redirectTo` values (engine targeting.ts): the cover card and Nerisa's skill. */
const REDIRECT_COVER = 2;
const REDIRECT_NERISA = 1;

type ViewSide = ViewState['sides'][Side];

function heroView(h: HeroState): ViewHero {
  return {
    heroId: h.id, hp: h.hp, maxHp: h.maxHp, shield: h.shield,
    statuses: h.statuses.map(s => ({ ...s })), alive: h.hp > 0,
  };
}

/** Initial display state from the engine view after `startRound` (UI spec §4.3). */
export function viewFromPublic(view: PublicState): ViewState {
  const sides = {} as Record<Side, ViewSide>;
  for (const side of SIDES) {
    const sd = view.sides[side];
    const heroes = [...sd.active, ...sd.reserve];
    const base = {
      active: sd.active.map(heroView), reserve: sd.reserve.map(heroView),
      energy: sd.energy, luna: sd.luna, bloodMoon: heroes.some(h => h.bloodMoon),
    };
    sides[side] = 'hand' in sd
      ? { ...base, hand: [...sd.hand], handSize: sd.hand.length }
      : { ...base, handSize: sd.handSize };
  }
  return { round: view.round, moon: view.moon, sides };
}

// --- Copy-on-write helpers (inputs are never mutated) -------------------------------------------

function cloneSide(sd: ViewSide): ViewSide {
  return { ...sd, active: [...sd.active], reserve: [...sd.reserve], ...(sd.hand ? { hand: [...sd.hand] } : {}) };
}

function withSide(v: ViewState, side: Side, f: (sd: ViewSide) => ViewSide): ViewState {
  return { ...v, sides: { ...v.sides, [side]: f(cloneSide(v.sides[side])) } };
}

function withActive(v: ViewState, ref: SlotRef, f: (h: ViewHero) => ViewHero): ViewState {
  return withSide(v, ref.side, sd => {
    const h = sd.active[ref.slot];
    if (h) sd.active[ref.slot] = f(h);
    return sd;
  });
}

function withReserve(v: ViewState, side: Side, index: Slot, f: (h: ViewHero) => ViewHero): ViewState {
  return withSide(v, side, sd => {
    const h = sd.reserve[index];
    if (h) sd.reserve[index] = f(h);
    return sd;
  });
}

const setHp = (hp: number) => (h: ViewHero): ViewHero => ({ ...h, hp });

function removeCard(hand: CardId[] | undefined, cardId: CardId | undefined): CardId[] | undefined {
  if (!hand) return hand;
  const i = cardId === undefined ? -1 : hand.indexOf(cardId);
  return i < 0 ? hand : hand.filter((_, j) => j !== i);
}

/** A card left the hand (played, fizzled or discarded): own hand loses it by id, both sides count −1. */
function cardLeft(v: ViewState, side: Side, cardId: CardId | undefined): ViewState {
  return withSide(v, side, sd => {
    const hand = removeCard(sd.hand, cardId);
    return { ...sd, handSize: Math.max(0, sd.handSize - 1), ...(hand ? { hand } : {}) };
  });
}

const isModifier = (id: StatusId): boolean => id === 'spd' || id === 'atk';
/** Statuses the engine keeps as separate entries (status.ts `isAppended`). */
const isAppended = (id: StatusId): boolean => isModifier(id) || id === 'redirectTo';
const isSlotRef = (x: object): x is SlotRef => 'slot' in x;

/** Mirrors the engine's `applyStatus`; the event has no duration, so a new entry gets `expiresAtRound: null`. */
function addStatus(statuses: Status[], id: StatusId, value: number, source?: SlotRef): Status[] {
  const fresh: Status = { id, value, stacks: 1, expiresAtRound: null, ...(source ? { source } : {}) };
  const i = statuses.findIndex(s => s.id === id);
  if (isAppended(id) || i < 0) return [...statuses, fresh];
  const old = statuses[i]!;
  const next: Status = id === 'burn'
    ? { ...old, stacks: Math.min(MAX_BURN_STACKS, old.stacks + 1) }
    : { ...fresh, expiresAtRound: old.expiresAtRound };
  return statuses.map((s, j) => (j === i ? next : s));
}

/** Index of the first entry matching `pred`, removed. */
function dropFirst(statuses: Status[], pred: (s: Status) => boolean): Status[] {
  const i = statuses.findIndex(pred);
  return i < 0 ? statuses : statuses.filter((_, j) => j !== i);
}

/**
 * `statusRemoved`: 'expired' drops the one entry that expired (by round, else by value); 'consumed' and
 * a removal by an effect drop every entry of the id — except SPD/ATK modifiers, which an effect removes
 * one at a time: a cleanse takes the first negative one, «Разрыв печати» every positive one.
 */
function removeStatusEntries(statuses: Status[], ev: Extract<EngineEvent, { type: 'statusRemoved' }>): Status[] {
  const { status: id } = ev;
  if (ev.reason === 'expired') {
    const byRound = statuses.findIndex(s => s.id === id && s.expiresAtRound === ev.round);
    if (byRound >= 0) return statuses.filter((_, j) => j !== byRound);
    const byValue = statuses.findIndex(s => s.id === id && s.value === ev.value);
    if (byValue >= 0) return statuses.filter((_, j) => j !== byValue);
    return dropFirst(statuses, s => s.id === id);
  }
  if (ev.reason === undefined && isModifier(id)) {
    if (statuses.some(s => s.id === id && s.value < 0)) return dropFirst(statuses, s => s.id === id && s.value < 0);
    return statuses.filter(s => !(s.id === id && s.value > 0));
  }
  return statuses.filter(s => s.id !== id);
}

/** Blood Moon's cleanse of one debuff (engine `cleanse`): a modifier loses its first negative entry. */
function cleanseIds(statuses: Status[], ids: StatusId[]): Status[] {
  return ids.reduce((acc, id) => (isModifier(id)
    ? dropFirst(acc, s => s.id === id && s.value < 0)
    : acc.filter(s => s.id !== id)), statuses);
}

/** The `redirectTo` entry an interception used: the one of this kind pointing at the interceptor. */
function spendRedirect(statuses: Status[], kind: number, to: SlotRef): Status[] {
  const isKind = (s: Status) => s.id === 'redirectTo' && s.value === kind;
  const exact = statuses.findIndex(s => isKind(s) && s.source?.side === to.side && s.source.slot === to.slot);
  return exact >= 0 ? statuses.filter((_, j) => j !== exact) : dropFirst(statuses, isKind);
}

/** Exchanges active `slot` and reserve `reserveIndex`; a swap (not an autofill) drops the outgoing Taunt. */
function exchange(v: ViewState, side: Side, slot: Slot, reserveIndex: Slot, dropTaunt: boolean): ViewState {
  return withSide(v, side, sd => {
    const out = sd.active[slot];
    const inc = sd.reserve[reserveIndex];
    if (!out || !inc) return sd;
    sd.active[slot] = inc;
    sd.reserve[reserveIndex] = dropTaunt ? { ...out, statuses: out.statuses.filter(s => s.id !== 'taunt') } : out;
    return sd;
  });
}

const clearChips = (sd: ViewSide): ViewSide => ({
  ...sd, active: sd.active.map(({ chip, ...h }) => { void chip; return h; }),
});

/**
 * Applies one engine event to the display state (UI spec §4.3). Pure: returns a new object, the input
 * is untouched. Every member of `EngineEvent` is handled; events with no visible state return `v`.
 */
export function applyEvent(v: ViewState, ev: EngineEvent): ViewState {
  switch (ev.type) {
    // --- Round and deck ---
    case 'roundStart': {
      let next: ViewState = { ...v, round: ev.round, moon: ev.moon };
      for (const side of SIDES) {
        next = withSide(next, side, sd => ({ ...clearChips(sd), energy: ev.energy[side], luna: ev.luna[side] }));
      }
      return next;
    }
    case 'reveal': {
      let next = v;
      for (const side of SIDES) {
        next = withSide(next, side, sd => ({
          ...sd, active: sd.active.map((h, i) => ({ ...h, chip: structuredClone(ev.commands[side].actions[i]!) })),
        }));
      }
      return next;
    }
    case 'draw':
      return withSide(v, ev.side, sd => ({
        ...sd, handSize: sd.handSize + 1,
        ...(sd.hand && ev.cardId !== undefined ? { hand: [...sd.hand, ev.cardId] } : {}),
      }));
    case 'discardOverflow':
      return cardLeft(v, ev.side, ev.cardId);
    case 'reshuffle':
    case 'matchEnd':
      return v;

    // --- Cards ---
    // The engine takes a played card out of the hand at Reveal; the display waits for the card's own
    // event: `cardPlayed`, or a `fizzle` when it cannot be paid or its target is gone. Replays are free.
    case 'cardPlayed':
      return ev.replay ? v : cardLeft(v, ev.side, ev.cardId);
    case 'fizzle':
      return ev.action === 'card' && !ev.replay ? cardLeft(v, ev.side, ev.cardId) : v;
    case 'reactionTriggered':
      // «Переписать судьбу» cancels the death at 1 HP (the swap that follows has its own event).
      return ev.cardId === 'rewriteFate' ? withActive(v, ev.target, h => ({ ...h, hp: REWRITE_FATE_HP, alive: true })) : v;
    case 'reactionArmed':
    case 'swapBanned':
    case 'ultCostUp':
    case 'cardCostUp':
      return v;

    // --- Actions ---
    case 'heroAction':
    case 'retarget':
      return v;
    case 'redirect':
      // A cover / Nerisa interception spends the target's `redirectTo` entry (the engine emits no statusRemoved).
      return ev.reason === 'cover' || ev.reason === 'nerisa'
        ? withActive(v, ev.from, h => ({ ...h, statuses: spendRedirect(h.statuses, ev.reason === 'cover' ? REDIRECT_COVER : REDIRECT_NERISA, ev.to) }))
        : v;
    case 'swap':
      return exchange(v, ev.side, ev.slot, ev.reserveIndex, true);
    case 'autoFill':
      return exchange(v, ev.side, ev.slot, ev.reserveIndex, false);

    // --- Damage and healing (`hp` / `shield` are the values after the event) ---
    case 'damage':
      return withActive(v, ev.target, h => ({ ...h, hp: ev.hp, shield: ev.shield }));
    case 'directDamage':
    case 'selfHp':
    case 'burn':
    case 'detonate':
    case 'heal':
      return withActive(v, ev.target, setHp(ev.hp));
    case 'reflect': {
      const next = withActive(v, ev.to, setHp(ev.hp));
      return ev.charges > 0
        ? withActive(next, ev.from, h => ({ ...h, statuses: h.statuses.map(s => (s.id === 'reflect' ? { ...s, value: ev.charges } : s)) }))
        : next;
    }
    case 'shield':
      return ev.target
        ? withActive(v, ev.target, h => ({ ...h, shield: ev.shield }))
        : withReserve(v, ev.side, ev.reserveIndex, h => ({ ...h, shield: ev.shield }));
    case 'shieldRemoved':
    case 'shieldExpired':
      return withActive(v, ev.target, h => ({ ...h, shield: 0 }));

    // --- Statuses ---
    case 'statusApplied': {
      const source = isSlotRef(ev.source) ? ev.source : undefined;
      return withActive(v, ev.target, h => ({ ...h, statuses: addStatus(h.statuses, ev.status, ev.value, source) }));
    }
    case 'statusRemoved':
      return withActive(v, ev.target, h => ({ ...h, statuses: removeStatusEntries(h.statuses, ev) }));

    // --- Resources and the Moon ---
    case 'energyChanged':
      return withSide(v, ev.side, sd => ({ ...sd, energy: ev.energy }));
    case 'lunaChanged':
      return withSide(v, ev.side, sd => ({ ...sd, luna: ev.luna }));
    case 'moonChanged':
      return { ...v, moon: ev.to };

    // --- Life and death ---
    case 'death':
      return withActive(v, { side: ev.side, slot: ev.slot }, h => ({ ...h, hp: 0, alive: false }));
    case 'revive': {
      const back = (h: ViewHero): ViewHero => ({ ...h, hp: ev.hp, shield: 0, statuses: [], alive: true });
      return ev.slot !== undefined
        ? withActive(v, { side: ev.side, slot: ev.slot }, back)
        : withReserve(v, ev.side, ev.reserveIndex, back);
    }
    case 'bloodMoon': {
      const cleanse = (h: ViewHero): ViewHero => ({ ...h, statuses: cleanseIds(h.statuses, ev.cleansed ?? []) });
      const next = ev.slot !== null
        ? withActive(v, { side: ev.side, slot: ev.slot }, cleanse)
        : withReserve(v, ev.side, ev.reserveIndex, cleanse);
      return withSide(next, ev.side, sd => ({ ...sd, bloodMoon: true }));
    }

    default: {
      const unhandled: never = ev;
      void unhandled;
      return v;
    }
  }
}

/** Applies the events of one beat in order. */
export function applyBeat(v: ViewState, beat: Beat): ViewState {
  return beat.events.reduce(applyEvent, v);
}
