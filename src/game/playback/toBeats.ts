import type { EngineEvent } from '../../engine';
import { BEAT_MS } from './timings';

export type BeatKind = keyof typeof BEAT_MS | 'tick';
/** A group of consecutive events played as one animation step (UI spec §4.2). */
export type Beat = { kind: BeatKind; events: EngineEvent[]; durationMs: number };

/** Upper bound of a grouped beat (card, action, …) however many consequences it has. */
export const MAX_BEAT_MS = 1500;

type Type = EngineEvent['type'];

/** Animated weight of a consequence inside a group, or of a standalone event. */
const WEIGHT: Partial<Record<Type, keyof typeof BEAT_MS>> = {
  damage: 'hit', burn: 'hit', directDamage: 'hit', detonate: 'hit', reflect: 'hit', selfHp: 'hit',
  heal: 'heal', shield: 'heal',
  statusApplied: 'status', statusRemoved: 'status',
  death: 'death',
  swap: 'swap', autoFill: 'swap', revive: 'swap',
  moonChanged: 'moon',
  fizzle: 'fizzle',
  cardPlayed: 'card',
};

/**
 * Kind of an event that stands alone (outside any group, or in Round Start / End Round): one beat per
 * visible change; statuses, shields and counters update without animation there (`tick`, 0 ms).
 */
function standaloneKind(ev: EngineEvent): BeatKind {
  switch (ev.type) {
    case 'damage': case 'burn': case 'directDamage': case 'detonate': case 'reflect': case 'selfHp': return 'hit';
    case 'heal': case 'shield': return ev.phase === 'endRound' || ev.phase === 'roundStart' ? 'tick' : 'heal';
    case 'death': return 'death';
    case 'swap': case 'autoFill': case 'revive': return 'swap';
    case 'moonChanged': return 'moon';
    case 'bloodMoon': return 'bloodMoon';
    case 'fizzle': return 'fizzle';
    case 'matchEnd': return 'end';
    case 'reveal': return 'reveal';
    case 'cardPlayed': return 'card';
    case 'heroAction': return 'action';
    default: return 'tick';
  }
}

/** An event that opens a group (its consequences follow it): Reveal, a card, a heroine's action, a fizzle. */
function groupKind(ev: EngineEvent): 'reveal' | 'card' | 'action' | 'fizzle' | null {
  switch (ev.type) {
    case 'reveal': return 'reveal';
    case 'heroAction': return 'action';
    case 'cardPlayed': return ev.replay ? null : 'card';
    case 'fizzle': return ev.replay ? null : 'fizzle';
    default: return null;
  }
}

/**
 * Events the engine emits just before the action or card they belong to: the retarget of the planned
 * target and the price (Energy for a skill, an ultimate or a card; Luna for an ultimate).
 */
function isPrefix(ev: EngineEvent): boolean {
  switch (ev.type) {
    case 'retarget': return true;
    case 'energyChanged': return ev.reason === 'skill' || ev.reason === 'ultimate' || ev.reason === 'card';
    case 'lunaChanged': return ev.reason === 'ultimate';
    default: return false;
  }
}

/** Round Start and End Round have no actions: every event there is its own beat. */
const isLoosePhase = (ev: EngineEvent): boolean => ev.phase === 'endRound' || ev.phase === 'roundStart';
/** Events that always close the open group and stand alone. */
const isBreaker = (ev: EngineEvent): boolean => ev.type === 'bloodMoon' || ev.type === 'matchEnd';

function groupDuration(kind: 'reveal' | 'card' | 'action' | 'fizzle', events: EngineEvent[]): number {
  let ms = 0;
  let opened = false;
  for (const ev of events) {
    if (!opened && groupKind(ev) === kind) { ms += BEAT_MS[kind]; opened = true; continue; }
    const w = WEIGHT[ev.type];
    if (w) ms += BEAT_MS[w];
  }
  return Math.min(MAX_BEAT_MS, ms);
}

function standalone(ev: EngineEvent): Beat {
  const kind = standaloneKind(ev);
  return { kind, events: [ev], durationMs: kind === 'tick' ? 0 : BEAT_MS[kind] };
}

/**
 * Splits the (side-filtered) events of a round into beats (UI spec §4.2), keeping their order; every
 * event lands in exactly one beat. `reveal`, `cardPlayed`, `heroAction` and a non-replay `fizzle` open a
 * group that takes the following events until the next group opener, `bloodMoon`, `matchEnd` or the
 * Round Start / End Round phase; the price and retarget emitted just before an opener move into its group.
 * A group lasts its base time plus the time of each animated consequence, at most 1500 ms. Outside a group
 * every event is its own beat (`moonChanged` → `moon`, Burn → `hit`, …); unanimated ones are `tick` (0 ms).
 */
export function toBeats(events: EngineEvent[]): Beat[] {
  const beats: Beat[] = [];
  let group: { kind: 'reveal' | 'card' | 'action' | 'fizzle'; events: EngineEvent[] } | null = null;
  let pending: EngineEvent[] = [];

  const closeGroup = () => {
    if (group) beats.push({ kind: group.kind, events: group.events, durationMs: groupDuration(group.kind, group.events) });
    group = null;
  };
  const flushPending = () => {
    if (group) group.events.push(...pending);
    else beats.push(...pending.map(standalone));
    pending = [];
  };

  for (const ev of events) {
    if (isLoosePhase(ev) || isBreaker(ev)) {
      flushPending();
      closeGroup();
      beats.push(standalone(ev));
      continue;
    }
    const opens = groupKind(ev);
    if (opens) {
      closeGroup();
      group = { kind: opens, events: [...pending, ev] };
      pending = [];
      continue;
    }
    if (isPrefix(ev)) { pending.push(ev); continue; }
    flushPending();
    if (group) group.events.push(ev);
    else beats.push(standalone(ev));
  }
  flushPending();
  closeGroup();
  return beats;
}
