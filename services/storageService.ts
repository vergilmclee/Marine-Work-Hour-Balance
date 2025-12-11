
import { DayEntry, EntryType, UserPrefs } from '../types';

const STORAGE_KEY = 'shiftcycle_data_v1';
const PREFS_KEY = 'shiftcycle_prefs_v1';

interface CycleData {
  [cycleIndex: number]: {
    days: DayEntry[];
    previousBalance: number;
  };
}

export const generateEmptyCycle = (): DayEntry[] => {
  return Array.from({ length: 18 }, (_, i) => ({
    dayId: i + 1,
    type: EntryType.OFF_DAY,
    customHours: 0,
    note: ''
  }));
};

export const saveCycleData = (index: number, days: DayEntry[], previousBalance: number) => {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    const data: CycleData = existing ? JSON.parse(existing) : {};
    
    data[index] = {
      days,
      previousBalance
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save to localStorage", e);
  }
};

export const loadCycleData = (index: number): { days: DayEntry[], previousBalance: number } => {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (!existing) return { days: generateEmptyCycle(), previousBalance: 0 };
    
    const data: CycleData = JSON.parse(existing);
    const cycle = data[index];
    
    if (cycle) {
      return cycle;
    }
  } catch (e) {
    console.error("Failed to load from localStorage", e);
  }
  
  return { days: generateEmptyCycle(), previousBalance: 0 };
};

export const hasCycleData = (index: number): boolean => {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (!existing) return false;
    const data: CycleData = JSON.parse(existing);
    return !!data[index];
  } catch (e) {
    return false;
  }
};

export const saveUserPrefs = (prefs: UserPrefs) => {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
};

export const loadUserPrefs = (): UserPrefs => {
  try {
    const prefs = localStorage.getItem(PREFS_KEY);
    if (prefs) {
        const parsed = JSON.parse(prefs);
        // Ensure language exists for migration
        if (!parsed.language) parsed.language = 'en';
        return parsed;
    }
  } catch (e) {}
  
  // Default to June 15, 2024 as requested, default lang 'en'
  return { startDate: '2024-06-15', staffNumber: '', language: 'en' }; 
};

export const clearAllData = () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PREFS_KEY);
  localStorage.clear(); // Ensure comprehensive wipe
};

export const getBackupData = (): string => {
  const backup = {
    [STORAGE_KEY]: localStorage.getItem(STORAGE_KEY),
    [PREFS_KEY]: localStorage.getItem(PREFS_KEY)
  };
  return JSON.stringify(backup);
};

export const restoreBackupData = (jsonStr: string): boolean => {
  try {
    const backup = JSON.parse(jsonStr);
    if (!backup || typeof backup !== 'object') return false;

    // Clear existing known keys
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PREFS_KEY);

    if (backup[STORAGE_KEY]) {
      localStorage.setItem(STORAGE_KEY, backup[STORAGE_KEY]);
    }
    if (backup[PREFS_KEY]) {
      localStorage.setItem(PREFS_KEY, backup[PREFS_KEY]);
    }

    return true;
  } catch (e) {
    console.error("Failed to restore backup", e);
    return false;
  }
};
