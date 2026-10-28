import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStore } from '../store';

/**
 * Обработчики смонтированных владельцев в порядке регистрации. Модальное окно поверх экрана (диалог имени)
 * регистрирует свой обработчик сверху; при его закрытии кнопка снова ведёт к обработчику экрана.
 */
const stack: (() => void)[] = [];

/**
 * Регистрирует обработчик «Назад» экрана или модального окна в store (его показывает кнопка платформы,
 * спека §3): на mount — обёртка, вызывающая всегда актуальный `fn`; на unmount снимает её и, если она была
 * текущей, возвращает обработчик того, кто зарегистрировался раньше и ещё смонтирован (или null).
 */
export function useAppBack(fn: () => void): void {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    const handler = () => latest.current();
    const { setBackHandler } = useStore.getState();
    stack.push(handler);
    setBackHandler(handler);
    return () => {
      stack.splice(stack.lastIndexOf(handler), 1);
      if (useStore.getState().backHandler === handler) setBackHandler(stack[stack.length - 1] ?? null);
    };
  }, []);
}
