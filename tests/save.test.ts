import { describe, expect, it } from 'vitest';
import { STATE_VERSION, newGame } from '../src/engine/state';
import { deserialize, serialize } from '../src/save/save';
import { runDays, stateHash } from './helpers';

describe('save round trip', () => {
  it('serialize -> deserialize -> step gives identical results', () => {
    const a = newGame('save');
    runDays(a, 10);
    const b = deserialize(serialize(a)).state;
    expect(stateHash(b)).toBe(stateHash(a));
    runDays(a, 10);
    runDays(b, 10);
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('migrates a version 1 save', () => {
    const s = newGame('old-save');
    const old = JSON.parse(serialize(s));
    old.version = 1;
    delete old.state.record.gravesRecovered;
    delete old.state.record.portalsOpened;
    delete old.state.record.revived;
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.version).toBe(STATE_VERSION);
    expect(loaded.state.record.gravesRecovered).toBe(0);
    expect(loaded.state.record.revived).toBe(0);
  });

  it('rejects saves from the future', () => {
    const json = JSON.stringify({ version: 9999, state: {}, log: [] });
    expect(() => deserialize(json)).toThrow();
  });
});
