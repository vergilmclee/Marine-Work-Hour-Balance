
export type Language = 'en' | 'zh-HK';

export enum EntryType {
  REGULAR_SHIFT = 'REGULAR_SHIFT',
  OFF_DAY = 'OFF_DAY',
  LEAVE_VL = 'LEAVE_VL',
  LEAVE_HOLIDAY = 'LEAVE_HOLIDAY',
  COURSE_TRAINING = 'COURSE_TRAINING',
  TRANSFERRED_OUT = 'TRANSFERRED_OUT',
  TIME_OFF = 'TIME_OFF',
  CUSTOM = 'CUSTOM'
}

export interface DayEntry {
  dayId: number;
  type: EntryType;
  customHours: number;
  note?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  courseName?: string;
  courseLocation?: string;
  assignedTeam?: number;
}

export interface UserPrefs {
  startDate: string;
  staffNumber: string;
  language: Language;
}

export const HOURS_CONFIG = {
  // Configuration based on standard 18-day cycle with 123.6h target
  TARGET_HOURS: 123.6,
  // 123.6 / 18 = 6.8666...
  AVERAGE_DAILY_HOURS: 123.6 / 18,
  // Standard Shift typically 8.75h (8h 45m)
  REGULAR_SHIFT_HOURS: 8.75, 
  // Leave value specified in report logic (8.24h)
  LEAVE_HOURS: 8.24
};

// Placeholder rotation pattern - can be customized
export const TEAM_ROTATION: Record<number, number[]> = {
  1: [1, 2], 2: [1, 2], 3: [1, 2], 4: [3, 4], 5: [3, 4], 6: [3, 4],
  7: [1, 3], 8: [1, 3], 9: [2, 4], 10: [2, 4], 11: [1, 4], 12: [1, 4],
  13: [2, 3], 14: [2, 3], 15: [1, 2], 16: [3, 4], 17: [1, 3], 18: [2, 4]
};
    