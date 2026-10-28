import { useSyncExternalStore } from 'react';
import type { HeroId } from './engine/types';

export type Route =
  | { name: 'menu' }
  | { name: 'tutorial'; id: 1 | 2 | 3 }
  | { name: 'battle' }
  | { name: 'result' }
  | { name: 'heroes' }
  | { name: 'hero'; id: HeroId }
  | { name: 'decks' }
  | { name: 'deck'; id: string };

const MENU: Route = { name: 'menu' };

/** Decodes a path segment; a malformed escape (`%`, `%E0%A4%A`) falls back to the menu. */
function withId(raw: string, make: (id: string) => Route): Route {
  try {
    return make(decodeURIComponent(raw));
  } catch {
    return MENU;
  }
}

/** Parses `location.hash` into a route; anything unknown falls back to the menu. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const parts = path === '' ? [] : path.split('/');
  const [head, arg, ...rest] = parts;
  if (rest.length > 0) return MENU;
  switch (head) {
    case undefined:
      return MENU;
    case 'tutorial': {
      if (arg === '1' || arg === '2' || arg === '3') {
        return { name: 'tutorial', id: Number(arg) as 1 | 2 | 3 };
      }
      return MENU;
    }
    case 'battle':
      return arg === undefined ? { name: 'battle' } : MENU;
    case 'result':
      return arg === undefined ? { name: 'result' } : MENU;
    case 'heroes':
      if (arg === undefined) return { name: 'heroes' };
      // The id is not checked against the roster here: the screen shows a stub for unknown heroes.
      return arg === '' ? MENU : withId(arg, (id) => ({ name: 'hero', id: id as HeroId }));
    case 'decks':
      if (arg === undefined) return { name: 'decks' };
      return arg === '' ? MENU : withId(arg, (id) => ({ name: 'deck', id }));
    default:
      return MENU;
  }
}

export function toHash(route: Route): string {
  switch (route.name) {
    case 'menu':
      return '#/';
    case 'tutorial':
      return `#/tutorial/${route.id}`;
    case 'battle':
      return '#/battle';
    case 'result':
      return '#/result';
    case 'heroes':
      return '#/heroes';
    case 'hero':
      return `#/heroes/${encodeURIComponent(route.id)}`;
    case 'decks':
      return '#/decks';
    case 'deck':
      return `#/decks/${encodeURIComponent(route.id)}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = toHash(route);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = (): string => window.location.hash;

/** Current route; re-renders on `hashchange`. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash);
  return parseHash(hash);
}
