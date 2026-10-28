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
  MoonPhase, Element, Role, HeroDef, CardDef, GameEvent, HeroState, SideState, TargetType, Timing, Rarity,
} from './types';
export type { PublicState, OwnView, OpponentView } from './view';
export type { PlanningState } from './validate';
export type { ValidationIssue, ValidationCode } from './errors';
export type { LegalActions, LegalCardPlay, BlockReason } from './legal';
export type {
  EngineEvent, EventInput, EventOf, EventBase, EventPayload, Phase, CardSource, EventSource,
  SkipReason, HeroFizzleReason, CardFizzleReason, RedirectReason, SwapReason, DirectDamageReason, EnergyReason,
  LunaReason, MatchEndReason,
  RoundStartEvent, DrawEvent, DiscardOverflowEvent, ReshuffleEvent, RevealEvent, MatchEndEvent,
  CardPlayedEvent, ReactionArmedEvent, ReactionTriggeredEvent, FizzleEvent, HeroFizzleEvent, CardFizzleEvent,
  SwapBannedEvent, UltCostUpEvent, CardCostUpEvent,
  HeroActionEvent, RetargetEvent, RedirectEvent, SwapEvent, AutoFillEvent,
  DamageEvent, DirectDamageEvent, SelfHpEvent, BurnEvent, DetonateEvent, ReflectEvent, HealEvent, ShieldEvent,
  ShieldRemovedEvent, ShieldExpiredEvent,
  StatusAppliedEvent, StatusRemovedEvent,
  EnergyChangedEvent, LunaChangedEvent, MoonChangedEvent,
  DeathEvent, ReviveEvent, BloodMoonEvent,
} from './events';
export type { Rng } from './rng';
