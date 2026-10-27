import type { MatchState, Side, SideState } from './types';
import { other } from './targeting';

export type OpponentView = Omit<SideState, 'hand' | 'deck' | 'discard'> & { handSize: number; deckSize: number };
export type PublicState = Omit<MatchState, 'sides'> & { sides: Record<Side, SideState | OpponentView> };

/** State as seen by `side`: the opponent's hand, deck and discard are hidden behind sizes. */
// `armedReactions` of the opponent stay visible: they are reset at round start and empty at planning time.
export function viewFor(state: MatchState, side: Side): PublicState {
  const copy = structuredClone(state);
  const foe = other(side);
  const { hand, deck, discard, ...rest } = copy.sides[foe];
  void discard;
  const opponent: OpponentView = { ...rest, handSize: hand.length, deckSize: deck.length };
  return { ...copy, sides: { ...copy.sides, [foe]: opponent } } as PublicState;
}
