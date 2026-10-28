import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from '../store';

/**
 * Регистрирует обработчик «Назад» экрана в store (его показывает кнопка платформы, спека §3): на mount —
 * обёртка, вызывающая всегда актуальный `fn`; на unmount снимает её, если её не заменил другой экран.
 */
export function useAppBack(fn: () => void): void {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    const handler = () => latest.current();
    const { setBackHandler } = useStore.getState();
    setBackHandler(handler);
    return () => {
      if (useStore.getState().backHandler === handler) setBackHandler(null);
    };
  }, []);
}
