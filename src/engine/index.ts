// Public entry point of the battle engine: the UI imports only from here.
export { createMatch, validateDeck, getWinner } from './match';
export { startRound, resolveRound } from './resolve/round';
export { validateCommands } from './validate';
export { viewFor, eventsFor } from './view';
export { chooseCommands } from './bot';
export { legalActions, legalCardPlays } from './legal';
export { formatLog, formatEvent } from './log';
export { createRng } from './rng';
export { HEROES, HERO_IDS } from './data/heroes';
export { CARDS, CARD_IDS } from './data/cards';
export { MOON_ORDER } from './types';

export type {
  MatchState, SideCommands, HeroAction, CardPlay, Deck, HeroId, CardId, Slot, Side, SlotRef, StatusId, Status,
  MoonPhase, Element, Role, HeroDef, CardDef, GameEvent,
} from './types';
export type { PublicState } from './view';
export type { ValidationIssue, ValidationCode } from './errors';
export type { LegalActions, BlockReason } from './legal';
export type { Rng } from './rng';
