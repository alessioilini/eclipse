import type {
  CardId, HeroId, MatchState, MoonPhase, Side, SideCommands, Slot, SlotRef, StatusId,
} from './types';

// Typed engine events (engine spec §6.3): one member per event type, with exactly the fields the
// resolver emits. `round` and `phase` are stamped by `emit` (resolve/context.ts) on every event.
// A type with two shapes (fizzle, shield, revive, BloodMoonHero) marks the other shape's fields `?: never`,
// so `ev.slot` / `ev.target` can be read and tested on either shape.

/** Resolution phase in which an event was emitted. */
export type Phase = 'roundStart' | 'reveal' | 'swift' | 'reactions' | 'heroes' | 'standard' | 'endRound';
export type EventBase = { round: number; phase: Phase };

/** A tactic card as the source of an effect (it has no slot). */
export type CardSource = { side: Side; cardId: CardId };
/** Who causes an effect: a heroine in an active slot, or a card played by a side. */
export type EventSource = SlotRef | CardSource;

export type SkipReason = 'dead' | 'entered' | 'no target' | 'reserve dead' | 'swap banned';
export type HeroFizzleReason = 'silence' | 'freeze' | 'energy' | 'luna';
export type CardFizzleReason = 'energy' | 'target dead' | 'reserve dead' | 'no target' | 'no guardian';
export type RedirectReason = 'taunt' | 'cover' | 'nerisa' | 'zefira';
export type SwapReason = 'emergencySwap' | 'rewriteFate';
export type DirectDamageReason = 'nokta.fallen' | 'lastWord' | 'bloodPact' | 'sealBreak';
export type EnergyReason = 'skill' | 'ultimate' | 'card' | 'bloodPact';
export type LunaReason = 'roundStart' | 'ultimate' | 'verdict' | 'death' | 'ability' | 'card' | 'lastWord';
export type MatchEndReason = NonNullable<MatchState['result']>['reason'];

// --- Round and deck ---------------------------------------------------------------------------
export type RoundStartEvent = { type: 'roundStart'; moon: MoonPhase; energy: Record<Side, number>; luna: Record<Side, number> };
/** `cardId` is removed by `eventsFor` for the opponent's draws. */
export type DrawEvent = { type: 'draw'; side: Side; cardId?: CardId };
/** `cardId` is removed by `eventsFor` for the opponent's discards. */
export type DiscardOverflowEvent = { type: 'discardOverflow'; side: Side; cardId?: CardId };
export type ReshuffleEvent = { type: 'reshuffle'; side: Side; count: number };
export type RevealEvent = { type: 'reveal'; commands: Record<Side, SideCommands> };
export type MatchEndEvent = { type: 'matchEnd'; winner: Side | 'draw'; reason: MatchEndReason };

// --- Cards ------------------------------------------------------------------------------------
/** `replay` only on Mira's «Повторение» (cost 0). */
export type CardPlayedEvent = {
  type: 'cardPlayed'; side: Side; cardId: CardId; target?: SlotRef; secondary?: SlotRef | { reserveIndex: Slot };
  cost: number; replay?: true;
};
/** `target`/`heroId` only for «Последнее слово»; «Переписать судьбу» is armed for the whole side. */
export type ReactionArmedEvent = { type: 'reactionArmed'; side: Side; cardId: CardId; target?: SlotRef; heroId?: HeroId };
export type ReactionTriggeredEvent = { type: 'reactionTriggered'; side: Side; cardId: CardId; target: SlotRef; heroId: HeroId };
export type HeroFizzleEvent = {
  type: 'fizzle'; side: Side; slot: Slot; heroId: HeroId; action: 'skill' | 'ultimate'; reason: HeroFizzleReason;
  cardId?: never; replay?: never;
};
/** `replay` when Mira's «Повторение» re-runs a card whose target is gone. */
export type CardFizzleEvent = {
  type: 'fizzle'; side: Side; cardId: CardId; action: 'card'; reason: CardFizzleReason; replay?: true;
  slot?: never; heroId?: never;
};
export type FizzleEvent = HeroFizzleEvent | CardFizzleEvent;
export type SwapBannedEvent = { type: 'swapBanned'; side: Side };
export type UltCostUpEvent = { type: 'ultCostUp'; luna: number };
export type CardCostUpEvent = { type: 'cardCostUp'; source: SlotRef; side: Side; value: number; untilRound: number };

// --- Actions ----------------------------------------------------------------------------------
/** `target` on basic and on single-target skill/ultimate; `reason` only with `action: 'skipped'`. */
export type HeroActionEvent = {
  type: 'heroAction'; side: Side; slot: Slot; heroId: HeroId;
  action: 'basic' | 'skill' | 'ultimate' | 'swap' | 'skipped'; target?: SlotRef; reason?: SkipReason;
};
export type RetargetEvent = { type: 'retarget'; from: SlotRef; to: SlotRef };
export type RedirectEvent = { type: 'redirect'; from: SlotRef; to: SlotRef; reason: RedirectReason };
/** `reason` only for card swaps. */
export type SwapEvent = { type: 'swap'; side: Side; slot: Slot; reserveIndex: Slot; out: HeroId; in: HeroId; reason?: SwapReason };
export type AutoFillEvent = { type: 'autoFill'; side: Side; slot: Slot; reserveIndex: Slot; in: HeroId };

// --- Damage and healing -----------------------------------------------------------------------
export type DamageEvent = {
  type: 'damage'; attacker: SlotRef; target: SlotRef; attackerId: HeroId; targetId: HeroId;
  raw: number; flat: number; reductions: number; dmg: number; absorbed: number; hpLoss: number; hp: number; shield: number;
};
export type DirectDamageEvent = {
  type: 'directDamage'; source: EventSource; target: SlotRef; dmg: number; hp: number; reason: DirectDamageReason;
};
export type SelfHpEvent = { type: 'selfHp'; target: SlotRef; hpLoss: number; hp: number };
export type BurnEvent = { type: 'burn'; target: SlotRef; stacks: number; dmg: number; hp: number };
export type DetonateEvent = { type: 'detonate'; source: SlotRef; target: SlotRef; stacks: number; dmg: number; hp: number };
export type ReflectEvent = { type: 'reflect'; from: SlotRef; to: SlotRef; dmg: number; charges: number; hp: number };
export type HealEvent = { type: 'heal'; source: EventSource; target: SlotRef; amount: number; healed: number; hp: number };
/** An active heroine is `target`; a reserve heroine (Fenna's revive) is `side` + `reserveIndex`. */
export type ShieldEvent = { type: 'shield'; source: SlotRef; amount: number; shield: number }
  & ({ target: SlotRef; side?: never; reserveIndex?: never } | { target?: never; side: Side; reserveIndex: Slot });
export type ShieldRemovedEvent = { type: 'shieldRemoved'; target: SlotRef; amount: number };
export type ShieldExpiredEvent = { type: 'shieldExpired'; target: SlotRef; amount: number };

// --- Statuses ---------------------------------------------------------------------------------
export type StatusAppliedEvent = { type: 'statusApplied'; source: EventSource; target: SlotRef; status: StatusId; value: number };
/** No `reason` when an effect removes the status; `value` only with `reason: 'expired'`. */
export type StatusRemovedEvent = {
  type: 'statusRemoved'; target: SlotRef; status: StatusId; value?: number; reason?: 'consumed' | 'expired';
};

// --- Resources and the Moon -------------------------------------------------------------------
export type EnergyChangedEvent = { type: 'energyChanged'; side: Side; energy: number; delta: number; reason: EnergyReason };
export type LunaChangedEvent = { type: 'lunaChanged'; side: Side; luna: number; delta: number; reason: LunaReason };
export type MoonChangedEvent = { type: 'moonChanged'; from: MoonPhase; to: MoonPhase; by: EventSource };

// --- Life and death ---------------------------------------------------------------------------
export type DeathEvent = { type: 'death'; side: Side; slot: Slot; heroId: HeroId };
/** The heroine comes back where she lies: an active `slot` or a `reserveIndex`. */
export type ReviveEvent = { type: 'revive'; side: Side; heroId: HeroId; hp: number }
  & ({ slot: Slot; reserveIndex?: never } | { slot?: never; reserveIndex: Slot });
/** One heroine under Blood Moon: `slot: null` + `reserveIndex` when she stands in reserve; `cleansed` only if a debuff was removed. */
export type BloodMoonHero = { heroId: HeroId; cleansed?: StatusId[] }
  & ({ slot: Slot; reserveIndex?: never } | { slot: null; reserveIndex: Slot });
/** Spec §2.7: Blood Moon rises over a side; `heroes` are her living heroines, actives first, then reserve. */
export type BloodMoonEvent = { type: 'bloodMoon'; side: Side; heroes: BloodMoonHero[] };

/** Every event payload, before `round` and `phase` are stamped. */
export type EventPayload =
  | RoundStartEvent | DrawEvent | DiscardOverflowEvent | ReshuffleEvent | RevealEvent | MatchEndEvent
  | CardPlayedEvent | ReactionArmedEvent | ReactionTriggeredEvent | FizzleEvent | SwapBannedEvent | UltCostUpEvent
  | CardCostUpEvent
  | HeroActionEvent | RetargetEvent | RedirectEvent | SwapEvent | AutoFillEvent
  | DamageEvent | DirectDamageEvent | SelfHpEvent | BurnEvent | DetonateEvent | ReflectEvent | HealEvent | ShieldEvent
  | ShieldRemovedEvent | ShieldExpiredEvent
  | StatusAppliedEvent | StatusRemovedEvent
  | EnergyChangedEvent | LunaChangedEvent | MoonChangedEvent
  | DeathEvent | ReviveEvent | BloodMoonEvent;

/** An engine event: a discriminated union on `type`, every member stamped with `round` and `phase`. */
export type EngineEvent = EventBase & EventPayload;

/** `Omit` applied to each member of a union separately (plain `Omit` would merge the members). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What `emit` takes: an event without `round` and `phase`. */
export type EventInput = DistributiveOmit<EngineEvent, 'round' | 'phase'>;

/** The event of one type. */
export type EventOf<T extends EngineEvent['type']> = Extract<EngineEvent, { type: T }>;
