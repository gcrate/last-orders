import { balance } from './balance';

export function hoursPerDay(): number {
  return balance.time.hoursPerDay;
}

/** Day number within the whole game, starting at 1. */
export function dayOf(hour: number): number {
  return Math.floor(hour / balance.time.hoursPerDay) + 1;
}

export function hourOfDay(hour: number): number {
  return hour % balance.time.hoursPerDay;
}

export interface Calendar {
  day: number; // day within the season, 1-based
  season: number; // 0-3
  year: number; // 1-based
  hourOfDay: number;
}

export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;

export function calendar(hour: number, yearOffset = 0): Calendar {
  const t = balance.time;
  const totalDays = Math.floor(hour / t.hoursPerDay);
  const day = (totalDays % t.daysPerSeason) + 1;
  const seasonsTotal = Math.floor(totalDays / t.daysPerSeason);
  const season = seasonsTotal % t.seasonsPerYear;
  const year = Math.floor(seasonsTotal / t.seasonsPerYear) + 1 + yearOffset;
  return { day, season, year, hourOfDay: hour % t.hoursPerDay };
}

/** Hours from `hour` until the next occurrence of `targetHourOfDay` (always > 0). */
export function hoursUntil(hour: number, targetHourOfDay: number): number {
  const h = hourOfDay(hour);
  let diff = targetHourOfDay - h;
  if (diff <= 0) diff += balance.time.hoursPerDay;
  return diff;
}
