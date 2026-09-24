// Versioned save files. The engine state is plain JSON; the save wraps it with a version and
// runs migrations when loading an older shape.

import { STATE_VERSION } from '../engine/state';
import type { GameState } from '../engine/types';
import type { LogLine } from '../text/templates';

export const SAVE_KEY = 'last-orders-save';

export interface SaveFile {
  version: number;
  savedAt: string;
  state: GameState;
  log: LogLine[];
}

type Migration = (save: SaveFile) => SaveFile;

// migrations[n] upgrades a save from version n to n + 1.
const migrations: Record<number, Migration> = {
  // v2: generation records count graves recovered, portals opened and revivals.
  1: (save) => {
    const records = [save.state.record, ...(save.state.history ?? [])] as Partial<GameState['record']>[];
    for (const r of records) {
      r.gravesRecovered ??= 0;
      r.portalsOpened ??= 0;
      r.revived ??= 0;
    }
    return { ...save, version: 2 };
  },
};

export function serialize(state: GameState, log: LogLine[] = [], savedAt = ''): string {
  const save: SaveFile = { version: STATE_VERSION, savedAt, state, log };
  return JSON.stringify(save);
}

export function deserialize(json: string): SaveFile {
  let save = JSON.parse(json) as SaveFile;
  if (typeof save.version !== 'number') throw new Error('Not a Last Orders save file.');
  if (save.version > STATE_VERSION) throw new Error('This save is from a newer version of the game.');
  while (save.version < STATE_VERSION) {
    const migrate = migrations[save.version];
    if (!migrate) throw new Error(`No migration from save version ${save.version}.`);
    save = migrate(save);
  }
  save.state.version = STATE_VERSION;
  return save;
}

/** Browser helpers. Guarded so the module can be imported in Node. */
export function saveToStorage(state: GameState, log: LogLine[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SAVE_KEY, serialize(state, log.slice(-500), new Date().toISOString()));
}

export function loadFromStorage(): SaveFile | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return deserialize(raw);
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SAVE_KEY);
}
