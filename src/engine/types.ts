export type Side = 'A' | 'B';
export type Slot = 0 | 1 | 2;
export type HeroIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type SlotRef = { side: Side; slot: Slot };
export type Element = 'fire' | 'water' | 'wind' | 'light' | 'dark' | 'star';
export type Role = 'guardian' | 'striker' | 'mage' | 'support';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';
export const MOON_ORDER: MoonPhase[] = ['new', 'waxing', 'full', 'waning'];
export type Timing = 'swift' | 'reaction' | 'standard';

export type HeroId = 'aira' | 'fenna' | 'nerisa' | 'tali' | 'zefira' | 'liraya'
  | 'aurora' | 'justina' | 'nokta' | 'kira' | 'mira' | 'selena';
export type CardId = 'lunarDash' | 'wardCircle' | 'fieldKit' | 'unseal' | 'huntersMark'
  | 'emergencySwap' | 'lunarSpark' | 'breakRhythm' | 'piercingStrike' | 'cover' | 'warCry'
  | 'reserveImpulse' | 'moonTurn' | 'moonReverse' | 'dispel' | 'healingWave' | 'bloodPact'
  | 'ashTrail' | 'swapBan' | 'deferredDeath' | 'eclipse' | 'sealBreak' | 'lastWord' | 'rewriteFate';

export type StatusId = 'burn' | 'soak' | 'freeze' | 'silence' | 'curse' | 'mark' | 'taunt'
  | 'spd' | 'atk' | 'damageReduction' | 'undying'
  | 'pierce'        // Сквозной удар: следующий удар +value, игнорирует щит
  | 'nextHitBonus'  // Селена пассивка: следующий удар +value
  | 'redirectTo'    // Нериса / Прикрытие: следующий одиночный удар уходит в source
  | 'mirrorShield'  // Зефира skill: при пробитии щита атакующий получает Mark
  | 'reflect';      // Зефира ульта: value = оставшиеся срабатывания
export const DEBUFF_ORDER: StatusId[] = ['burn', 'soak', 'freeze', 'silence', 'curse', 'mark'];
export const BUFF_IDS: StatusId[] = ['taunt', 'damageReduction', 'undying', 'pierce', 'nextHitBonus', 'reflect', 'mirrorShield'];
// spd/atk считаются баффом при value > 0 и дебаффом при value < 0.

export type Duration = 'thisRound' | 'nextRound' | 'permanent';
export type Status = { id: StatusId; value: number; stacks: number; expiresAtRound: number | null; source?: SlotRef };

export type TargetType = 'self' | 'ally' | 'enemy' | 'allies' | 'enemies' | 'none'
  | 'allyAndGuardian' | 'slotAndReserve' | 'reserveSlot';

export type Condition =
  | { kind: 'targetHpBelow'; pct: number }
  | { kind: 'targetHasStatus'; status: StatusId }
  | { kind: 'targetHasShieldOrBuff' }
  | { kind: 'selfHpBelow'; pct: number }
  | { kind: 'moonIs'; phase: MoonPhase }
  | { kind: 'isBloodMoon' }
  | { kind: 'oddRound' };

export type Primitive =
  | { op: 'damage'; mod: number; flat?: number; hits?: number; aoe?: boolean; when?: Condition; elseMod?: number }
  | { op: 'heal'; amount: number; when?: Condition; elseAmount?: number }
  | { op: 'shield'; amount: number; who?: 'self' | 'target' | 'allies' }
  | { op: 'status'; status: StatusId; value?: number; duration: Duration; who?: 'self' | 'target' | 'enemies' | 'allies'; when?: Condition }
  | { op: 'cleanse'; count: number; who?: 'target' | 'allies' }
  | { op: 'moon'; shift?: -1 | 1; set?: MoonPhase }
  | { op: 'luna'; amount: number }
  | { op: 'draw'; amount: number }
  | { op: 'selfHp'; amount: number }   // отрицательное = потеря, не ниже 1
  | { op: 'hook'; name: string };

export type TriggerEvent = 'roundStart' | 'beforeDealDamage' | 'afterDealDamage' | 'beforeTakeDamage'
  | 'onHeal' | 'onShieldGranted' | 'onEnemyBuffed' | 'onMoonShift' | 'onCardPlayed' | 'onDeath' | 'burnTick';
export type Trigger = { on: TriggerEvent; once?: 'round' | 'match'; hook: string };

export type Ability = { name: string; cost: number; target: TargetType; effects: Primitive[] };
export type HeroDef = { id: HeroId; name: string; element: Element; role: Role; rarity: Rarity;
  hp: number; atk: number; spd: number; passive: { name: string; text: string; triggers: Trigger[] };
  skill: Ability; ultimate: Ability };
export type CardDef = { id: CardId; name: string; rarity: Rarity; cost: number; timing: Timing;
  target: TargetType; effects: Primitive[]; text: string };

export type HeroState = { id: HeroId; hp: number; maxHp: number; shield: number; shieldExpiresAtRound: number | null;
  statuses: Status[]; ultimateUsed: boolean; bloodMoon: boolean; once: Partial<Record<string, number>> };
export type ArmedReaction = { cardId: CardId; target?: SlotRef; secondary?: SlotRef };
export type SideState = { energy: number; maxEnergyBonus: number; luna: number;
  hand: CardId[]; deck: CardId[]; discard: CardId[]; lastCardPlayed: { cardId: CardId; target?: SlotRef } | null;
  bloodMoonUsed: boolean; damageDealt: number; cardsPlayedThisRound: number;
  active: [HeroState, HeroState, HeroState]; reserve: [HeroState, HeroState, HeroState];
  armedReactions: ArmedReaction[];
  flags: { swapBanned: boolean; energyBonus: number; cardCostDelta: number };
  nextCardCostUp: { value: number; untilRound: number } | null };
export type MatchState = { seed: number; rngState: number; round: number; moon: MoonPhase;
  sides: Record<Side, SideState>; roundFlags: { moonShifted: boolean; ultLunaDelta: number };
  deaths: { side: Side; heroId: HeroId; round: number }[];
  /** true between startRound and resolveRound: the round has started and waits for both sides' commands. */
  awaitingCommands: boolean;
  result: null | { winner: Side | 'draw'; reason: 'wipe' | 'heroes' | 'hpPct' | 'damage' | 'draw' } };

export type HeroAction = { type: 'basic'; target: SlotRef } | { type: 'skill'; target?: SlotRef }
  | { type: 'ultimate'; target?: SlotRef } | { type: 'swap'; reserveIndex: Slot } | { type: 'none' };
export type CardPlay = { handIndex: number; target?: SlotRef; secondary?: SlotRef | { reserveIndex: Slot } };
export type SideCommands = { actions: [HeroAction, HeroAction, HeroAction]; card?: CardPlay };
export type Deck = { heroes: HeroId[]; starting: [HeroIndex, HeroIndex, HeroIndex] /* индексы в heroes */; cards: CardId[] };

export type GameEvent = { type: string; round: number; phase: string; [k: string]: unknown };
