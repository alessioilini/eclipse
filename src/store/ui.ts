import type { StateCreator } from 'zustand';
import type { Slot, SlotRef } from '../engine';
import type { StoreState } from './index';

export type Sheet =
  | { kind: 'actions'; slot: Slot }
  | { kind: 'targets'; slot: Slot; action: 'basic' | 'skill' | 'ultimate' }
  | { kind: 'reserve'; slot: Slot }
  | { kind: 'card'; handIndex: number; step: 'target' | 'secondary'; target?: SlotRef }
  | { kind: 'log' }
  /** Карточка героини (только чтение), открывается долгим нажатием. */
  | { kind: 'hero'; ref: SlotRef };

/** Разовое уведомление для следующего экрана (текст берётся из ru по ключу). */
export type Notice = 'needDeck';

export type UiSlice = {
  selectedSlot: Slot | null;
  notice: Notice | null;
  setNotice(notice: Notice | null): void;
  sheet: Sheet | null;
  /** Открывает лист; лист со слотом заодно выбирает этот слот. */
  openSheet(sheet: Sheet): void;
  closeSheet(): void;
};

export const createUiSlice: StateCreator<StoreState, [], [], UiSlice> = (set) => ({
  selectedSlot: null,
  notice: null,
  setNotice(notice) { set({ notice }); },
  sheet: null,
  openSheet(sheet) {
    set('slot' in sheet ? { sheet, selectedSlot: sheet.slot } : { sheet });
  },
  closeSheet() { set({ sheet: null }); },
});
