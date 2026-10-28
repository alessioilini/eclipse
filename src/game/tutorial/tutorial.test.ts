import { describe, expect, it } from 'vitest';
import { legalActions, legalCardPlays, validateDeck, viewFor } from '../../engine';
import type { HeroAction, MatchState, Slot, SlotRef } from '../../engine';
import { confirmRound, draftForEngine, draftToCommands, emptyDraft, isFinished, newMatch } from '../session';
import type { Draft, MatchSession } from '../session';
import {
  allowed, createRunner, current, dismissSay, isDone, NOTHING_ALLOWED, onConfirm, onDraftChange, onPlaybackDone,
} from './runner';
import type { RunnerState } from './runner';
import { SCRIPTS } from './scripts';
import type { Requirement, TutorialScript } from './types';

const SLOTS: Slot[] = [0, 1, 2];

function start(script: TutorialScript): MatchSession {
  return newMatch(script.decks.A, {
    opponentDeck: script.decks.B, seed: script.seed, mode: 'tutorial', tutorialId: script.id,
    enemy: script.enemy, ...(script.enemyHp ? { opponentHp: script.enemyHp } : {}),
  });
}

/** Живая противница с наименьшим HP. */
function weakestEnemy(state: MatchState): SlotRef {
  let best: SlotRef | null = null;
  for (const slot of SLOTS) {
    const h = state.sides.B.active[slot];
    if (h.hp > 0 && (best === null || h.hp < state.sides.B.active[best.slot].hp)) best = { side: 'B', slot };
  }
  return best!;
}

const hasRef = (list: SlotRef[] | 'auto', ref: SlotRef) =>
  list !== 'auto' && list.some(r => r.side === ref.side && r.slot === ref.slot);

/** Черновик с выполненным требованием; заодно проверяет, что интерфейс разрешает и движок допускает это действие. */
function satisfy(req: Exclude<Requirement, 'confirm'>, draft: Draft, state: MatchState, r: RunnerState): Draft {
  const allow = allowed(r, state);
  const view = viewFor(state, 'A');
  if ('card' in req) {
    const handIndex = state.sides.A.hand.indexOf(req.card);
    expect(handIndex).toBeGreaterThanOrEqual(0);
    expect(allow.cards).toContain(handIndex);
    const play = legalCardPlays(view, 'A', handIndex, draftForEngine(draft));
    expect(play.blocked).toBeUndefined();
    if (req.target) expect(hasRef(play.targets, req.target)).toBe(true);
    return { ...draft, card: { handIndex, ...(req.target ? { target: req.target } : {}) } };
  }
  expect(allow.slots).toEqual([req.slot]);
  expect(allow.actions).toEqual([req.action]);
  const la = legalActions(view, 'A', req.slot, draftForEngine(draft));
  let action: HeroAction;
  if (req.action === 'swap') {
    expect(la.swapBlocked).toBeUndefined();
    expect(la.swap).toContain(req.reserveIndex);
    expect(allow.reserve).toEqual([req.reserveIndex]);
    action = { type: 'swap', reserveIndex: req.reserveIndex };
  } else if (req.action === 'basic') {
    const target = req.target ?? weakestEnemy(state);
    expect(hasRef(la.basic, target)).toBe(true);
    action = { type: 'basic', target };
  } else {
    const opt = la[req.action];
    expect(opt.blocked).toBeUndefined();
    if (opt.targets === 'auto') action = { type: req.action };
    else {
      const target = req.target ?? opt.targets[0]!;
      expect(hasRef(opt.targets, target)).toBe(true);
      action = { type: req.action, target };
    }
  }
  const actions = [...draft.actions] as Draft['actions'];
  actions[req.slot] = action;
  return { ...draft, actions };
}

/** Свободная игра: пустые слоты живых героинь бьют противницу с наименьшим HP. */
function fillRest(draft: Draft, state: MatchState): Draft {
  const target = weakestEnemy(state);
  return { ...draft, actions: draft.actions.map(a => a ?? { type: 'basic', target }) as Draft['actions'] };
}

/** Программное прохождение: шаги сценария по порядку, затем свободная игра до конца матча. */
function play(script: TutorialScript) {
  let s = start(script);
  let r = createRunner(script);
  let draft = emptyDraft(s.state);
  let playerDeaths = 0;
  for (let guard = 0; guard < 200 && !isFinished(s); guard++) {
    const step = current(r);
    if (step && !('require' in step)) {
      expect(allowed(r, s.state)).toEqual(NOTHING_ALLOWED);
      r = dismissSay(r);
      continue;
    }
    if (step && 'require' in step && step.require !== 'confirm') {
      const req = step.require;
      if ('card' in req && step.anchor.kind === 'card') {
        expect(s.state.sides.A.hand[step.anchor.handIndex]).toBe(req.card);
      }
      const before = r.stepIndex;
      draft = satisfy(req, draft, s.state, r);
      r = onDraftChange(r, draft, s.state);
      expect(r.stepIndex).toBe(before + 1);
      continue;
    }
    if (step) {
      // require: 'confirm' — черновик уже собран шагами сценария, разрешено только «Подтвердить».
      expect(allowed(r, s.state)).toEqual({ ...NOTHING_ALLOWED, confirm: true });
      expect(draftToCommands(draft)).not.toBeNull();
    } else {
      expect(allowed(r, s.state).confirm).toBe(true);
      draft = fillRest(draft, s.state);
    }
    s = confirmRound(s, draft).session;
    r = onPlaybackDone(onConfirm(r));
    playerDeaths = s.state.deaths.filter(d => d.side === 'A').length;
    if (!isFinished(s)) draft = emptyDraft(s.state);
  }
  return { s, r, playerDeaths };
}

describe('сценарии обучения', () => {
  it.each([1, 2, 3] as const)('бой %i: колоды легальны', (id) => {
    const script = SCRIPTS[id];
    expect(script.id).toBe(id);
    expect(validateDeck(script.decks.A)).toEqual([]);
    expect(validateDeck(script.decks.B)).toEqual([]);
  });

  it.each([1, 2, 3] as const)('бой %i проходится по требованиям до победы A не позже 6-го раунда', (id) => {
    const { s, r, playerDeaths } = play(SCRIPTS[id]);
    expect(s.state.result?.winner).toBe('A');
    expect(s.state.round).toBeLessThanOrEqual(6);
    expect(isDone(r)).toBe(true);
    // Резерв скрыт в боях 1–2: активные героини игрока не должны погибать (автозамены нет).
    expect(playerDeaths).toBe(0);
  });

  it('противник детерминирован: два прогона дают одно и то же', () => {
    const a = play(SCRIPTS[1]).s.state;
    const b = play(SCRIPTS[1]).s.state;
    expect(a).toEqual(b);
  });
});

describe('исполнитель сценария', () => {
  const script = SCRIPTS[1];

  it('на текстовом шаге ничего не разрешено, «Далее» продвигает шаг', () => {
    const s = start(script);
    const r = createRunner(script);
    expect(current(r)).toEqual(script.steps[0]);
    expect(allowed(r, s.state)).toEqual(NOTHING_ALLOWED);
    expect(dismissSay(r).stepIndex).toBe(1);
  });

  it('неправильное действие не продвигает шаг', () => {
    const s = start(script);
    const r = dismissSay(createRunner(script));
    expect(r.stepIndex).toBe(1);
    const wrong: HeroAction[] = [
      { type: 'basic', target: { side: 'B', slot: 1 } },
      { type: 'skill' },
    ];
    for (const action of wrong) {
      const draft = emptyDraft(s.state);
      draft.actions[0] = action;
      expect(onDraftChange(r, draft, s.state)).toBe(r);
    }
    // Нужное действие не в том слоте тоже не считается.
    const other = emptyDraft(s.state);
    other.actions[1] = { type: 'basic', target: { side: 'B', slot: 0 } };
    expect(onDraftChange(r, other, s.state)).toBe(r);
    const right = emptyDraft(s.state);
    right.actions[0] = { type: 'basic', target: { side: 'B', slot: 0 } };
    expect(onDraftChange(r, right, s.state).stepIndex).toBe(2);
  });

  it('шаг require разрешает ровно требуемое', () => {
    const s = start(script);
    const r = dismissSay(createRunner(script));
    expect(allowed(r, s.state)).toEqual({
      ...NOTHING_ALLOWED, slots: [0], actions: ['basic'], targets: [{ side: 'B', slot: 0 }],
    });
  });

  it('onConfirm продвигает только шаг «Подтвердить», «Далее» не закрывает require', () => {
    const r = { ...createRunner(script), stepIndex: 1 };
    expect(onConfirm(r)).toBe(r);
    expect(dismissSay(r)).toBe(r);
    const atConfirm = { ...createRunner(script), stepIndex: 5 };
    expect(onConfirm(atConfirm).stepIndex).toBe(6);
  });

  it('текст после проигрывания появляется только после проигрывания раунда', () => {
    const s = start(script);
    const r = { ...createRunner(script), stepIndex: 6 };
    expect(current(r)).toBeNull();
    expect(allowed(r, s.state).confirm).toBe(true);
    const after = onPlaybackDone(r);
    expect(current(after)).toEqual(script.steps[6]);
    expect(isDone(dismissSay(after))).toBe(true);
  });

  it('после последнего шага разрешено всё', () => {
    const s = start(script);
    const r = { ...createRunner(script), stepIndex: script.steps.length, round: 2 };
    expect(current(r)).toBeNull();
    expect(allowed(r, s.state)).toEqual({
      slots: [0, 1, 2], actions: ['basic', 'skill', 'ultimate', 'swap'], targets: 'any', reserve: 'any',
      cards: s.state.sides.A.hand.map((_, i) => i), confirm: true,
    });
  });
});
