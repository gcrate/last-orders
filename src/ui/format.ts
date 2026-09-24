import { balance } from '../engine/balance';
import { SEASON_NAMES, calendar, dayOf } from '../engine/time';
import type { GameState, Stat } from '../engine/types';

export function dateText(s: GameState, hour = s.hour): string {
  const c = calendar(hour, s.yearOffset);
  return `${SEASON_NAMES[c.season]} ${c.day}, Year ${c.year}`;
}

export function clockText(hour: number): string {
  const h = hour % balance.time.hoursPerDay;
  return `${String(h).padStart(2, '0')}:00`;
}

export function logStamp(s: GameState, hour: number): string {
  return `Day ${dayOf(hour - s.generationStartHour)} ${clockText(hour)}`;
}

export function generationDay(s: GameState): number {
  return dayOf(s.hour - s.generationStartHour);
}

export const STAT_LABELS: Record<Stat, string> = {
  might: 'Might',
  agility: 'Agility',
  wits: 'Wits',
  resolve: 'Resolve',
  vitality: 'Vitality',
};

export const STAT_SHORT: Record<Stat, string> = {
  might: 'MIG',
  agility: 'AGI',
  wits: 'WIT',
  resolve: 'RES',
  vitality: 'VIT',
};

export const CLASS_LABELS = { fighter: 'Fighter', rogue: 'Rogue', cleric: 'Cleric', mage: 'Mage' } as const;

export function firstName(name: string): string {
  return name.split(' ')[0];
}

/** A word for a 0-100 value, for morale and loyalty. */
export function moodWord(v: number): string {
  if (v >= 80) return 'high';
  if (v >= 60) return 'good';
  if (v >= 40) return 'fair';
  if (v >= 20) return 'low';
  return 'broken';
}
