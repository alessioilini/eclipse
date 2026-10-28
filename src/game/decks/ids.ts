/**
 * Идентификатор новой колоды. `crypto.randomUUID` есть только в защищённом контексте (https, localhost),
 * поэтому по обычному http берём запасной вариант: время в base36 и 8 случайных символов base36.
 */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  let tail = '';
  while (tail.length < 8) tail += Math.floor(Math.random() * 36).toString(36);
  return `${Date.now().toString(36)}-${tail}`;
}
