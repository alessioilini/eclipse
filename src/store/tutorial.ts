import { useMemo } from 'react';
import type { AllowSet } from '../game/tutorial/runner';
import type { HiddenElement } from '../game/tutorial/types';
import { useStore } from './index';
import { selectAllowed } from './match';

const NONE_HIDDEN: HiddenElement[] = [];

/** Что разрешает текущий шаг обучения; null — свободный матч. */
export function useAllowed(): AllowSet | null {
  const tutorial = useStore((s) => s.tutorial);
  const session = useStore((s) => s.session);
  return useMemo(() => selectAllowed({ tutorial, session }), [tutorial, session]);
}

/** Элементы интерфейса, скрытые сценарием обучения (пусто вне обучения). */
export function useHidden(): HiddenElement[] {
  return useStore((s) => s.tutorial?.script.hidden ?? NONE_HIDDEN);
}
