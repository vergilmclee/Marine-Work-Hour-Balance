
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
}

export const HOURS_CONFIG = {
  CYCLE_DAYS: 18,
  TARGET_HOURS: 123.6,
  REGULAR_SHIFT_HOURS: 24.72,
  LEAVE_HOURS: 8.24,
  AVERAGE_DAILY_HOURS: 6.866666666666667, // 123.6 / 18
};

export interface ReportRequestData {
  entries: DayEntry[];
  totalWorked: number;
  balance: number;
  adjustedTarget: number;
  trainingDays: number;
  previousBalance: number;
}

export interface UserPrefs {
  startDate: string;
  staffNumber: string;
}
