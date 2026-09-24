import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, createItem, itemStatsFor } from '../src/engine/items';
import { newGame } from '../src/engine/state';
import type { ItemKind } from '../src/engine/types';
import { itemDescription } from '../src/text/items';

const KINDS = Object.keys(ITEM_KINDS) as ItemKind[];

describe('item stat preview', () => {
  it('matches the stats of a created item for every kind and tier', () => {
    const s = newGame('items');
    for (const kind of KINDS) {
      for (const tier of [1, 2, 3]) {
        const item = s.items[createItem(s, kind, tier)];
        const { attack, defence, spell, trapSense, hpBonus } = item;
        expect(itemStatsFor(kind, item.tier)).toEqual({ attack, defence, spell, trapSense, hpBonus });
      }
    }
  });

  it('has a description for every kind', () => {
    for (const kind of KINDS) expect(itemDescription(kind).length).toBeGreaterThan(10);
  });
});
