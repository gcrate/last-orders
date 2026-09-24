// Scripted player policies for the balance harness. A policy looks at the state once per
// evening and returns a list of inputs. It should play like a sensible, unexciting player.

import { balance } from '../src/engine/balance';
import { maxHp, powerOf } from '../src/engine/adventurers';
import { shopCatalog } from '../src/engine/economy';
import { bossThreat, isBossLevel, level, levelThreat, portalsActive } from '../src/engine/dungeon';
import { CLASS_ARMOUR, CLASS_WEAPONS, isEquipSlot } from '../src/engine/items';
import { exertBlocked } from '../src/engine/keeper';
import { housedCount, roomCapacity, upgradeCost } from '../src/engine/tavern';
import type { Adventurer, GameState, Item, ItemKind, Orders, PlayerInput, UpgradeId } from '../src/engine/types';

export interface PolicyConfig {
  name: string;
  pushRatio: number; // push while frontier threat / party power is below this
  bossRatio: number; // attempt a boss when boss threat / party power is below this
  retreatHp: number;
  stance: Orders['stance'];
  counselDeep: boolean;
  tonics: number; // max tonics per keeper
  rest: boolean;
  train: boolean;
}

export const POLICIES: Record<string, PolicyConfig> = {
  default: { name: 'default', pushRatio: 0.85, bossRatio: 0.75, retreatHp: 0.4, stance: 'balanced', counselDeep: true, tonics: 6, rest: true, train: false },
  cautious: { name: 'cautious', pushRatio: 0.6, bossRatio: 0.55, retreatHp: 0.5, stance: 'cautious', counselDeep: true, tonics: 8, rest: true, train: false },
  aggressive: { name: 'aggressive', pushRatio: 0.95, bossRatio: 0.9, retreatHp: 0.3, stance: 'aggressive', counselDeep: false, tonics: 3, rest: false, train: true },
  idle: { name: 'idle', pushRatio: 0, bossRatio: 0, retreatHp: 0.5, stance: 'cautious', counselDeep: false, tonics: 0, rest: false, train: false },
};

const UPGRADE_PRIORITY: UpgradeId[] = ['rooms', 'forge', 'library', 'commonRoom', 'noticeBoard', 'shrine'];

function residentsOf(s: GameState): Adventurer[] {
  return Object.values(s.adventurers).filter((a) => a.status === 'resident');
}

function itemScore(item: Item, a: Adventurer): number {
  let v = item.attack + item.spell + item.defence * 0.5 + item.hpBonus * 0.2 + item.trapSense * 0.1;
  if (item.slot === 'weapon' && CLASS_WEAPONS[a.classId].includes(item.kind)) v *= 1 + balance.items.affinityBonus;
  if (item.slot === 'weapon' && a.classId === 'mage' && item.kind !== 'staff') v *= 0.5;
  return v;
}

function wanted(s: GameState, kind: ItemKind): number {
  return s.stash.filter((id) => s.items[id]?.kind === kind).length;
}

export function policyInputs(s: GameState, cfg: PolicyConfig): PlayerInput[] {
  const out: PlayerInput[] = [];
  let gold = s.gold;
  if (s.status !== 'playing') return out;
  if (cfg.pushRatio === 0) return out;

  // 1. Recruit the strongest faces at the bar while there is room.
  const room = roomCapacity(s) - housedCount(s);
  const bar = Object.values(s.adventurers)
    .filter((a) => a.status === 'recruit')
    .sort((a, b) => powerOf(s, b) - powerOf(s, a));
  for (const r of bar.slice(0, Math.max(0, room))) {
    if (r.signingCost <= gold) {
      out.push({ type: 'RECRUIT', adventurerId: r.id });
      gold -= r.signingCost;
    }
  }

  // 2. Equip the best stash gear, then sell what nobody wants.
  const stash = s.stash.map((id) => s.items[id]).filter((i): i is Item => !!i);
  const used = new Set<string>();
  for (const a of residentsOf(s)) {
    for (const slot of ['weapon', 'armour', 'trinket'] as const) {
      const current = a.equipment[slot] ? s.items[a.equipment[slot]!] : null;
      let best: Item | null = null;
      for (const it of stash) {
        if (used.has(it.id) || it.slot !== slot) continue;
        if (itemScore(it, a) > (best ? itemScore(best, a) : current ? itemScore(current, a) : 0)) best = it;
      }
      if (best) {
        used.add(best.id);
        out.push({ type: 'EQUIP', adventurerId: a.id, itemId: best.id });
      }
    }
  }
  for (const it of stash) {
    if (used.has(it.id) || !isEquipSlot(it.slot)) continue;
    out.push({ type: 'SELL', itemId: it.id });
    gold += Math.round(it.value * balance.items.sellFraction);
  }

  // 3. Buy basic gear for the ill-equipped, and supplies.
  const catalog = shopCatalog(s);
  const reserve = 60;
  for (const a of residentsOf(s)) {
    for (const [slot, kind] of [
      ['weapon', CLASS_WEAPONS[a.classId][0]],
      ['armour', CLASS_ARMOUR[a.classId]],
    ] as const) {
      const current = a.equipment[slot] ? s.items[a.equipment[slot]!] : null;
      const options = catalog.filter((e) => e.kind === kind && e.tier > (current?.tier ?? 0)).sort((x, y) => y.tier - x.tier);
      const pick = options.find((e) => e.price + reserve <= gold);
      if (pick) {
        out.push({ type: 'BUY', kind: pick.kind, tier: pick.tier });
        gold -= pick.price;
      }
    }
  }
  for (const [kind, n] of [['rations', 4], ['potion', 4], ['portal', 1], ['healing', 1]] as [ItemKind, number][]) {
    const entry = catalog.find((e) => e.kind === kind);
    if (!entry) continue;
    for (let i = wanted(s, kind); i < n && entry.price + reserve <= gold; i++) {
      out.push({ type: 'BUY', kind, tier: 1 });
      gold -= entry.price;
    }
  }

  // 4. Tavern upgrades when comfortably rich.
  for (const u of UPGRADE_PRIORITY) {
    const cost = upgradeCost(s, u);
    if (cost !== null && gold > cost * 1.5 + reserve) {
      out.push({ type: 'BUY_UPGRADE', upgrade: u });
      gold -= cost;
      break;
    }
  }

  // 5. Keeper: tonics while they are cheap and affordable.
  if (s.keeper.tonicsTaken < cfg.tonics && gold > balance.keeper.tonicCost + reserve * 2) {
    out.push({ type: 'KEEPER', action: { type: 'TONIC' } });
    gold -= balance.keeper.tonicCost;
  }

  // 6. Send parties.
  let counselled = false;
  const claimedGraves = new Set(
    Object.values(s.expeditions)
      .map((e) => e.orders.objective.graveId)
      .filter((g): g is string => !!g),
  );
  const ready = residentsOf(s)
    .filter((a) => a.hp >= maxHp(s, a) * 0.75)
    .sort((a, b) => powerOf(s, b) - powerOf(s, a));
  const size = balance.party.maxSize;
  while (ready.length >= Math.min(size, 3)) {
    const party = ready.splice(0, size);
    const power = party.reduce((t, a) => t + powerOf(s, a), 0);
    let plan = planObjective(s, power, cfg);
    // Now and then, fetch back a grave that lies within safe reach.
    const grave = Object.values(s.graves)
      .filter((g) => !g.recovered && !g.guardianAlive && g.level <= plan.level && !claimedGraves.has(g.id))
      .sort((a, b) => b.itemIds.length - a.itemIds.length)[0];
    if (grave && plan.type !== 'boss') {
      claimedGraves.add(grave.id);
      plan = { type: 'recover', level: grave.level, portalId: bestPortal(s, grave.level), graveId: grave.id };
    }
    const supplies: string[] = [];
    const take = (kind: ItemKind, n: number) => {
      for (const id of s.stash) {
        if (n <= 0) break;
        if (s.items[id]?.kind === kind && !supplies.includes(id) && !out.some((o) => o.type === 'SEND_PARTY' && o.supplyIds.includes(id))) {
          supplies.push(id);
          n--;
        }
      }
    };
    take('rations', Math.ceil(plan.level / 5));
    take('potion', 2);
    take('healing', 1);
    if (plan.level >= 5) take('portal', 1);
    const counsel = cfg.counselDeep && !counselled && plan.type === 'boss' && exertBlocked(s) === null;
    if (counsel) counselled = true;
    out.push({
      type: 'SEND_PARTY',
      memberIds: party.map((a) => a.id),
      orders: {
        objective: { type: plan.type, level: plan.level, graveId: plan.graveId ?? null, setPortal: plan.type === 'push' && plan.level >= 5 },
        stance: cfg.stance,
        retreatHp: cfg.retreatHp,
        returnByDay: null,
      },
      counsel,
      supplyIds: supplies,
      startPortalId: plan.portalId,
    });
  }

  if (cfg.train && !counselled && exertBlocked(s) === null) {
    const best = residentsOf(s).sort((a, b) => powerOf(s, b) - powerOf(s, a))[0];
    if (best) {
      const prim = balance.classes[best.classId].primary as 'might';
      out.push({ type: 'KEEPER', action: { type: 'TRAIN', adventurerId: best.id, stat: prim } });
    }
  } else if (cfg.rest && !counselled) {
    out.push({ type: 'KEEPER', action: { type: 'REST' } });
  }
  return out;
}

interface Plan {
  type: 'push' | 'boss' | 'clear' | 'recover';
  level: number;
  portalId: string | null;
  graveId?: string;
}

function planObjective(s: GameState, power: number, cfg: PolicyConfig): Plan {
  // Deepest level we could reach before hitting an unbeaten boss or too much danger.
  let target = 1;
  for (let d = 1; d <= balance.dungeon.levels; d++) {
    const ratio = levelThreat(s, d) / power;
    if (ratio > cfg.pushRatio) break;
    target = d;
    if (isBossLevel(d) && level(s, d).bossAlive) {
      const bossRatio = bossThreat(s, d) / power;
      if (bossRatio <= cfg.bossRatio) {
        return { type: 'boss', level: d, portalId: bestPortal(s, d) };
      }
      break;
    }
  }
  const frontier = s.levels.findIndex((l) => !l.stairsKnown) + 1 || balance.dungeon.levels;
  const lvl = Math.min(target, Math.max(1, frontier));
  // Not strong enough to push on: clear the deepest safe level for experience and reputation.
  if (lvl < frontier && level(s, lvl).population > 0.5) return { type: 'clear', level: lvl, portalId: bestPortal(s, lvl) };
  return { type: 'push', level: lvl, portalId: bestPortal(s, lvl) };
}

function bestPortal(s: GameState, maxLevel: number): string | null {
  const ps = portalsActive(s)
    .filter((p) => p.level <= maxLevel && !p.decayed)
    .sort((a, b) => b.level - a.level);
  return ps[0]?.id ?? null;
}
