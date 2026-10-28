import { runSimulation } from '../src/engine/sim';
import { CARDS } from '../src/engine/data/cards';
import { HEROES } from '../src/engine/data/heroes';
import type { CardId, HeroId } from '../src/engine/types';

/** Tiny argv parser: `--n 1000 --seed 1` (also `--n=1000`). */
function parseArgs(argv: string[]): { n: number; seed: number } {
  const out = { n: 1000, seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = (argv[i] ?? '').split('=');
    if (flag !== '--n' && flag !== '--seed') continue;
    const raw = inline ?? argv[++i];
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error(`bad value for ${flag}: ${raw}`);
    if (flag === '--n') out.n = value; else out.seed = value;
  }
  return out;
}

const pct = (x: number): string => (x * 100).toFixed(1);
const pad = (s: string | number, w: number): string => String(s).padEnd(w);
const padL = (s: string | number, w: number): string => String(s).padStart(w);
const f1 = (x: number): string => x.toFixed(1);
const f2 = (x: number): string => x.toFixed(2);
const byRound = (arr: number[]): string => arr.map((v, r) => (r === 0 ? '' : `r${r}=${f1(v)}`)).filter(Boolean).join(' ');

const { n, seed } = parseArgs(process.argv.slice(2));
const started = Date.now();
const r = runSimulation(n, seed);

console.log(`Simulation: ${r.matches} matches, seed ${seed} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
console.log(`avgRounds: ${f2(r.avgRounds)}`);
console.log(`drawRate: ${pct(r.drawRate)}%`);
console.log(`roundLimitRate: ${pct(r.roundLimitRate)}%`);
console.log(`resultReasons: ${Object.entries(r.resultReasons).map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`bloodMoonRate: ${pct(r.bloodMoonRate)}%`);
console.log(`bloodMoonComebackRate: ${pct(r.bloodMoonComebackRate)}%`);
console.log(`roundHistogram: ${r.roundHistogram.map((c, i) => (i === 0 ? '' : `r${i}=${c}`)).filter(Boolean).join(' ')}`);
console.log(`hpLost per round (avg per match that played it): ${byRound(r.perRound.hpLost)}`);
console.log(`healed per round: ${byRound(r.perRound.healed)}`);
console.log(`shielded per round: ${byRound(r.perRound.shielded)}`);
const t = r.totals;
console.log(`per match: hpLost ${f1(t.hpLost)}, healed ${f1(t.healed)}, shielded ${f1(t.shielded)}, absorbed ${f1(t.absorbed)}, burn ${f1(t.burn)}, swaps ${f2(t.swaps)}, fizzles ${f2(t.fizzles)}`);
console.log(`fizzles per match by reason: ${Object.entries(r.fizzlesByReason).map(([k, v]) => `${k}=${f2(v)}`).join(' ') || 'none'}`);

console.log('\nHeroines (sorted by winRate; ! = outside 40-60%; damage per match: hits + direct + burn)');
console.log(`  ${pad('id', 10)}${pad('name', 10)}${padL('picks', 6)}${padL('win %', 7)}${padL('dmg', 6)}${padL('hits', 6)}${padL('direct', 7)}${padL('burn', 6)}${padL('swaps', 6)}${padL('fizz', 6)}${padL('ults', 6)}${padL('deaths', 7)}`);
const heroIds = (Object.keys(r.heroes) as HeroId[]).sort((a, b) => r.heroes[b].winRate - r.heroes[a].winRate);
for (const id of heroIds) {
  const h = r.heroes[id];
  const flag = h.winRate < 0.4 || h.winRate > 0.6 ? '!' : ' ';
  console.log(`${flag} ${pad(id, 10)}${pad(HEROES[id].name, 10)}${padL(h.picks, 6)}${padL(pct(h.winRate), 7)}${padL(f1(h.avgDamage), 6)}`
    + `${padL(f1(h.damageBy.hits), 6)}${padL(f1(h.damageBy.direct), 7)}${padL(f1(h.damageBy.burn), 6)}`
    + `${padL(f2(h.swaps), 6)}${padL(f2(h.fizzles), 6)}${padL(f2(h.ults), 6)}${padL(f2(h.deaths), 7)}`);
}

console.log('\nCards (sorted by winRate)');
console.log(`  ${pad('id', 16)}${pad('name', 22)}${padL('picks', 7)}${padL('plays', 7)}${padL('winRate %', 11)}`);
const cardIds = (Object.keys(r.cards) as CardId[]).sort((a, b) => r.cards[b].winRate - r.cards[a].winRate);
for (const id of cardIds) {
  const c = r.cards[id];
  console.log(`  ${pad(id, 16)}${pad(CARDS[id].name, 22)}${padL(c.picks, 7)}${padL(c.plays, 7)}${padL(pct(c.winRate), 11)}`);
}
