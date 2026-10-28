import type { StateCreator } from 'zustand';
import type { HeroId } from '../engine';
import { defaultSave } from '../game/save/defaults';
import type { StoreState } from './index';

export type TutorialStep = 0 | 1 | 2 | 3;
export type Stats = { wins: number; losses: number; draws: number };

export type ProfileSlice = {
  unlocked: HeroId[];
  tutorialStep: TutorialStep;
  stats: Stats;
  unlock(ids: HeroId[]): void;
  completeTutorial(step: 1 | 2 | 3): void;
  recordResult(r: 'win' | 'loss' | 'draw'): void;
};

const STAT_KEY = { win: 'wins', loss: 'losses', draw: 'draws' } as const;

export const createProfileSlice: StateCreator<StoreState, [], [], ProfileSlice> = (set, get) => {
  const { profile } = defaultSave();
  return {
    unlocked: profile.unlocked,
    tutorialStep: profile.tutorialStep,
    stats: profile.stats,
    unlock(ids) {
      const current = get().unlocked;
      const added = ids.filter((id, i) => !current.includes(id) && ids.indexOf(id) === i);
      if (added.length > 0) set({ unlocked: [...current, ...added] });
    },
    completeTutorial(step) {
      if (step > get().tutorialStep) set({ tutorialStep: step });
    },
    recordResult(r) {
      const key = STAT_KEY[r];
      const stats = get().stats;
      set({ stats: { ...stats, [key]: stats[key] + 1 } });
    },
  };
};
