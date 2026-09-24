import { balance } from './balance';
import type { GameState } from './types';
import { clamp } from './util';

export function changeReputation(s: GameState, delta: number): void {
  const mult = delta > 0 ? balance.reputation.commonRoomGain[s.upgrades.commonRoom] : 1;
  s.reputation = clamp(s.reputation + delta * mult, 0, balance.reputation.max);
}
