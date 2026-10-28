import type { StateCreator } from 'zustand';
import type { Deck } from '../engine';
import { defaultSave } from '../game/save/defaults';
import type { StoreState } from './index';

export type SavedDeck = { id: string; name: string; deck: Deck };

export type DecksSlice = {
  decks: SavedDeck[];
  activeDeckId: string | null;
  upsertDeck(d: SavedDeck): void;
  deleteDeck(id: string): void;
  setActiveDeck(id: string | null): void;
};

export const createDecksSlice: StateCreator<StoreState, [], [], DecksSlice> = (set, get) => {
  const save = defaultSave();
  return {
    decks: save.decks,
    activeDeckId: save.activeDeckId,
    upsertDeck(d) {
      const decks = get().decks;
      const i = decks.findIndex(x => x.id === d.id);
      set({ decks: i === -1 ? [...decks, d] : decks.map((x, j) => (j === i ? d : x)) });
    },
    deleteDeck(id) {
      const { decks, activeDeckId } = get();
      set({ decks: decks.filter(x => x.id !== id), activeDeckId: activeDeckId === id ? null : activeDeckId });
    },
    setActiveDeck(id) {
      set({ activeDeckId: id });
    },
  };
};
