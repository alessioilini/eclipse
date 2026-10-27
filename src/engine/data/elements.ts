import type { Element } from '../types';

// Spec §3.2. Key: `${attacker}>${target}`; every other pair is 1.
const ADVANTAGE: ReadonlySet<string> = new Set(['fire>wind', 'wind>water', 'water>fire']);
const DISADVANTAGE: ReadonlySet<string> = new Set(['wind>fire', 'water>wind', 'fire>water']);

export function elementMultiplier(attacker: Element, target: Element): number {
  const key = `${attacker}>${target}`;
  if (ADVANTAGE.has(key)) return 1.2;
  if (DISADVANTAGE.has(key)) return 0.85;
  if ((attacker === 'light' && target === 'dark') || (attacker === 'dark' && target === 'light')) return 1.15;
  return 1;
}
