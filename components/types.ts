
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
// Maps dayId (1-18) to which teams are working
export const TEAM_ROTATION: Record<number, number[]> = {
  1: [2],      // Day 1: Team 2 works
  2: [1],      // Day 2: Team 1 works
  3: [3],      // Day 3: Team 3 works
  4: [2],      // Day 4: Team 2 works
  5: [4],      // Day 5: Team 4 works
  6: [3],      // Day 6: Team 3 works
  7: [1, 2],   // Day 7: Teams 1 & 2 work
  8: [4],      // Day 8: Team 4 works
  9: [3],      // Day 9: Team 3 works
  10: [1],     // Day 10: Team 1 works
  11: [4],     // Day 11: Team 4 works
  12: [2, 3],  // Day 12: Teams 2 & 3 work
  13: [1],     // Day 13: Team 1 works
  14: [4],     // Day 14: Team 4 works
  15: [3],     // Day 15: Team 3 works
  16: [1],     // Day 16: Team 1 works
  17: [2],     // Day 17: Team 2 works
  18: [4]      // Day 18: Team 4 works
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
