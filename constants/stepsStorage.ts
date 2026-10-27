import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DailyStepData {
  date: string; // ISO date string YYYY-MM-DD
  totalSteps: number;
  hourlySteps: number[]; // 24 entries, one per hour
}

const STEPS_KEY = (userId: string) => `@stridetrack_steps_${userId}`;
const MOCK_SEEDED_KEY = (userId: string) => `@stridetrack_steps_seeded_${userId}`;

/** Helper to format a Date object as local YYYY-MM-DD */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return a YYYY-MM-DD string for a date offset from today */
export function dateString(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatLocalDate(d);
}

/** Parse a YYYY-MM-DD string to a Date object (midnight local) */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a YYYY-MM-DD string as "Mon Sep 14" */
export function formatDayLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Format a YYYY-MM-DD string as "Sep 8 – Sep 14, 2026" for week header */
export function formatWeekRange(startDateStr: string, endDateStr: string): string {
  const s = parseDate(startDateStr);
  const e = parseDate(endDateStr);
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = s.getMonth() === e.getMonth();
  const year = e.getFullYear();
  const sm = s.toLocaleDateString('en-US', { month: 'short' });
  const em = e.toLocaleDateString('en-US', { month: 'short' });
  if (sameMonth) {
    return `${sm} ${s.getDate()} – ${e.getDate()}, ${year}`;
  }
  if (sameYear) {
    return `${sm} ${s.getDate()} – ${em} ${e.getDate()}, ${year}`;
  }
  return `${sm} ${s.getDate()}, ${s.getFullYear()} – ${em} ${e.getDate()}, ${year}`;
}

/** Return the Monday of the week containing the given date */
export function getMondayOf(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Compute the week offset (0 = this week, -1 = last week, etc.) for a given YYYY-MM-DD date string */
export function getWeekOffsetForDate(dateStr: string): number {
  const targetDate = parseDate(dateStr);
  const targetMonday = getMondayOf(targetDate);
  const thisMonday = getMondayOf(new Date());
  const diffMs = targetMonday.getTime() - thisMonday.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.min(diffWeeks, 0);
}

/** Get the 7 date strings (Mon–Sun) for a given week offset from the current week */
export function getWeekDates(weekOffset: number = 0): string[] {
  const monday = getMondayOf(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return formatLocalDate(d);
  });
}

/** Generate realistic-looking hourly step distribution for a day */
function generateHourlySteps(totalSteps: number): number[] {
  // Typical human step distribution:
  // quiet night 0-6, morning peak 7-9, midday 10-12, afternoon peak 15-18, evening 19-21, quiet 22-23
  const weights = [
    0.001, 0.001, 0.001, 0.001, 0.001, 0.003, // 0-5am: sleeping
    0.03,  0.08,  0.09,  0.07,  0.06,  0.06,  // 6-11am: morning
    0.07,  0.06,  0.055, 0.065, 0.08,  0.085, // 12-5pm: afternoon
    0.07,  0.065, 0.055, 0.04,  0.02,  0.005, // 6-11pm: evening wind-down
  ];
  const raw = weights.map(w => Math.round(totalSteps * w * (0.8 + Math.random() * 0.4)));
  // Normalize to match totalSteps
  const sum = raw.reduce((a, b) => a + b, 0);
  const scale = totalSteps / Math.max(sum, 1);
  const scaled = raw.map(v => Math.round(v * scale));
  // Fix rounding difference on last hour
  const diff = totalSteps - scaled.reduce((a, b) => a + b, 0);
  scaled[17] = Math.max(0, scaled[17] + diff);
  return scaled;
}

/** Generate mock step data for the past N days */
function generateMockData(stepsGoal: number, days: number = 28): DailyStepData[] {
  const data: DailyStepData[] = [];
  for (let i = 0; i < days; i++) {
    const offsetDays = -i;
    const dateStr = dateString(offsetDays);
    // Vary daily totals: 60%–130% of goal with occasional rest days
    const isRestDay = Math.random() < 0.12;
    const variation = isRestDay ? 0.15 + Math.random() * 0.35 : 0.6 + Math.random() * 0.7;
    const totalSteps = Math.round(stepsGoal * variation);
    const hourlySteps = generateHourlySteps(totalSteps);
    data.push({ date: dateStr, totalSteps, hourlySteps });
  }
  return data;
}

/** Seed mock data for a user if not already done */
export async function ensureMockDataSeeded(userId: string, stepsGoal: number = 8000): Promise<void> {
  const seedKey = MOCK_SEEDED_KEY(userId);
  const alreadySeeded = await AsyncStorage.getItem(seedKey);
  if (alreadySeeded) return;

  const mockData = generateMockData(stepsGoal, 35);
  const stepsKey = STEPS_KEY(userId);
  // Only write days that don't already exist
  const existing = await AsyncStorage.getItem(stepsKey);
  const map: Record<string, DailyStepData> = existing ? JSON.parse(existing) : {};
  for (const day of mockData) {
    if (!map[day.date]) {
      map[day.date] = day;
    }
  }
  await AsyncStorage.setItem(stepsKey, JSON.stringify(map));
  await AsyncStorage.setItem(seedKey, '1');
}

/** Load step data for a specific date. Returns null if no data. */
export async function loadDaySteps(userId: string, date: string): Promise<DailyStepData | null> {
  const raw = await AsyncStorage.getItem(STEPS_KEY(userId));
  if (!raw) return null;
  const map: Record<string, DailyStepData> = JSON.parse(raw);
  return map[date] ?? null;
}

/** Load step data for a week given the week's date strings (7 days Mon-Sun) */
export async function loadWeekSteps(userId: string, dates: string[]): Promise<DailyStepData[]> {
  const raw = await AsyncStorage.getItem(STEPS_KEY(userId));
  const map: Record<string, DailyStepData> = raw ? JSON.parse(raw) : {};
  return dates.map(date => map[date] ?? { date, totalSteps: 0, hourlySteps: new Array(24).fill(0) });
}

/** Load all recorded daily step data for a user */
export async function loadAllStepData(userId: string): Promise<Record<string, DailyStepData>> {
  const raw = await AsyncStorage.getItem(STEPS_KEY(userId));
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Add steps and activity from a completed workout to the user's daily and hourly steps storage.
 * Ensures workout steps immediately reflect in Activity Charts, Streaks, and Total calculations.
 */
export async function addStepsToUserHistory(
  userId: string,
  steps: number,
  dateISO?: string
): Promise<DailyStepData> {
  const d = dateISO ? new Date(dateISO) : new Date();
  const dateStr = formatLocalDate(d);
  const hour = d.getHours();

  const key = STEPS_KEY(userId);
  const raw = await AsyncStorage.getItem(key);
  const map: Record<string, DailyStepData> = raw ? JSON.parse(raw) : {};

  const existing = map[dateStr] ?? {
    date: dateStr,
    totalSteps: 0,
    hourlySteps: new Array(24).fill(0),
  };

  const updatedHourly = [...existing.hourlySteps];
  if (updatedHourly.length !== 24) {
    while (updatedHourly.length < 24) updatedHourly.push(0);
  }

  const addedSteps = Math.max(0, Math.round(steps));
  updatedHourly[hour] = (updatedHourly[hour] || 0) + addedSteps;
  const newTotal = existing.totalSteps + addedSteps;

  const updatedDay: DailyStepData = {
    date: dateStr,
    totalSteps: newTotal,
    hourlySteps: updatedHourly,
  };

  map[dateStr] = updatedDay;
  await AsyncStorage.setItem(key, JSON.stringify(map));
  return updatedDay;
}
