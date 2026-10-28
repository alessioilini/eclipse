import type { StateCreator } from 'zustand';
import { defaultSave } from '../game/save/defaults';
import type { StoreState } from './index';

export type Speed = 'normal' | 'fast';

export type SettingsSlice = {
  speed: Speed;
  sound: boolean;
  setSpeed(speed: Speed): void;
  setSound(sound: boolean): void;
};

export const createSettingsSlice: StateCreator<StoreState, [], [], SettingsSlice> = (set) => {
  const { settings } = defaultSave();
  return {
    speed: settings.speed,
    sound: settings.sound,
    setSpeed(speed) { set({ speed }); },
    setSound(sound) { set({ sound }); },
  };
};
