import { HEROES } from '../engine';
import type { EngineEvent, HeroId, MatchState, Side, Slot, SlotRef } from '../engine';
import { fmt, ru } from '../i18n/ru';

export type KeyMoment = {
  rule: 'bloodMoonComeback' | 'topDamage' | 'shields' | 'ultKill' | 'rounds';
  text: string;
};

const TOP_DAMAGE_SHARE = 0.35;
const SHIELDS_MIN = 25;

const nameOf = (id: HeroId): string => HEROES[id].name;

/** Кто стоял в слоте: заполняется по ходу событий, запасной вариант — состояние в конце матча. */
type Occupants = Record<Side, Partial<Record<Slot, HeroId>>>;

function trackOccupants(ev: EngineEvent, occ: Occupants): void {
  switch (ev.type) {
    case 'damage':
      occ[ev.attacker.side][ev.attacker.slot] = ev.attackerId;
      occ[ev.target.side][ev.target.slot] = ev.targetId;
      break;
    case 'heroAction':
      occ[ev.side][ev.slot] = ev.heroId;
      break;
    case 'swap':
      occ[ev.side][ev.slot] = ev.in;
      break;
    case 'autoFill':
      occ[ev.side][ev.slot] = ev.in;
      break;
    case 'revive':
      if (ev.slot !== undefined) occ[ev.side][ev.slot] = ev.heroId;
      break;
    case 'death':
      occ[ev.side][ev.slot] = ev.heroId;
      break;
    default:
  }
}

/**
 * Ключевой момент матча для стороны `side`: первое подходящее правило из пяти (спека §7).
 * Ожоги не имеют атакующего, поэтому в доле урона не участвуют.
 */
export function keyMoment(events: EngineEvent[], final: MatchState, side: Side): KeyMoment {
  const won = final.result?.winner === side;

  // 1. Кровавая Луна у стороны и её победа.
  const moon = events.find((e) => e.type === 'bloodMoon' && e.side === side);
  if (moon && moon.type === 'bloodMoon' && won) {
    return {
      rule: 'bloodMoonComeback',
      text: fmt(ru.keyMoment.bloodMoonComeback, { name: nameOf(moon.heroId) }),
    };
  }

  // Один проход: урон героинь, поглощённое щитами, ульта-убийство.
  const occ: Occupants = { A: {}, B: {} };
  const dealt = new Map<HeroId, number>();
  const absorbed = new Map<HeroId, number>();
  let lastUlt: HeroId | null = null;
  let ultKiller: HeroId | null = null;

  const heroAt = (ref: SlotRef): HeroId | undefined =>
    occ[ref.side][ref.slot] ?? final.sides[ref.side].active[ref.slot]?.id;
  const addDealt = (ref: SlotRef, amount: number): void => {
    if (ref.side !== side) return;
    const id = heroAt(ref);
    if (id) dealt.set(id, (dealt.get(id) ?? 0) + amount);
  };

  for (const ev of events) {
    trackOccupants(ev, occ);
    switch (ev.type) {
      case 'damage':
        addDealt(ev.attacker, ev.hpLoss);
        if (ev.target.side === side && ev.absorbed > 0) {
          absorbed.set(ev.targetId, (absorbed.get(ev.targetId) ?? 0) + ev.absorbed);
        }
        break;
      case 'detonate':
        addDealt(ev.source, ev.dmg);
        break;
      case 'reflect':
        addDealt(ev.from, ev.dmg);
        break;
      case 'directDamage':
        if ('slot' in ev.source) addDealt(ev.source, ev.dmg);
        break;
      case 'heroAction':
        lastUlt = ev.side === side && ev.action === 'ultimate' ? ev.heroId : null;
        break;
      case 'death':
        if (ev.side !== side && lastUlt && !ultKiller) ultKiller = lastUlt;
        break;
      default:
    }
  }

  // 2. Героиня нанесла не менее 35% урона команды.
  const total = [...dealt.values()].reduce((a, b) => a + b, 0);
  if (total > 0) {
    const [topId, topDmg] = [...dealt.entries()].reduce((best, cur) => (cur[1] > best[1] ? cur : best));
    const share = topDmg / total;
    if (share >= TOP_DAMAGE_SHARE) {
      return { rule: 'topDamage', text: fmt(ru.keyMoment.topDamage, { name: nameOf(topId), n: Math.round(share * 100) }) };
    }
  }

  // 3. Щиты стороны поглотили не менее 25 урона; имя — героиня, чьи щиты поглотили больше всех.
  const absorbedTotal = [...absorbed.values()].reduce((a, b) => a + b, 0);
  if (absorbedTotal >= SHIELDS_MIN) {
    const [guardId] = [...absorbed.entries()].reduce((best, cur) => (cur[1] > best[1] ? cur : best));
    return { rule: 'shields', text: fmt(ru.keyMoment.shields, { name: nameOf(guardId), n: absorbedTotal }) };
  }

  // 4. Ульта убила героиню противника.
  if (ultKiller) return { rule: 'ultKill', text: fmt(ru.keyMoment.ultKill, { name: nameOf(ultKiller) }) };

  // 5. Иначе — число раундов.
  return { rule: 'rounds', text: fmt(ru.keyMoment.rounds, { n: final.round }) };
}
