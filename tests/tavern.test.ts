import { describe, expect, it } from 'vitest';
import { balance } from '../src/engine/balance';
import { newGame } from '../src/engine/state';
import { stepInPlace } from '../src/engine/step';
import { hoursUntil } from '../src/engine/time';
import type { GameState } from '../src/engine/types';
import { describeEvent } from '../src/text/templates';

function toEvening(s: GameState) {
  return stepInPlace(s, null, hoursUntil(s.hour, balance.time.eveningHour));
}

describe('tavern loop', () => {
  it('recruits appear at the bar in the evening and can be hired', () => {
    const s = newGame('tavern-1');
    const events = toEvening(s);
    const arrived = events.find((e) => e.type === 'RECRUITS_ARRIVED');
    expect(arrived).toBeDefined();
    const id = arrived!.type === 'RECRUITS_ARRIVED' ? arrived!.adventurerIds[0] : '';
    expect(s.adventurers[id].status).toBe('recruit');
    stepInPlace(s, { type: 'RECRUIT', adventurerId: id }, 0);
    expect(s.adventurers[id].status).toBe('resident');
  });

  it('unhired recruits leave after a couple of days and are forgotten', () => {
    const s = newGame('tavern-2');
    const events = toEvening(s);
    const arrived = events.find((e) => e.type === 'RECRUITS_ARRIVED');
    const ids = arrived && arrived.type === 'RECRUITS_ARRIVED' ? arrived.adventurerIds : [];
    stepInPlace(s, null, 24 * (balance.adventurer.recruitStayDays + 1));
    for (const id of ids) expect(s.adventurers[id]).toBeUndefined();
  });

  it('refuses to hire past room capacity', () => {
    const s = newGame('tavern-3');
    let hired = 0;
    for (let d = 0; d < 6; d++) {
      toEvening(s);
      for (const a of Object.values(s.adventurers).filter((x) => x.status === 'recruit')) {
        stepInPlace(s, { type: 'RECRUIT', adventurerId: a.id }, 0);
        hired++;
      }
      stepInPlace(s, null, 1);
    }
    const housed = Object.values(s.adventurers).filter((a) => a.status === 'resident' || a.status === 'expedition').length;
    expect(hired).toBeGreaterThan(0);
    expect(housed).toBeLessThanOrEqual(balance.recruitment.baseResidents);
  });

  it('buying, equipping and selling moves gold and items correctly', () => {
    const s = newGame('tavern-4');
    const gold = s.gold;
    stepInPlace(s, { type: 'BUY', kind: 'sword', tier: 1 }, 0);
    expect(s.gold).toBeLessThan(gold);
    const swordId = s.stash.find((id) => s.items[id].kind === 'sword')!;
    const fighter = Object.values(s.adventurers)[0];
    stepInPlace(s, { type: 'EQUIP', adventurerId: fighter.id, itemId: swordId }, 0);
    expect(fighter.equipment.weapon).toBe(swordId);
    expect(s.stash).not.toContain(swordId);
    stepInPlace(s, { type: 'UNEQUIP', adventurerId: fighter.id, slot: 'weapon' }, 0);
    expect(s.stash).toContain(swordId);
    const before = s.gold;
    stepInPlace(s, { type: 'SELL', itemId: swordId }, 0);
    expect(s.gold).toBeGreaterThan(before);
    expect(s.items[swordId]).toBeUndefined();
  });

  it('shop tiers depend on the forge', () => {
    const s = newGame('tavern-5');
    s.gold = 100000;
    const ev = stepInPlace(s, { type: 'BUY', kind: 'sword', tier: 3 }, 0);
    expect(ev[0].type).toBe('ACTION_REJECTED');
    stepInPlace(s, { type: 'BUY_UPGRADE', upgrade: 'forge' }, 0);
    stepInPlace(s, { type: 'BUY_UPGRADE', upgrade: 'forge' }, 0);
    const ok = stepInPlace(s, { type: 'BUY', kind: 'sword', tier: 3 }, 0);
    expect(ok[0].type).toBe('ITEM_BOUGHT');
  });

  it('residents pay room and board in the evening', () => {
    const s = newGame('tavern-6');
    const gold = s.gold;
    const events = toEvening(s);
    expect(events.some((e) => e.type === 'INCOME')).toBe(true);
    expect(s.gold).toBeGreaterThan(gold);
  });

  it('every event from a long run turns into text without throwing', () => {
    const s = newGame('tavern-7');
    s.gold = 5000;
    for (let d = 0; d < 40; d++) {
      const events = toEvening(s);
      for (const a of Object.values(s.adventurers).filter((x) => x.status === 'recruit')) {
        events.push(...stepInPlace(s, { type: 'RECRUIT', adventurerId: a.id }, 0));
      }
      const idle = Object.values(s.adventurers).filter((a) => a.status === 'resident');
      if (idle.length >= 2) {
        events.push(
          ...stepInPlace(s, {
            type: 'SEND_PARTY',
            memberIds: idle.slice(0, 4).map((a) => a.id),
            orders: { objective: { type: 'push', level: 2 + (d % 8), graveId: null, setPortal: false }, stance: 'aggressive', retreatHp: 0.2, returnByDay: null },
            counsel: false,
            supplyIds: [],
            startPortalId: null,
          }, 0),
        );
      }
      events.push(...stepInPlace(s, null, 1));
      for (const e of events) {
        const line = describeEvent(e, s);
        if (line) expect(line.text).not.toMatch(/\{\w+\}|undefined|NaN/);
      }
    }
  });
});
