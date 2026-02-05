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

// Team rotation pattern for 18-day cycle based on the roster
// Pattern A (one of four patterns: A → B → C → D, repeating every 72 days)
// Each pattern assigns units to the 0930-1013 shift
// Pattern A sequence: 2, 1, 3, 2, 4, 3, 1/2, 4, 3, 1, 4, 2/3, 1, 4, 3, 1, 2, 4
// Day-off rotation for Pattern A: 4, 1, 2, 3
// Maps dayId (1-18) to which teams are working the shift
export const TEAM_ROTATION: Record<number, number[]> = {
  1: [2],      // Day 1: Unit 2
  2: [1],      // Day 2: Unit 1
  3: [3],      // Day 3: Unit 3
  4: [2],      // Day 4: Unit 2
  5: [4],      // Day 5: Unit 4
  6: [3],      // Day 6: Unit 3
  7: [1, 2],   // Day 7: Units 1 & 2 (paired shift)
  8: [4],      // Day 8: Unit 4
  9: [3],      // Day 9: Unit 3
  10: [1],     // Day 10: Unit 1
  11: [4],     // Day 11: Unit 4
  12: [2, 3],  // Day 12: Units 2 & 3 (paired shift)
  13: [1],     // Day 13: Unit 1
  14: [4],     // Day 14: Unit 4
  15: [3],     // Day 15: Unit 3
  16: [1],     // Day 16: Unit 1
  17: [2],     // Day 17: Unit 2
  18: [4]      // Day 18: Unit 4
};

export interface ReportRequestData {
  entries: DayEntry[];
  totalWorked: number;
  balance: number;
  adjustedTarget: number;
  trainingDays: number;
  previousBalance: number;
}

export type Language = 'en' | 'zh-HK';

export interface UserPrefs {
  startDate: string;
  staffNumber: string;
  language: Language;
  userTeam?: number; // User's assigned team (1-4)
}
