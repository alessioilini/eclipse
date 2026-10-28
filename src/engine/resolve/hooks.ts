import type { CardId, Slot, SlotRef } from '../types';
import type { Ctx } from './context';

export type HookPayload = {
  target?: SlotRef; amount?: number; flat?: { v: number }; reductions?: { v: number };
  card?: CardId; secondary?: SlotRef | { reserveIndex: Slot };
};
export type HookFn = (ctx: Ctx, self: SlotRef, payload: HookPayload) => void;

/** Named hero/card logic (spec §6.2). Filled in by Task 9–11. */
export const HOOKS: Record<string, HookFn> = {};
