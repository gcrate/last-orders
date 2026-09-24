// Buying, selling, equipping, forge upgrades and bounties.

import { balance } from './balance';
import { maxHp } from './adventurers';
import {
  CONSUMABLE_KINDS,
  GEAR_KINDS,
  ITEM_KINDS,
  createItem,
  isEquipSlot,
  itemValue,
  sellPrice,
  upgradeCost,
  upgradeItemTier,
} from './items';
import type { EquipSlot, GameState, ItemKind } from './types';
import { EventSink } from './util';

export interface ShopEntry {
  kind: ItemKind;
  tier: number;
  price: number;
}

export function shopCatalog(s: GameState): ShopEntry[] {
  const sh = balance.shop;
  const out: ShopEntry[] = [];
  const maxTier = sh.forgeMaxTier[s.upgrades.forge];
  for (const kind of GEAR_KINDS) {
    for (let tier = 1; tier <= maxTier; tier++) {
      out.push({ kind, tier, price: Math.round(itemValue(kind, tier) * sh.priceMarkup) });
    }
  }
  const discount = sh.libraryDiscount[s.upgrades.library];
  for (const kind of sh.libraryScrolls[s.upgrades.library] as ItemKind[]) {
    out.push({ kind, tier: 1, price: Math.round(itemValue(kind, 1) * sh.priceMarkup * discount) });
  }
  for (const kind of CONSUMABLE_KINDS) {
    out.push({ kind, tier: 1, price: Math.round(itemValue(kind, 1) * sh.priceMarkup) });
  }
  return out;
}

export function buy(s: GameState, kind: ItemKind, tier: number, sink: EventSink): void {
  const entry = shopCatalog(s).find((e) => e.kind === kind && e.tier === tier);
  if (!entry) return sink.emit({ type: 'ACTION_REJECTED', reason: 'Nobody in town sells that.' });
  if (s.gold < entry.price) return sink.emit({ type: 'ACTION_REJECTED', reason: 'Not enough gold.' });
  s.gold -= entry.price;
  const id = createItem(s, kind, tier);
  s.stash.push(id);
  sink.emit({ type: 'ITEM_BOUGHT', itemId: id, cost: entry.price });
}

export function sell(s: GameState, itemId: string, sink: EventSink): void {
  const item = s.items[itemId];
  if (!item || !s.stash.includes(itemId)) return sink.emit({ type: 'ACTION_REJECTED', reason: 'That is not in the stash.' });
  const gold = sellPrice(item);
  s.gold += gold;
  s.record.goldEarned += gold;
  s.stash = s.stash.filter((id) => id !== itemId);
  sink.emit({ type: 'ITEM_SOLD', itemId, gold });
  delete s.items[itemId];
}

/** Where an item currently is: the stash, or equipped on a resident. */
function itemOwner(s: GameState, itemId: string): 'stash' | string | null {
  if (s.stash.includes(itemId)) return 'stash';
  for (const a of Object.values(s.adventurers)) {
    if (a.status !== 'resident') continue;
    if (a.equipment.weapon === itemId || a.equipment.armour === itemId || a.equipment.trinket === itemId) return a.id;
  }
  return null;
}

export function forgeUpgrade(s: GameState, itemId: string, sink: EventSink): void {
  const reject = (reason: string) => sink.emit({ type: 'ACTION_REJECTED', reason });
  const item = s.items[itemId];
  if (!item || itemOwner(s, itemId) === null) return reject('That item is not here.');
  if (s.upgrades.forge < 1) return reject('You need a forge for that.');
  if (!isEquipSlot(item.slot) || item.legendary) return reject('The smith shakes their head.');
  if (item.tier >= balance.shop.forgeMaxTier[s.upgrades.forge]) return reject('The forge cannot improve it further.');
  const cost = upgradeCost(item);
  if (s.gold < cost) return reject('Not enough gold.');
  s.gold -= cost;
  upgradeItemTier(item);
  sink.emit({ type: 'ITEM_UPGRADED', itemId, cost });
}

export function equip(s: GameState, adventurerId: string, itemId: string, sink: EventSink): void {
  const reject = (reason: string) => sink.emit({ type: 'ACTION_REJECTED', reason });
  const a = s.adventurers[adventurerId];
  const item = s.items[itemId];
  if (!a || a.status !== 'resident') return reject('They are not at the tavern.');
  if (!item || !isEquipSlot(item.slot)) return reject('That cannot be worn.');
  const slot = item.slot;
  // The item can come from the stash or straight off another resident.
  const wearer = Object.values(s.adventurers).find((o) => o.status === 'resident' && o.equipment[slot] === itemId);
  if (wearer === a) return;
  if (!wearer && !s.stash.includes(itemId)) return reject('That is not in the stash.');
  const current = a.equipment[slot];
  if (current) s.stash.push(current);
  if (wearer) {
    wearer.equipment[slot] = null;
    wearer.hp = Math.min(wearer.hp, maxHp(s, wearer));
  } else {
    s.stash = s.stash.filter((id) => id !== itemId);
  }
  a.equipment[slot] = itemId;
  a.hp = Math.min(a.hp, maxHp(s, a));
  sink.emit({ type: 'ITEM_EQUIPPED', adventurerId, itemId });
}

export function unequip(s: GameState, adventurerId: string, slot: EquipSlot, sink: EventSink): void {
  const a = s.adventurers[adventurerId];
  if (!a || a.status !== 'resident') return sink.emit({ type: 'ACTION_REJECTED', reason: 'They are not at the tavern.' });
  const id = a.equipment[slot];
  if (!id) return;
  a.equipment[slot] = null;
  s.stash.push(id);
  a.hp = Math.min(a.hp, maxHp(s, a));
}

export function postBounty(s: GameState, graveId: string, gold: number, sink: EventSink): void {
  const reject = (reason: string) => sink.emit({ type: 'ACTION_REJECTED', reason });
  if (s.upgrades.noticeBoard < 1) return reject('You need a notice board to post bounties.');
  const g = s.graves[graveId];
  if (!g || g.recovered) return reject('There is no such grave.');
  const amount = Math.floor(gold);
  if (amount <= 0) return reject('A bounty needs some gold behind it.');
  if (s.gold < amount) return reject('Not enough gold.');
  s.gold -= amount;
  g.bounty += amount;
  sink.emit({ type: 'BOUNTY_POSTED', graveId, gold: amount });
}

export function kindName(kind: ItemKind): string {
  return ITEM_KINDS[kind].names[0];
}
