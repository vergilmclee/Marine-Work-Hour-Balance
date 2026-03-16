export enum EntryType {
  REGULAR_SHIFT = 'REGULAR_SHIFT', // 24.72 hrs
  OFF_DAY = 'OFF_DAY', // 0 hrs
  LEAVE_VL = 'LEAVE_VL', // 8.24 hrs
  LEAVE_HOLIDAY = 'LEAVE_HOLIDAY', // 8.24 hrs
  COURSE_TRAINING = 'COURSE_TRAINING', // Reduces target
  TRANSFERRED_OUT = 'TRANSFERRED_OUT', // Reduces target (Redeployed)
  TIME_OFF = 'TIME_OFF', // Deducts from work hours (T/O)
  CUSTOM = 'CUSTOM' // User defined
}

export interface DayEntry {
  dayId: number;
  type: EntryType;
  customHours: number;
  note: string;
  courseName?: string;
  courseLocation?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  assignedTeam?: number; // 1, 2, 3, or 4 - which team is working this shift
}

export const HOURS_CONFIG = {
  CYCLE_DAYS: 18,
  TARGET_HOURS: 123.6,
  REGULAR_SHIFT_HOURS: 24.72,
  LEAVE_HOURS: 8.24,
  AVERAGE_DAILY_HOURS: 6.866666666666667, // 123.6 / 18
};

// Team rotation patterns for 18-day cycles
// Four patterns (A → B → C → D) repeat every 72 days
// Reference: August 8, 2024 = Pattern A, Day 1

// Pattern A: 2, 1, 3, 2, 4, 3, 1/2, 4, 3, 1, 4, 2/3, 1, 4, 3, 1, 2, 4
// Day-off rotation: 4, 1, 2, 3
const PATTERN_A: Record<number, number[]> = {
  1: [2], 2: [1], 3: [3], 4: [2], 5: [4], 6: [3],
  7: [1, 2], 8: [4], 9: [3], 10: [1], 11: [4], 12: [2, 3],
  13: [1], 14: [4], 15: [3], 16: [1], 17: [2], 18: [4]
};

// Pattern B: 1, 2, 3/4, 1, 2, 4, 3, 2, 4, 1, 3, 4, 1, 2/3, 4, 1, 2, 3
// Day-off rotation: 3, 1, 2, 4
const PATTERN_B: Record<number, number[]> = {
  1: [1], 2: [2], 3: [3, 4], 4: [1], 5: [2], 6: [4],
  7: [3], 8: [2], 9: [4], 10: [1], 11: [3], 12: [4],
  13: [1], 14: [2, 3], 15: [4], 16: [1], 17: [2], 18: [3]
};

// Pattern C: 1/4, 2, 3, 1, 4, 3, 1, 2, 4, 1, 2, 3, 4, 2, 3, 1, 2/4, 3
// Day-off rotation: 2, 3, 4, 1
const PATTERN_C: Record<number, number[]> = {
  1: [1, 4], 2: [2], 3: [3], 4: [1], 5: [4], 6: [3],
  7: [1], 8: [2], 9: [4], 10: [1], 11: [2], 12: [3],
  13: [4], 14: [2], 15: [3], 16: [1], 17: [2, 4], 18: [3]
};

// Pattern D: 1, 4, 2, 3, 4, 2, 1, 3, 2, 4, 1/3, 2, 4, 1, 3, 2, 1/4, 3
// Day-off rotation: 1, 3, 4, 2
const PATTERN_D: Record<number, number[]> = {
  1: [1], 2: [4], 3: [2], 4: [3], 5: [4], 6: [2],
  7: [1], 8: [3], 9: [2], 10: [4], 11: [1, 3], 12: [2],
  13: [4], 14: [1], 15: [3], 16: [2], 17: [1, 4], 18: [3]
};

const PATTERNS = [PATTERN_A, PATTERN_B, PATTERN_C, PATTERN_D];

// Reference date for pattern calculation (August 8, 2024 = Pattern A, Day 1)
const PATTERN_REFERENCE_DATE = new Date('2024-08-08');

/** SLU (Ship Leave Unit) fixed anchor day — cycle 0 starts on this date. MSSU uses user-configured startDate. */
export const SLU_ANCHOR_DATE = '2026-03-01';

/**
 * Get the team rotation pattern for a specific date
 * @param targetDate - The date to get the pattern for
 * @returns The team rotation pattern for that date
 */
export function getTeamRotationForDate(targetDate: Date = new Date()): Record<number, number[]> {
  // Calculate days since reference date
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const reference = new Date(PATTERN_REFERENCE_DATE);
  reference.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - reference.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Determine which 18-day block we're in (can be negative for dates before reference)
  const blockIndex = Math.floor(diffDays / 18);

  // Determine which pattern (0-3 for A-D), handling negative indices
  const patternIndex = ((blockIndex % 4) + 4) % 4;

  return PATTERNS[patternIndex];
}

/**
 * Get the pattern name (A, B, C, or D) for a specific date
 * @param targetDate - The date to get the pattern name for
 * @returns The pattern name ('A', 'B', 'C', or 'D')
 */
export function getPatternNameForDate(targetDate: Date = new Date()): string {
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const reference = new Date(PATTERN_REFERENCE_DATE);
  reference.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - reference.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const blockIndex = Math.floor(diffDays / 18);
  const patternIndex = ((blockIndex % 4) + 4) % 4;

  return ['A', 'B', 'C', 'D'][patternIndex];
}

// For backward compatibility - uses current date
export const TEAM_ROTATION = getTeamRotationForDate();

export interface ReportRequestData {
  entries: DayEntry[];
  totalWorked: number;
  balance: number;
  adjustedTarget: number;
  trainingDays: number;
  previousBalance: number;
}

export type Language = 'en' | 'zh-HK';
export type Division = 'MSSU' | 'SLU';
export type FontSize = 'small' | 'medium' | 'large';

export interface UserPrefs {
  startDate: string;
  staffNumber: string;
  language: Language;
  userTeam?: number; // MSSU: team 1-4
  division?: Division;
  fontSize?: FontSize;
  sluUnit?: string; // SLU: C2/C5/C8/C9
  sluTeam?: string; // SLU: A/B/C
}

// ── SLU Roster Logic ──

export const SLU_UNITS = ['C2', 'C5', 'C8', 'C9'] as const;
export type SluUnit = typeof SLU_UNITS[number];
export const SLU_TEAMS = ['A', 'B', 'C'] as const;

export const SLU_TIME_SLOTS = [
  { start: '08:45', end: '09:28' },
  { start: '09:30', end: '10:13' },
  { start: '10:15', end: '10:58' },
  { start: '11:00', end: '11:43' },
];

export const SLU_DURATION_MIN = 1483; // 24h 43m
export const SLU_DURATION_HRS = 24.72;

export const SLU_BASE_UNIT_SLOT: Record<string, number> = {
  C5: 0, C8: 1, C9: 2, C2: 3,
};

/** SLU cycle index and date math use this anchor; kept in sync with SLU_ANCHOR_DATE. */
export const SLU_BASE_CYCLE_START = SLU_ANCHOR_DATE;

export type SluAssignment = { C5: string; C8: string; C9: string; C2: string };

// 18-day assignment pattern (cell values like "5A", "8C", "" = OFF)
export const SLU_ASSIGNMENT_PATTERN: SluAssignment[] = [
  { C5: '5A', C8: '8A', C9: '9A', C2: '2A' },
  { C5: '5B', C8: '8B', C9: '9B', C2: '2B' },
  { C5: '',   C8: '8C', C9: '9C', C2: '2C' },
  { C5: '5A', C8: '',   C9: '9A', C2: '2A' },
  { C5: '5B', C8: '8B', C9: '',   C2: '2B' },
  { C5: '5C', C8: '8C', C9: '9C', C2: ''   },
  { C5: '',   C8: '8A', C9: '9A', C2: '2A' },
  { C5: '5B', C8: '',   C9: '9B', C2: '2B' },
  { C5: '5C', C8: '8C', C9: '',   C2: '2C' },
  { C5: '5A', C8: '8A', C9: '9A', C2: ''   },
  { C5: '',   C8: '8B', C9: '9B', C2: '2B' },
  { C5: '5C', C8: '',   C9: '9C', C2: '2C' },
  { C5: '5A', C8: '8A', C9: '',   C2: '2A' },
  { C5: '5B', C8: '8B', C9: '9B', C2: ''   },
  { C5: '',   C8: '8C', C9: '9C', C2: '2C' },
  { C5: '5A', C8: '',   C9: '9A', C2: '2A' },
  { C5: '5B', C8: '8B', C9: '',   C2: '2B' },
  { C5: '5C', C8: '8C', C9: '9C', C2: ''   },
];

/** Parse a cell like "8C" → { unit: "C8", team: "C" } or null if OFF */
export function parseSluCell(cell: string): { unit: string; team: string } | null {
  if (!cell || !cell.trim()) return null;
  const clean = cell.replace(/\*/g, '');
  const match = clean.match(/([2589])([ABC])/i);
  if (!match) return null;
  return { unit: `C${match[1]}`, team: match[2].toUpperCase() };
}

/** Get the time slot index for a unit in a given cycle */
export function getSluSlot(unit: string, cycleIndex: number): number {
  const base = SLU_BASE_UNIT_SLOT[unit] ?? 0;
  return ((base + cycleIndex) % 4 + 4) % 4;
}

/** Get SLU assignments for a specific day in the cycle (0-indexed dayInCycle) */
export function getSluAssignmentsForDay(dayInCycle: number): SluAssignment {
  return SLU_ASSIGNMENT_PATTERN[dayInCycle] || { C5: '', C8: '', C9: '', C2: '' };
}

/** Timezone-safe calendar day difference using UTC to avoid DST issues */
export function calendarDayDiff(anchorIso: string, target: Date): number {
  const [ay, am, ad] = anchorIso.split('-').map(Number);
  const anchorUtc = Date.UTC(ay, am - 1, ad);
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.floor((targetUtc - anchorUtc) / (1000 * 60 * 60 * 24));
}

/** Get cycle index from a date relative to SLU base */
export function getSluCycleIndex(targetDate: Date): number {
  const diffDays = calendarDayDiff(SLU_BASE_CYCLE_START, targetDate);
  return Math.floor(diffDays / 18);
}

/** Get the start and end dates of a cycle given an anchor date string and cycle index */
export function getCycleStartEnd(anchorIso: string, cycleIndex: number): { start: Date; end: Date } {
  const [y, m, d] = anchorIso.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() + cycleIndex * 18);
  const end = new Date(start);
  end.setDate(end.getDate() + 17);
  return { start, end };
}

/** Get cycle index for any anchor date string */
export function getCycleIndexFromAnchor(anchorIso: string, targetDate: Date): number {
  const diffDays = calendarDayDiff(anchorIso, targetDate);
  return Math.floor(diffDays / 18);
}

