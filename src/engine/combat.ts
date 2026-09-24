// Abstract combat: party power vs encounter threat, resolved in rounds with seeded rolls.
// What matters is the ratio R = threat / power: rounds scale with R, damage per round with R.

import { balance } from './balance';
import { changeMorale, changeRelation, defenceOf, isFriend, maxHp, powerOf, spellOf } from './adventurers';
import { killAdventurer } from './death';
import { monster } from './monsters';
import { has, traitMult } from './traits';
import type { Adventurer, Expedition, GameState } from './types';
import { EventSink, pickWeighted, rollRange, roll } from './util';

export interface Encounter {
  monsterId: string;
  threat: number;
  hpMult: number;
  boss: boolean;
  guardian: boolean;
  depth: number;
}

export type CombatOutcome = 'won' | 'fled' | 'wiped';

export interface CombatResult {
  outcome: CombatOutcome;
  rounds: number;
}

export function members(s: GameState, exp: Expedition): Adventurer[] {
  return exp.memberIds.map((id) => s.adventurers[id]).filter((a) => a && a.status === 'expedition');
}

export function isFirstDay(s: GameState, exp: Expedition): boolean {
  return s.hour - exp.departedHour < balance.time.hoursPerDay;
}

export function partyHp(s: GameState, exp: Expedition): { hp: number; max: number; frac: number } {
  let hp = 0;
  let max = 0;
  for (const a of members(s, exp)) {
    hp += Math.max(0, a.hp);
    max += maxHp(s, a);
  }
  return { hp, max, frac: max > 0 ? hp / max : 0 };
}

/** Effective party power against a given monster, with stance, traits, insights and counsel. */
export function partyPower(s: GameState, exp: Expedition, monsterId: string | null): number {
  const c = balance.combat;
  const firstDay = isFirstDay(s, exp);
  const undead = monsterId ? monster(monsterId).tags.includes('undead') : false;
  let total = 0;
  for (const a of members(s, exp)) {
    let p = powerOf(s, a) * traitMult(a, 'damageDealt', { firstDay });
    if (undead && has(a, 'superstitious')) p *= 1 + c.undeadSuperstitiousBonus;
    total += p;
  }
  total *= c.stance[exp.orders.stance].dealt;
  if (monsterId && s.journal.insights.includes(monsterId)) total *= 1 + c.insightPower;
  if (exp.counsel) total *= 1 + balance.keeper.counselPower;
  return total;
}

function fleeThreshold(s: GameState, exp: Expedition): number {
  // The party breaks off a fight well below its retreat threshold; reckless members hold on.
  const ms = members(s, exp);
  const reckless = ms.some((a) => has(a, 'reckless'));
  const base = exp.orders.retreatHp * balance.combat.fleeAtRetreatFrac;
  return reckless ? base * balance.combat.recklessFleeMult : base;
}

function pickTarget(s: GameState, ms: Adventurer[]): Adventurer {
  return pickWeighted(
    s,
    ms.map((a) => [a, balance.classes[a.classId].role] as const),
  );
}

/** Try to save a member who just dropped. Returns true if they were saved. */
function attemptRescue(s: GameState, exp: Expedition, victim: Adventurer, sink: EventSink): boolean {
  const c = balance.combat;
  const candidates = members(s, exp).filter((a) => a.id !== victim.id && a.hp > 0 && (has(a, 'kind') || isFriend(a, victim.id)));
  if (candidates.length === 0) return false;
  const rescuer = candidates.find((a) => has(a, 'kind')) ?? candidates[0];
  let p = c.rescueBaseChance;
  if (has(rescuer, 'kind')) p += c.rescueKindBonus;
  if (isFriend(rescuer, victim.id)) p += c.rescueFriendBonus;
  const success = roll(s, p);
  sink.emit({ type: 'RESCUE_ATTEMPT', expeditionId: exp.id, rescuerId: rescuer.id, targetId: victim.id, success });
  if (success) {
    victim.hp = 1;
    changeRelation(victim, rescuer, balance.relations.rescueSaved);
    if (roll(s, balance.adventurer.maimChance)) {
      victim.maimed = true;
      sink.emit({ type: 'ADVENTURER_MAIMED', expeditionId: exp.id, adventurerId: victim.id });
    }
    return true;
  }
  rescuer.hp -= Math.round(maxHp(s, rescuer) * c.rescueDamageFrac);
  return false;
}

/** Apply damage to one member; handles rescue and death. */
export function damageMember(
  s: GameState,
  exp: Expedition,
  a: Adventurer,
  amount: number,
  depth: number,
  cause: string,
  sink: EventSink,
): void {
  const before = a.hp;
  a.hp -= Math.max(0, Math.round(amount));
  const mhp = maxHp(s, a);
  if (a.hp <= 0) {
    if (attemptRescue(s, exp, a, sink)) return;
    killAdventurer(s, exp, a.id, depth, cause, sink);
    // A failed rescue can leave the rescuer dying too.
    for (const other of members(s, exp)) {
      if (other.hp <= 0) killAdventurer(s, exp, other.id, depth, cause, sink);
    }
  } else if (before > mhp * balance.combat.woundedFrac && a.hp <= mhp * balance.combat.woundedFrac) {
    sink.emit({ type: 'ADVENTURER_WOUNDED', expeditionId: exp.id, adventurerId: a.id, level: depth, severe: a.hp <= mhp * balance.combat.severeFrac });
  }
}

export function resolveCombat(s: GameState, exp: Expedition, enc: Encounter, sink: EventSink): CombatResult {
  const c = balance.combat;
  const m = monster(enc.monsterId);
  let encHp = enc.threat * c.encHpPerThreat * enc.hpMult;
  const maxRounds = enc.boss || enc.guardian ? c.maxRounds * c.bossRoundsMult : c.maxRounds;
  const stance = c.stance[exp.orders.stance];
  const firstDay = isFirstDay(s, exp);
  let rounds = 0;

  while (rounds < maxRounds) {
    rounds++;
    const ms = members(s, exp);
    if (ms.length === 0) return { outcome: 'wiped', rounds };
    const power = partyPower(s, exp, enc.monsterId);

    // The party strikes.
    encHp -= power * rollRange(s, c.rollMin, c.rollMax);
    if (encHp <= 0) {
      winCombat(s, exp, enc, ms);
      return { outcome: 'won', rounds };
    }

    // The enemy strikes back.
    const { max } = partyHp(s, exp);
    const ratio = enc.threat / Math.max(1, power);
    let roundDmg = max * c.dmgFrac * ratio * rollRange(s, c.rollMin, c.rollMax) * stance.taken;
    if (exp.wardActive) roundDmg *= 1 - balance.items.wardReduction;
    for (let h = 0; h < c.hitsPerRound; h++) {
      const living = members(s, exp).filter((a) => a.hp > 0);
      if (living.length === 0) break;
      const target = pickTarget(s, living);
      const def = defenceOf(s, target);
      const reduced = (roundDmg / c.hitsPerRound) * traitMult(target, 'damageTaken', { firstDay }) * (1 - def / (def + balance.derived.armourK));
      damageMember(s, exp, target, reduced, enc.depth, m.name, sink);
    }

    const after = members(s, exp);
    if (after.length === 0) return { outcome: 'wiped', rounds };

    // Clerics patch up the worst hurt.
    for (const cl of after.filter((a) => a.classId === 'cleric')) {
      const worst = after.reduce((w, a) => (a.hp / maxHp(s, a) < w.hp / maxHp(s, w) ? a : w), after[0]);
      const heal = partyHp(s, exp).max * balance.derived.clericHealPerRound * (spellOf(s, cl) / balance.derived.clericHealSpellRef);
      worst.hp = Math.min(maxHp(s, worst), worst.hp + Math.round(heal));
    }

    // Morale checks after the round.
    for (const a of after) {
      if (a.hp < maxHp(s, a) * c.woundedFrac) changeMorale(a, balance.morale.lowHpPerRound);
    }
    const hp = partyHp(s, exp);
    const avgMorale = after.reduce((t, a) => t + a.morale, 0) / after.length;
    if (hp.frac < fleeThreshold(s, exp) || avgMorale < balance.morale.retreatThreshold) {
      if (roll(s, c.fleeChance)) {
        fleeCombat(s, exp, enc, roundDmg, sink);
        return members(s, exp).length === 0 ? { outcome: 'wiped', rounds } : { outcome: 'fled', rounds };
      }
    }
  }
  // Nobody fell: the party disengages.
  fleeCombat(s, exp, enc, 0, sink);
  return members(s, exp).length === 0 ? { outcome: 'wiped', rounds } : { outcome: 'fled', rounds };
}

function fleeCombat(s: GameState, exp: Expedition, enc: Encounter, roundDmg: number, sink: EventSink): void {
  const c = balance.combat;
  const ms = members(s, exp);
  if (roundDmg > 0 && ms.length > 0) {
    const target = pickTarget(s, ms);
    damageMember(s, exp, target, roundDmg * c.fleeDamage, enc.depth, monster(enc.monsterId).name, sink);
  }
  for (const a of members(s, exp)) changeMorale(a, balance.morale.fled);
  sink.emit({ type: 'COMBAT_FLED', expeditionId: exp.id, level: enc.depth, monsterId: enc.monsterId });
}

function winCombat(s: GameState, exp: Expedition, enc: Encounter, ms: Adventurer[]): void {
  const xp = enc.threat * balance.adventurer.xpPerThreat;
  for (const a of ms) {
    a.xp += xp;
    changeMorale(a, enc.boss ? balance.morale.bossWin : balance.morale.winFight);
  }
  const killer = pickTarget(s, ms);
  killer.kills += 1;
  exp.lastKillerId = killer.id;
}
