import type { GameEvent, MatchState, Side, SideState } from './types';
import { other } from './targeting';

/** The viewer's own side: hand and discard visible, the deck order hidden behind its size (ruling R33). */
export type OwnView = Omit<SideState, 'deck'> & { deckSize: number };
/** The opponent's side: hand, deck and discard hidden behind sizes. */
export type OpponentView = Omit<SideState, 'hand' | 'deck' | 'discard'> & { handSize: number; deckSize: number };
/** What one side may see (ruling R33): no seed, no Rng state, no deck order. */
export type PublicState = Omit<MatchState, 'sides' | 'seed' | 'rngState'> & { sides: Record<Side, OwnView | OpponentView> };

/**
 * State as seen by `side`: `seed` and `rngState` are dropped (they would reveal every future shuffle),
 * the own deck becomes `deckSize`, the opponent's hand, deck and discard become sizes.
 */
// `armedReactions` of the opponent stay visible: they are reset at round start and empty at planning time.
export function viewFor(state: MatchState, side: Side): PublicState {
  const { seed, rngState, ...copy } = structuredClone(state);
  void seed; void rngState;
  const foe = other(side);
  const { deck: ownDeck, ...ownRest } = copy.sides[side];
  const own: OwnView = { ...ownRest, deckSize: ownDeck.length };
  const { hand, deck, discard, ...rest } = copy.sides[foe];
  void discard;
  const opponent: OpponentView = { ...rest, handSize: hand.length, deckSize: deck.length };
  return { ...copy, sides: { [side]: own, [foe]: opponent } as Record<Side, OwnView | OpponentView> };
}

/** Events that reveal a card id privately to its owner: the opponent sees only that it happened. */
const PRIVATE_CARD_EVENTS = new Set(['draw', 'discardOverflow']);

/**
 * Events as seen by `side` (ruling R33): a copy in which the opponent's `draw` and `discardOverflow`
 * events lose their `cardId`; every other event is copied unchanged.
 */
export function eventsFor(events: GameEvent[], side: Side): GameEvent[] {
  return events.map(ev => {
    const copy = structuredClone(ev);
    if (PRIVATE_CARD_EVENTS.has(ev.type) && ev['side'] !== side) delete copy['cardId'];
    return copy;
  });
}
