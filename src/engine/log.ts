import { CARDS } from './data/cards';
import { HEROES } from './data/heroes';
import type { GameEvent, HeroId, MatchState } from './types';

/** Heroine names learnt from the events seen so far, keyed by `${side}${slot}`. */
export type NameMap = Map<string, string>;

type Ref = { side: string; slot?: number; reserveIndex?: number };

const isRef = (v: unknown): v is Ref =>
  typeof v === 'object' && v !== null && typeof (v as Ref).side === 'string';

/** `A1` for an active slot, `A:r1` for a reserve heroine. */
function refText(r: Ref): string {
  if (typeof r.slot === 'number') return `${r.side}${r.slot}`;
  if (typeof r.reserveIndex === 'number') return `${r.side}:r${r.reserveIndex}`;
  return r.side;
}

const heroName = (id: unknown): string => (typeof id === 'string' && id in HEROES ? HEROES[id as HeroId].name : String(id));
const cardName = (id: unknown): string => (typeof id === 'string' && id in CARDS ? CARDS[id as keyof typeof CARDS].name : String(id));
const cap = (s: unknown): string => { const t = String(s); return t.charAt(0).toUpperCase() + t.slice(1); };
const signed = (n: unknown): string => (typeof n === 'number' && n < 0 ? `${n}` : `+${n}`);

/** Name(ref) when the heroine is known from earlier events, otherwise just the ref. */
function who(v: unknown, names: NameMap): string {
  if (!isRef(v)) return String(v);
  const ref = refText(v);
  const name = names.get(ref);
  return name ? `${name}(${ref})` : ref;
}

function learn(ev: GameEvent, names: NameMap): void {
  const side = ev['side'];
  const slot = ev['slot'];
  if (typeof side !== 'string' || typeof slot !== 'number') return;
  const id = ev.type === 'swap' || ev.type === 'autoFill' ? ev['in'] : ev['heroId'];
  if (typeof id === 'string') names.set(`${side}${slot}`, heroName(id));
}

/** Everything but the bookkeeping fields, for the fallback line. */
function payloadOf(ev: GameEvent): string {
  const { round: _r, phase: _p, type: _t, ...rest } = ev;
  return JSON.stringify(rest);
}

function line(ev: GameEvent, names: NameMap): string {
  const side = String(ev['side']);
  switch (ev.type) {
    case 'heroAction': {
      const name = heroName(ev['heroId']);
      if (ev['action'] === 'skipped') return `${side} ${name} skipped (${ev['reason']})`;
      const target = ev['target'];
      return `${side} ${name}.${cap(ev['action'])}${isRef(target) ? ` → ${refText(target)}` : ''}`;
    }
    case 'damage':
      return `${who(ev['attacker'], names)} → ${who(ev['target'], names)} Damage ${ev['dmg']}`
        + ` (shield -${ev['absorbed']}, HP -${ev['hpLoss']}) HP ${ev['hp']}`;
    case 'shield':
      return `${isRef(ev['target']) ? refText(ev['target']) : refText(ev as unknown as Ref)} Shield +${ev['amount']}`;
    case 'statusApplied':
      return `${isRef(ev['target']) ? refText(ev['target']) : '?'} ${cap(ev['status'])}`;
    case 'heal':
      return `${isRef(ev['target']) ? refText(ev['target']) : '?'} Heal +${ev['healed']}`;
    case 'death':
      return `${heroName(ev['heroId'])} dies`;
    case 'cardPlayed':
      return `${side} plays ${cardName(ev['cardId'])}${ev['replay'] ? ' (replay)' : ''}`;
    case 'moonChanged':
      return `Moon ${ev['from']} → ${ev['to']}`;
    case 'lunaChanged':
      return `${side} Luna ${ev['luna']} (${signed(ev['delta'])} ${ev['reason']})`;
    case 'matchEnd':
      return `Winner ${ev['winner']} (${ev['reason']})`;
    default:
      return `${ev.type} ${payloadOf(ev)}`;
  }
}

/**
 * One line (no indent) for one event. `names` (optional) maps `${side}${slot}` to a heroine name;
 * formatLog fills it from the events it has seen. `state` is not used for names: after swaps the final
 * state says nothing about who stood where earlier.
 */
export function formatEvent(ev: GameEvent, _state: MatchState, names: NameMap = new Map()): string {
  learn(ev, names);
  return line(ev, names);
}

/** Text log in the style of GDD §77: `R{n} Moon={phase}` per round, then one indented line per event. */
export function formatLog(events: GameEvent[], state: MatchState): string {
  const moonOf = new Map<number, string>();
  for (const ev of events) if (ev.type === 'roundStart') moonOf.set(ev.round, String(ev['moon']));

  const names: NameMap = new Map();
  const out: string[] = [];
  let round: number | null = null;
  for (const ev of events) {
    if (ev.round !== round) {
      round = ev.round;
      out.push(`R${round} Moon=${moonOf.get(round) ?? '?'}`);
    }
    out.push(`  ${formatEvent(ev, state, names)}`);
  }
  return out.join('\n');
}
