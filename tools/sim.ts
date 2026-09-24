// Balance harness. Runs the engine headless and prints a summary.
//
//   npm run sim -- --runs 1000 --seed 42 --mode expedition --depths 1,3,5
//   npm run sim -- --set combat.dmgFrac=0.08 --csv
//
// Modes:
//   expedition  One party of fresh starting adventurers per run, sent at each target depth.

import { mkdirSync, writeFileSync } from 'node:fs';
import { overrideBalance } from '../src/engine/balance';
import { newGame } from '../src/engine/state';
import { stepInPlace } from '../src/engine/step';
import type { GameEvent, GameState, Orders } from '../src/engine/types';

interface Args {
  runs: number;
  seed: string;
  mode: string;
  depths: number[];
  csv: boolean;
  policy: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { runs: 200, seed: '42', mode: 'expedition', depths: [1, 2, 3, 5, 8], csv: false, policy: 'default' };
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
else {
  console.error(`Unknown mode ${args.mode}`);
  process.exit(1);
}
console.log(`\n(${((performance.now() - t0) / 1000).toFixed(1)}s)`);
