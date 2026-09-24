// Item descriptions for tooltips. Numbers come from balance so the text stays true when tuning.

import { balance } from '../engine/balance';
import { CLASS_WEAPONS, ITEM_KINDS } from '../engine/items';
import type { ClassId, ItemKind } from '../engine/types';

const pct = (f: number) => `${Math.round(f * 100)}%`;

/** What a scroll or consumable does when a party carries it. Gear gets a short line about its slot. */
export function itemDescription(kind: ItemKind): string {
  const it = balance.items;
  const ex = balance.expedition;
  switch (kind) {
    case 'potion':
      return `Drunk by anyone who falls below ${pct(ex.potionUseBelow)} health, restoring ${pct(it.potionHeal)} of their max HP.`;
    case 'rations':
      return `One is eaten each night below. A night without rations costs everyone ${balance.morale.daysOutPenalty} morale.`;
    case 'torch':
      return `Lit on an unmapped level: the party explores ${pct(it.lightExploreBonus)} faster and spots traps more easily. Used after light scrolls.`;
    case 'light':
      return `Read on an unmapped level: the party explores ${pct(it.lightExploreBonus)} faster and spots traps more easily. Used before torches.`;
    case 'healing':
      return `Read when the party falls below ${pct(ex.healingScrollUseBelow)} health, restoring ${pct(it.healingScrollHeal)} of everyone's max HP.`;
    case 'ward':
      return `Read before a boss fight, halving the damage the party takes (${pct(it.wardReduction)} less) for that fight.`;
    case 'identify':
      return `Read when the party finds gear, making the find one tier better.`;
    case 'portal':
      return `Opens a portal home from level ${ex.portalUseMinDepth} or deeper when the party retreats, or at the goal of a push that asks for one. Others can use the portal to start deep.`;
  }
  const slot = ITEM_KINDS[kind].slot;
  if (slot === 'weapon') return 'A weapon. Stats add to whoever carries it.';
  if (slot === 'armour') return 'Armour. Stats add to whoever wears it.';
  return 'A trinket. Stats add to whoever wears it.';
}

const CLASS_NAMES: Record<ClassId, string> = { fighter: 'fighters', rogue: 'rogues', cleric: 'clerics', mage: 'mages' };

/** "Favoured by fighters (+25% power)" for weapons a class fights best with, else null. */
export function affinityText(kind: ItemKind): string | null {
  const classes = (Object.keys(CLASS_WEAPONS) as ClassId[]).filter((c) => CLASS_WEAPONS[c].includes(kind));
  if (classes.length === 0) return null;
  return `Favoured by ${classes.map((c) => CLASS_NAMES[c]).join(' and ')} (+${pct(balance.items.affinityBonus)} power)`;
}
