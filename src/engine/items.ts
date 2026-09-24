// Item catalogue and creation. Stat numbers come from balance.items.

import { balance } from './balance';
import type { ClassId, EquipSlot, GameState, Item, ItemKind, ItemSlot } from './types';
import { newId } from './util';

interface KindDef {
  slot: ItemSlot;
  names: [string, string, string];
  attack?: number;
  defence?: number;
  spell?: number;
  trap?: number;
  hp?: number;
}

// Multipliers here shape each kind relative to its tier's base value.
export const ITEM_KINDS: Record<ItemKind, KindDef> = {
  sword: { slot: 'weapon', names: ['Rusty Sword', 'Steel Sword', "Knight's Blade"], attack: 1.0, defence: 0.2 },
  axe: { slot: 'weapon', names: ['Hatchet', 'War Axe', 'Dwarven Greataxe'], attack: 1.2 },
  mace: { slot: 'weapon', names: ['Cudgel', 'Flanged Mace', 'Blessed Morningstar'], attack: 0.8, spell: 0.4 },
  dagger: { slot: 'weapon', names: ['Rusty Knife', 'Stiletto', 'Shadow Fang'], attack: 0.85, trap: 0.5 },
  staff: { slot: 'weapon', names: ['Walking Staff', 'Oak Staff', 'Runed Staff'], attack: 0.2, spell: 1.1 },
  bow: { slot: 'weapon', names: ['Shortbow', 'Longbow', 'Yew Warbow'], attack: 0.95, trap: 0.2 },
  cloth: { slot: 'armour', names: ['Wool Robes', 'Padded Robes', 'Warded Vestments'], defence: 0.5, spell: 0.3, hp: 0.5 },
  leather: { slot: 'armour', names: ['Patched Leathers', 'Studded Leather', 'Shadowhide'], defence: 0.8, trap: 0.2, hp: 0.8 },
  plate: { slot: 'armour', names: ['Rusted Mail', 'Chain Hauberk', 'Plate Harness'], defence: 1.2, hp: 1.2 },
  ring: { slot: 'trinket', names: ['Copper Ring', 'Silver Ring', 'Gold Signet'], attack: 1, spell: 1 },
  amulet: { slot: 'trinket', names: ['Bone Amulet', 'Silver Amulet', 'Sunstone Amulet'], defence: 0.5, hp: 4 },
  charm: { slot: 'trinket', names: ["Rabbit's Foot", 'Carved Charm', 'Witch Knot'], trap: 2, defence: 0.3 },
  portal: { slot: 'scroll', names: ['Portal Scroll', 'Portal Scroll', 'Portal Scroll'] },
  healing: { slot: 'scroll', names: ['Healing Scroll', 'Healing Scroll', 'Healing Scroll'] },
  light: { slot: 'scroll', names: ['Light Scroll', 'Light Scroll', 'Light Scroll'] },
  ward: { slot: 'scroll', names: ['Ward Scroll', 'Ward Scroll', 'Ward Scroll'] },
  identify: { slot: 'scroll', names: ['Identify Scroll', 'Identify Scroll', 'Identify Scroll'] },
  potion: { slot: 'consumable', names: ['Healing Potion', 'Healing Potion', 'Healing Potion'] },
  rations: { slot: 'consumable', names: ['Rations', 'Rations', 'Rations'] },
  torch: { slot: 'consumable', names: ['Torch', 'Torch', 'Torch'] },
};

export const WEAPON_KINDS: readonly ItemKind[] = ['sword', 'axe', 'mace', 'dagger', 'staff', 'bow'];
export const ARMOUR_KINDS: readonly ItemKind[] = ['cloth', 'leather', 'plate'];
export const TRINKET_KINDS: readonly ItemKind[] = ['ring', 'amulet', 'charm'];
export const SCROLL_KINDS: readonly ItemKind[] = ['portal', 'healing', 'light', 'ward', 'identify'];
export const CONSUMABLE_KINDS: readonly ItemKind[] = ['potion', 'rations', 'torch'];
export const GEAR_KINDS: readonly ItemKind[] = [...WEAPON_KINDS, ...ARMOUR_KINDS, ...TRINKET_KINDS];

export const CLASS_WEAPONS: Record<ClassId, ItemKind[]> = {
  fighter: ['sword', 'axe'],
  rogue: ['dagger', 'bow'],
  cleric: ['mace'],
  mage: ['staff'],
};

export const CLASS_ARMOUR: Record<ClassId, ItemKind> = {
  fighter: 'plate',
  rogue: 'leather',
  cleric: 'leather',
  mage: 'cloth',
};

export interface LegendaryDef {
  id: string;
  kind: ItemKind;
  name: string;
}

export const LEGENDARIES: readonly LegendaryDef[] = [
  { id: 'keepersSword', kind: 'sword', name: "The Keeper's Sword" },
  { id: 'mourningStar', kind: 'mace', name: 'Mourning Star' },
  { id: 'whisper', kind: 'dagger', name: 'Whisper' },
  { id: 'deepwell', kind: 'staff', name: 'Staff of the Deep Well' },
  { id: 'drownedMail', kind: 'plate', name: "Drowned King's Mail" },
  { id: 'lastOrders', kind: 'ring', name: 'Ring of Last Orders' },
];

export function isEquipSlot(slot: ItemSlot): slot is EquipSlot {
  return slot === 'weapon' || slot === 'armour' || slot === 'trinket';
}

function tierBase(slot: ItemSlot, tier: number): { atk: number; def: number; hp: number; trinket: number } {
  const b = balance.items;
  const t = Math.max(0, Math.min(4, tier));
  return {
    atk: slot === 'weapon' ? b.weaponAttack[t] : 0,
    def: slot === 'armour' ? b.armourDefence[t] : 0,
    hp: slot === 'armour' ? b.armourHp[t] : 0,
    trinket: slot === 'trinket' ? b.trinketBonus[t] : 0,
  };
}

export function itemValue(kind: ItemKind, tier: number): number {
  const def = ITEM_KINDS[kind];
  const b = balance.items;
  if (def.slot === 'scroll') return (b.scrollValue as Record<string, number>)[kind] ?? 30;
  if (def.slot === 'consumable') return (b.consumableValue as Record<string, number>)[kind] ?? 5;
  return b.tierValue[Math.max(0, Math.min(4, tier))];
}

export type ItemStats = Pick<Item, 'attack' | 'defence' | 'spell' | 'trapSense' | 'hpBonus'>;

/** The stats an item of this kind and tier has. Pure, so the UI can preview shop stock. */
export function itemStatsFor(kind: ItemKind, tier: number): ItemStats {
  const def = ITEM_KINDS[kind];
  const base = tierBase(def.slot, tier);
  if (def.slot === 'weapon') {
    return {
      attack: Math.round(base.atk * (def.attack ?? 0)),
      spell: Math.round(base.atk * (def.spell ?? 0)),
      defence: Math.round(base.atk * (def.defence ?? 0)),
      trapSense: Math.round(base.atk * (def.trap ?? 0)),
      hpBonus: 0,
    };
  }
  if (def.slot === 'armour') {
    return {
      attack: 0,
      defence: Math.round(base.def * (def.defence ?? 0)),
      spell: Math.round(base.def * (def.spell ?? 0)),
      trapSense: Math.round(base.def * (def.trap ?? 0)),
      hpBonus: Math.round(base.hp * (def.hp ?? 0)),
    };
  }
  if (def.slot === 'trinket') {
    return {
      attack: Math.round(base.trinket * (def.attack ?? 0)),
      spell: Math.round(base.trinket * (def.spell ?? 0)),
      defence: Math.round(base.trinket * (def.defence ?? 0)),
      trapSense: Math.round(base.trinket * (def.trap ?? 0)),
      hpBonus: Math.round(base.trinket * (def.hp ?? 0)),
    };
  }
  return { attack: 0, defence: 0, spell: 0, trapSense: 0, hpBonus: 0 };
}

function fillStats(item: Item): void {
  if (isEquipSlot(item.slot)) Object.assign(item, itemStatsFor(item.kind, item.tier));
  item.value = itemValue(item.kind, item.tier);
}

export function itemAsset(kind: ItemKind, tier: number, slot: ItemSlot): string {
  if (slot === 'scroll') return `scroll_${kind}`;
  if (slot === 'consumable') return `consumable_${kind}`;
  return `item_${kind}_${Math.min(3, tier)}`;
}

/** Create an item and register it in state.items. Returns its id. The caller places it. */
export function createItem(s: GameState, kind: ItemKind, tier: number): string {
  const def = ITEM_KINDS[kind];
  const t = def.slot === 'scroll' || def.slot === 'consumable' ? 1 : Math.max(1, Math.min(3, tier));
  const item: Item = {
    id: newId(s, 'i'),
    kind,
    slot: def.slot,
    name: def.names[t - 1],
    tier: t,
    attack: 0,
    defence: 0,
    spell: 0,
    trapSense: 0,
    hpBonus: 0,
    value: 0,
    legendary: false,
    asset: itemAsset(kind, t, def.slot),
  };
  fillStats(item);
  s.items[item.id] = item;
  return item.id;
}

export function createLegendary(s: GameState, legendaryId: string): string {
  const def = LEGENDARIES.find((l) => l.id === legendaryId);
  if (!def) throw new Error(`Unknown legendary ${legendaryId}`);
  const id = createItem(s, def.kind, 3);
  const item = s.items[id];
  item.tier = 4;
  item.legendary = true;
  item.name = def.name;
  item.asset = `legendary_${def.id}`;
  fillStats(item);
  return id;
}

/** Raise an item one tier (forge upgrade). Keeps its identity. */
export function upgradeItemTier(item: Item): void {
  if (item.tier >= 3 || item.legendary) return;
  item.tier += 1;
  item.name = ITEM_KINDS[item.kind].names[item.tier - 1];
  item.asset = itemAsset(item.kind, item.tier, item.slot);
  fillStats(item);
}

export function sellPrice(item: Item): number {
  return Math.max(1, Math.round(item.value * balance.items.sellFraction));
}

export function upgradeCost(item: Item): number {
  if (item.tier >= 3 || item.legendary) return Infinity;
  return Math.round(itemValue(item.kind, item.tier + 1) * balance.items.upgradeCostFraction);
}
