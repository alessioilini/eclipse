import type { MatchState, Slot, SlotRef } from '../../engine';
import type { Draft } from '../session';
import type { Requirement, TutorialScript, TutorialStep } from './types';

export type ActionKind = 'basic' | 'skill' | 'ultimate' | 'swap';

/**
 * Что интерфейс планирования разрешает сейчас. Пусто, пока текущий шаг — текст; шаг `require`
 * разрешает ровно требуемое; вне шагов (свободная игра) разрешено всё.
 */
export type AllowSet = {
  slots: Slot[];
  actions: ActionKind[];
  targets: SlotRef[] | 'any';
  /** Индексы резерва для «Смены» (и второй цели карты «Экстренная замена»). */
  reserve: Slot[] | 'any';
  /** Индексы карт в руке. */
  cards: number[];
  confirm: boolean;
};

/**
 * Состояние прохождения сценария — простые данные. `round` — раунд, планирование которого идёт
 * (растёт после каждого проигрывания); шаг раунда `r` становится текущим, когда `round >= r`,
 * шаг `afterPlayback` раунда `r` — после его проигрывания (`round > r`).
 */
export type RunnerState = { script: TutorialScript; stepIndex: number; round: number };

const SLOTS: Slot[] = [0, 1, 2];
const ALL_ACTIONS: ActionKind[] = ['basic', 'skill', 'ultimate', 'swap'];

export const NOTHING_ALLOWED: AllowSet = { slots: [], actions: [], targets: [], reserve: [], cards: [], confirm: false };

export function createRunner(script: TutorialScript): RunnerState {
  return { script, stepIndex: 0, round: 1 };
}

const isActive = (step: TutorialStep, round: number): boolean =>
  ('afterPlayback' in step ? round > step.round : round >= step.round);

/** Текущий шаг, если он уже наступил; null — свободная игра (до следующего шага или после последнего). */
export function current(r: RunnerState): TutorialStep | null {
  const step = r.script.steps[r.stepIndex];
  return step && isActive(step, r.round) ? step : null;
}

export function isDone(r: RunnerState): boolean {
  return r.stepIndex >= r.script.steps.length;
}

const advance = (r: RunnerState): RunnerState => ({ ...r, stepIndex: r.stepIndex + 1 });

function forRequirement(req: Requirement, state: MatchState): AllowSet {
  if (req === 'confirm') return { ...NOTHING_ALLOWED, confirm: true };
  if ('card' in req) {
    const cards = state.sides.A.hand.flatMap((id, i) => (id === req.card ? [i] : []));
    return { ...NOTHING_ALLOWED, cards, targets: req.target ? [req.target] : 'any' };
  }
  if (req.action === 'swap') {
    return { ...NOTHING_ALLOWED, slots: [req.slot], actions: ['swap'], reserve: [req.reserveIndex] };
  }
  return { ...NOTHING_ALLOWED, slots: [req.slot], actions: [req.action], targets: req.target ? [req.target] : 'any' };
}

/** Что разрешено при планировании; `state` — состояние матча (нужна рука для карт). */
export function allowed(r: RunnerState, state: MatchState): AllowSet {
  const step = current(r);
  if (!step) {
    return {
      slots: SLOTS, actions: ALL_ACTIONS, targets: 'any', reserve: 'any',
      cards: state.sides.A.hand.map((_, i) => i), confirm: true,
    };
  }
  return 'require' in step ? forRequirement(step.require, state) : NOTHING_ALLOWED;
}

const sameRef = (a: SlotRef | undefined, b: SlotRef): boolean => a !== undefined && a.side === b.side && a.slot === b.slot;

/** Выполнено ли требование черновиком (действие слота или карта из руки). */
export function matches(req: Requirement, draft: Draft, state: MatchState): boolean {
  if (req === 'confirm') return false;
  if ('card' in req) {
    const play = draft.card;
    if (!play || state.sides.A.hand[play.handIndex] !== req.card) return false;
    return !req.target || sameRef(play.target, req.target);
  }
  const action = draft.actions[req.slot];
  if (!action || action.type !== req.action) return false;
  if (req.action === 'swap') return action.type === 'swap' && action.reserveIndex === req.reserveIndex;
  if (!req.target) return true;
  return (action.type === 'basic' || action.type === 'skill' || action.type === 'ultimate') && sameRef(action.target, req.target);
}

/** Черновик изменился: каждое выполненное требование продвигает шаг. Без изменений — тот же объект. */
export function onDraftChange(r: RunnerState, draft: Draft, state: MatchState): RunnerState {
  let next = r;
  for (;;) {
    const step = current(next);
    if (!step || !('require' in step) || !matches(step.require, draft, state)) return next;
    next = advance(next);
  }
}

/** Ход подтверждён: продвигает только шаг `require: 'confirm'`. */
export function onConfirm(r: RunnerState): RunnerState {
  const step = current(r);
  return step && 'require' in step && step.require === 'confirm' ? advance(r) : r;
}

/** Проигрывание раунда закончилось: начинается планирование следующего. */
export function onPlaybackDone(r: RunnerState): RunnerState {
  return { ...r, round: r.round + 1 };
}

/** «Далее» на текстовом шаге. */
export function dismissSay(r: RunnerState): RunnerState {
  const step = current(r);
  return step && !('require' in step) ? advance(r) : r;
}
