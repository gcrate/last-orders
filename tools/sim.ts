// Balance harness. Runs the engine headless and prints a summary.
//
//   npm run sim -- --runs 1000 --seed 42 --mode expedition --depths 1,3,5
//   npm run sim -- --set combat.dmgFrac=0.08 --csv
//
// Modes:
//   expedition  One party of fresh starting adventurers per run, sent at each target depth.

import { mkdirSync, writeFileSync } from 'node:fs';
import { balance, overrideBalance } from '../src/engine/balance';
import { newGame } from '../src/engine/state';
import { stepInPlace } from '../src/engine/step';
import { hoursUntil } from '../src/engine/time';
import type { GameEvent, GameState, Orders } from '../src/engine/types';
import { POLICIES, type PolicyConfig, policyInputs } from './policies';

interface Args {
  runs: number;
  seed: string;
  mode: string;
  depths: number[];
  csv: boolean;
  policy: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { runs: 200, seed: '42', mode: 'generation', depths: [1, 2, 3, 5, 8], csv: false, policy: 'default' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--runs') args.runs = Number(next());
    else if (a === '--seed') args.seed = next();
    else if (a === '--mode') args.mode = next();
    else if (a === '--policy') args.policy = next();
    else if (a === '--depths') args.depths = next().split(',').map(Number);
    else if (a === '--csv') args.csv = true;
    else if (a === '--set') {
      const [path, value] = next().split('=');
      overrideBalance(path, JSON.parse(value));
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Expedition mode

interface ExpeditionRun {
  depth: number;
  wiped: boolean;
  deaths: number;
  days: number;
  gold: number;
  deepest: number;
  objectiveDone: boolean;
}

function runExpedition(seed: string, depth: number): ExpeditionRun {
  const s: GameState = newGame(seed);
  const party = Object.values(s.adventurers).filter((a) => a.status === 'resident').map((a) => a.id);
  const orders: Orders = {
    objective: { type: 'push', level: depth, graveId: null, setPortal: false },
    stance: 'balanced',
    retreatHp: 0.4,
    returnByDay: null,
  };
  const events: GameEvent[] = stepInPlace(s, {
    type: 'SEND_PARTY',
    memberIds: party,
    orders,
    counsel: false,
    supplyIds: [],
    startPortalId: null,
  }, 0);
  const start = s.hour;
  let deepest = 0;
  let done = false;
  while (Object.keys(s.expeditions).length > 0 && s.status === 'playing' && s.hour - start < 24 * 60) {
    const exp = Object.values(s.expeditions)[0];
    deepest = Math.max(deepest, exp.deepest);
    done = exp.objectiveDone;
    events.push(...stepInPlace(s, null, 1));
  }
  const wiped = events.some((e) => e.type === 'PARTY_WIPED');
  const returned = events.find((e) => e.type === 'PARTY_RETURNED');
  return {
    depth,
    wiped,
    deaths: events.filter((e) => e.type === 'ADVENTURER_DIED').length,
    days: (s.hour - start) / 24,
    gold: returned && returned.type === 'PARTY_RETURNED' ? returned.gold : 0,
    deepest,
    objectiveDone: done || events.some((e) => e.type === 'OBJECTIVE_DONE'),
  };
}

function expeditionMode(args: Args): void {
  const rows: string[][] = [['target', 'runs', 'reached%', 'wipe%', 'deaths/exp', 'days', 'gold']];
  const csv: string[] = ['target,seed,wiped,deaths,days,gold,deepest,objectiveDone'];
  for (const depth of args.depths) {
    const runs: ExpeditionRun[] = [];
    for (let i = 0; i < args.runs; i++) {
      const r = runExpedition(`${args.seed}-${i}`, depth);
      runs.push(r);
      csv.push([depth, `${args.seed}-${i}`, r.wiped, r.deaths, r.days.toFixed(2), r.gold, r.deepest, r.objectiveDone].join(','));
    }
    const n = runs.length;
    const avg = (f: (r: ExpeditionRun) => number) => runs.reduce((t, r) => t + f(r), 0) / n;
    rows.push([
      String(depth),
      String(n),
      pct(runs.filter((r) => r.objectiveDone).length / n),
      pct(runs.filter((r) => r.wiped).length / n),
      avg((r) => r.deaths).toFixed(2),
      avg((r) => r.days).toFixed(1),
      avg((r) => r.gold).toFixed(0),
    ]);
  }
  printTable('Single expedition, fresh starting party, push to target depth', rows);
  if (args.csv) writeCsv('expedition.csv', csv);
}

// ---------------------------------------------------------------------------
// Generation mode: a scripted player runs the tavern until the keeper dies.

interface GenerationRun {
  record: GameState['record'];
  goldCurve: number[]; // gold at the start of each week
  status: GameState['status'];
}

function runGeneration(seed: string, cfg: PolicyConfig, maxDays: number): GenerationRun {
  const s = newGame(seed);
  const goldCurve: number[] = [];
  let lastWeek = -1;
  while (s.status === 'playing' && s.hour < maxDays * 24) {
    for (const input of policyInputs(s, cfg)) stepInPlace(s, input, 0);
    stepInPlace(s, null, hoursUntil(s.hour, balance.time.eveningHour));
    const week = Math.floor(s.hour / (24 * 7));
    if (week !== lastWeek) {
      goldCurve.push(s.gold);
      lastWeek = week;
    }
  }
  if (s.status === 'playing') s.record.days = Math.floor(s.hour / 24);
  return { record: s.record, goldCurve, status: s.status };
}

function generationMode(args: Args): void {
  const cfg = POLICIES[args.policy];
  if (!cfg) throw new Error(`Unknown policy ${args.policy}. Try: ${Object.keys(POLICIES).join(', ')}`);
  const runs: GenerationRun[] = [];
  const csv = ['seed,days,cause,maxDepth,levelsCleared,bosses,expeditions,deaths,goldEarned,retired'];
  for (let i = 0; i < args.runs; i++) {
    const r = runGeneration(`${args.seed}-${i}`, cfg, 400);
    runs.push(r);
    const g = r.record;
    csv.push([`${args.seed}-${i}`, g.days, g.causeOfDeath, g.maxDepth, g.levelsCleared, g.bossesKilled, g.expeditions, g.deaths, g.goldEarned, g.retiredAlive].join(','));
  }
  const n = runs.length;
  const recs = runs.map((r) => r.record);
  const avg = (f: (g: GenerationRun['record']) => number) => recs.reduce((t, g) => t + f(g), 0) / n;
  const pctl = (f: (g: GenerationRun['record']) => number, p: number) => {
    const v = recs.map(f).sort((a, b) => a - b);
    return v[Math.min(v.length - 1, Math.floor(p * v.length))];
  };

  printTable(`Generation summary: ${n} runs, policy "${cfg.name}"`, [
    ['metric', 'mean', 'p10', 'p50', 'p90'],
    ...([
      ['days', (g) => g.days],
      ['max depth', (g) => g.maxDepth],
      ['levels cleared', (g) => g.levelsCleared],
      ['bosses killed', (g) => g.bossesKilled],
      ['expeditions', (g) => g.expeditions],
      ['deaths', (g) => g.deaths],
      ['gold earned', (g) => g.goldEarned],
      ['retired alive', (g) => g.retiredAlive],
    ] as [string, (g: GenerationRun['record']) => number][]).map(([name, f]) => [
      name,
      avg(f).toFixed(1),
      String(pctl(f, 0.1)),
      String(pctl(f, 0.5)),
      String(pctl(f, 0.9)),
    ]),
  ]);

  const causes: Record<string, number> = {};
  for (const g of recs) causes[g.causeOfDeath || 'alive'] = (causes[g.causeOfDeath || 'alive'] ?? 0) + 1;
  printTable('Keeper cause of death', [['cause', 'share'], ...Object.entries(causes).map(([c, k]) => [c, pct(k / n)])]);

  const bandRows: string[][] = [['band', 'levels', 'expeditions', 'deaths', 'deaths/exp']];
  for (let b = 0; b < 5; b++) {
    const exps = recs.reduce((t, g) => t + g.expeditionsByBand[b], 0);
    const deaths = recs.reduce((t, g) => t + g.deathsByBand[b], 0);
    bandRows.push([String(b + 1), `${b * 10 + 1}-${b * 10 + 10}`, (exps / n).toFixed(1), (deaths / n).toFixed(1), exps ? (deaths / exps).toFixed(2) : '-']);
  }
  printTable('Adventurer deaths per expedition, by deepest band reached (per generation)', bandRows);

  const weeks = Math.max(...runs.map((r) => r.goldCurve.length));
  const goldRows: string[][] = [['week', 'mean gold', 'runs alive']];
  for (let w = 0; w < weeks; w += 2) {
    const vals = runs.filter((r) => r.goldCurve.length > w).map((r) => r.goldCurve[w]);
    goldRows.push([String(w), (vals.reduce((t, v) => t + v, 0) / vals.length).toFixed(0), String(vals.length)]);
  }
  printTable('Gold curve', goldRows);
  if (args.csv) writeCsv('generations.csv', csv);
}

// ---------------------------------------------------------------------------
// Output

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function printTable(title: string, rows: string[][]): void {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length)));
  console.log(`\n${title}`);
  rows.forEach((r, i) => {
    console.log(r.map((cell, c) => cell.padStart(widths[c])).join('  '));
    if (i === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  });
}

function writeCsv(name: string, lines: string[]): void {
  mkdirSync('tools/out', { recursive: true });
  writeFileSync(`tools/out/${name}`, lines.join('\n'));
  console.log(`\nWrote tools/out/${name}`);
}

// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const t0 = performance.now();
if (args.mode === 'expedition') expeditionMode(args);
else if (args.mode === 'generation') generationMode(args);
else {
  console.error(`Unknown mode ${args.mode}`);
  process.exit(1);
}
console.log(`\n(${((performance.now() - t0) / 1000).toFixed(1)}s)`);
