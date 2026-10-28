import { CARDS } from './data/cards';
import { HEROES } from './data/heroes';
import type { EngineEvent } from './events';
import type { CardId, HeroId, MatchState, Side, Slot } from './types';

/** Heroine names learnt from the events seen so far, keyed by `${side}${slot}`. */
export type NameMap = Map<string, string>;

type Ref = { side: Side; slot?: number; reserveIndex?: number };

/** `A1` for an active slot, `A:r1` for a reserve heroine. */
function refText(r: Ref): string {
  if (typeof r.slot === 'number') return `${r.side}${r.slot}`;
  if (typeof r.reserveIndex === 'number') return `${r.side}:r${r.reserveIndex}`;
  return r.side;
}

const heroName = (id: HeroId): string => HEROES[id].name;
const cardName = (id: CardId): string => CARDS[id].name;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const signed = (n: number): string => (n < 0 ? `${n}` : `+${n}`);

/** Name(ref) when the heroine is known from earlier events, otherwise just the ref. */
function who(r: Ref, names: NameMap): string {
  const ref = refText(r);
  const name = names.get(ref);
  return name ? `${name}(${ref})` : ref;
}

/** The heroine an event places in an active slot (who acted, entered, died, came back there), if any. */
function seatOf(ev: EngineEvent): { side: Side; slot: Slot; heroId: HeroId } | null {
  switch (ev.type) {
    case 'swap':
    case 'autoFill':
      return { side: ev.side, slot: ev.slot, heroId: ev.in };
    case 'heroAction':
    case 'death':
      return { side: ev.side, slot: ev.slot, heroId: ev.heroId };
    case 'fizzle':
      return ev.action === 'card' ? null : { side: ev.side, slot: ev.slot, heroId: ev.heroId };
    case 'revive':
      return ev.slot !== undefined ? { side: ev.side, slot: ev.slot, heroId: ev.heroId } : null;
    default:
      return null;
  }
}

function learn(ev: EngineEvent, names: NameMap): void {
  if (ev.type === 'bloodMoon') {
    for (const h of ev.heroes) if (h.slot !== null) names.set(`${ev.side}${h.slot}`, heroName(h.heroId));
    return;
  }
  const seat = seatOf(ev);
  if (seat) names.set(`${seat.side}${seat.slot}`, heroName(seat.heroId));
}

/** Everything but the bookkeeping fields, for the fallback line. */
function payloadOf(ev: EngineEvent): string {
  const { round: _r, phase: _p, type: _t, ...rest } = ev;
  return JSON.stringify(rest);
}

function line(ev: EngineEvent, names: NameMap): string {
  switch (ev.type) {
    case 'heroAction': {
      const name = heroName(ev.heroId);
      if (ev.action === 'skipped') return `${ev.side} ${name} skipped (${ev.reason})`;
      return `${ev.side} ${name}.${cap(ev.action)}${ev.target ? ` → ${refText(ev.target)}` : ''}`;
    }
    case 'damage':
      return `${who(ev.attacker, names)} → ${who(ev.target, names)} Damage ${ev.dmg}`
        + ` (shield -${ev.absorbed}, HP -${ev.hpLoss}) HP ${ev.hp}`;
    case 'shield':
      return `${ev.target ? refText(ev.target) : refText({ side: ev.side, reserveIndex: ev.reserveIndex })} Shield +${ev.amount}`;
    case 'statusApplied':
      return `${refText(ev.target)} ${cap(ev.status)}`;
    case 'heal':
      return `${refText(ev.target)} Heal +${ev.healed}`;
    case 'death':
      return `${heroName(ev.heroId)} dies`;
    case 'cardPlayed':
      return `${ev.side} plays ${cardName(ev.cardId)}${ev.replay ? ' (replay)' : ''}`;
    case 'fizzle':
      // A heroine's skill/ultimate (heroId) or a card (cardId, action 'card').
      return ev.action === 'card'
        ? `${ev.side} ${cardName(ev.cardId)} fizzles (${ev.reason})`
        : `${ev.side} ${heroName(ev.heroId)}.${cap(ev.action)} fizzles (${ev.reason})`;
    case 'reactionArmed':
      return `${ev.side} arms ${cardName(ev.cardId)}${ev.target ? ` → ${refText(ev.target)}` : ''}`;
    case 'reactionTriggered':
      return `${ev.side} ${cardName(ev.cardId)} triggers → ${refText(ev.target)}`;
    case 'moonChanged':
      return `Moon ${ev.from} → ${ev.to}`;
    case 'lunaChanged':
      return `${ev.side} Luna ${ev.luna} (${signed(ev.delta)} ${ev.reason})`;
    case 'matchEnd':
      return `Winner ${ev.winner} (${ev.reason})`;
    case 'bloodMoon':
      return `${ev.side} Blood Moon: ` + ev.heroes.map(h => {
        const ref = h.slot !== null ? { side: ev.side, slot: h.slot } : { side: ev.side, reserveIndex: h.reserveIndex };
        return `${heroName(h.heroId)}(${refText(ref)})` + (h.cleansed ? ` −${h.cleansed.join(',')}` : '');
      }).join(', ');
    default:
      return `${ev.type} ${payloadOf(ev)}`;
  }
}

/**
 * One line (no indent) for one event. `names` (optional) maps `${side}${slot}` to a heroine name;
 * formatLog fills it from the events it has seen. `state` is not used for names: after swaps the final
 * state says nothing about who stood where earlier.
 */
export function formatEvent(ev: EngineEvent, _state: MatchState, names: NameMap = new Map()): string {
  learn(ev, names);
  return line(ev, names);
}

/** Text log in the style of GDD §77: `R{n} Moon={phase}` per round, then one indented line per event. */
export function formatLog(events: EngineEvent[], state: MatchState): string {
  const moonOf = new Map<number, string>();
  for (const ev of events) if (ev.type === 'roundStart') moonOf.set(ev.round, ev.moon);

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
