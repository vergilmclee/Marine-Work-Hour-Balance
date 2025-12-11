
import { DayEntry, EntryType, HOURS_CONFIG } from '../types';

export interface CycleStats {
    totalWorked: number;
    trainingDays: number;
    transferredDays: number;
    adjustedTarget: number;
    netBalance: number;
}

/**
 * Calculates the statistics for a given cycle's days and starting balance.
 */
export const calculateCycleStats = (days: DayEntry[], startBalance: number): CycleStats => {
    let worked = 0;
    let trainingDays = 0;
    let transferredDays = 0;
    let targetReduction = 0;

    days.forEach(day => {
        if (day.type === EntryType.COURSE_TRAINING) {
            trainingDays++;
            // Use custom hours if set (e.g. 1-day course value), otherwise default to average
            const deduction = day.customHours > 0 ? day.customHours : HOURS_CONFIG.AVERAGE_DAILY_HOURS;
            targetReduction += deduction;
        } else if (day.type === EntryType.TRANSFERRED_OUT) {
            transferredDays++;
            // Allow custom hours to override average for transfers too (if specific times set)
            const deduction = day.customHours > 0 ? day.customHours : HOURS_CONFIG.AVERAGE_DAILY_HOURS;
            targetReduction += deduction;
        } else if (day.type === EntryType.TIME_OFF) {
            // Time Off (T/O): Working day, but hours are deducted.
            // worked = Regular Shift - Deduction
            const deduction = day.customHours || 0;
            const net = Math.max(0, HOURS_CONFIG.REGULAR_SHIFT_HOURS - deduction);
            worked += net;
        } else {
            let hours = 0;
            switch (day.type) {
                case EntryType.REGULAR_SHIFT: hours = HOURS_CONFIG.REGULAR_SHIFT_HOURS; break;
                case EntryType.LEAVE_VL:
                case EntryType.LEAVE_HOLIDAY: hours = HOURS_CONFIG.LEAVE_HOURS; break;
                case EntryType.CUSTOM: hours = day.customHours; break;
                case EntryType.OFF_DAY: hours = 0; break;
            }
            worked += hours;
        }
    });

    const adjustedTarget = Math.max(0, HOURS_CONFIG.TARGET_HOURS - targetReduction);
    
    // Balance = (Worked + StartBalance) - Target
    const netBalance = (worked + startBalance) - adjustedTarget;

    return {
        totalWorked: worked,
        trainingDays,
        transferredDays,
        adjustedTarget,
        netBalance
    };
};
