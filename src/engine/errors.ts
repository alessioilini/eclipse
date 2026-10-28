import type { Slot } from './types';

/** Why `validateCommands` rejects a command set; Russian texts live outside the engine (src/i18n/ru.ts). */
export type ValidationCode =
  | 'DEAD_HERO' | 'NONE_ONLY_DEAD' | 'TARGET_DEAD' | 'WRONG_TARGET' | 'SKILL_FREEZE'
  | 'SKILL_SILENCE' | 'ULT_SILENCE' | 'ULT_USED' | 'ENERGY' | 'LUNA' | 'RESERVE_DEAD'
  | 'DUPLICATE_RESERVE' | 'SWAP_BANNED' | 'CARD_NOT_IN_HAND' | 'ONE_CARD';

/**
 * One violation: `slot` is the acting heroine's slot for hero-action issues, `card: true` marks
 * card issues; resource issues (`ENERGY`, `LUNA`) carry neither.
 */
export type ValidationIssue = { code: ValidationCode; slot?: Slot; card?: true };
