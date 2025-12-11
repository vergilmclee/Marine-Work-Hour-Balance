
import { DayEntry, HOURS_CONFIG, EntryType } from '../types';

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); // dd/mm/yyyy
}

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export const generateBalanceReport = (
    entries: DayEntry[], 
    totalWorked: number, 
    balance: number,
    adjustedTarget: number,
    trainingDays: number,
    previousBalance: number,
    staffNumber: string,
    cycleStartDate: Date,
    cycleEndDate: Date,
    effectiveTrainingStart?: Date,
    effectiveTrainingEnd?: Date
): Promise<string> => {
  
  // This function is purely local and synchronous in logic, but keeps the Promise signature 
  // to match potential future async needs or existing interface.
  
  // 1. Gather Data
  const trainingEntries = entries.filter(e => e.type === EntryType.COURSE_TRAINING);
  let courseName = 'Unspecified Course';
  let trainingStart = '';
  let trainingEnd = '';
  
  if (trainingEntries.length > 0) {
     const firstDayId = Math.min(...trainingEntries.map(e => e.dayId));
     const lastDayId = Math.max(...trainingEntries.map(e => e.dayId));
     
     let sDate = addDays(cycleStartDate, firstDayId - 1);
     let eDate = addDays(cycleStartDate, lastDayId - 1);

     if (effectiveTrainingStart) sDate = effectiveTrainingStart;
     if (effectiveTrainingEnd) eDate = effectiveTrainingEnd;

     trainingStart = formatDate(sDate);
     trainingEnd = formatDate(eDate);
     
     const entryWithName = trainingEntries.find(e => e.courseName && e.courseName.trim() !== '');
     if (entryWithName) courseName = entryWithName.courseName || 'Unspecified Course';
  }

  const transferEntry = entries.find(e => e.type === EntryType.TRANSFERRED_OUT);
  let transferDateStr = '';
  if (transferEntry) {
     const transferDayId = entries.findIndex(e => e.type === EntryType.TRANSFERRED_OUT) + 1;
     const lastWorkingDayId = Math.max(1, transferDayId - 1); 
     const lastWorkingDate = addDays(cycleStartDate, lastWorkingDayId - 1);
     transferDateStr = formatDate(lastWorkingDate);
  }

  const staffNoDisplay = staffNumber ? staffNumber : "[Staff No.]";
  const cycleStartStr = formatDate(cycleStartDate);
  const cycleEndStr = formatDate(cycleEndDate);
  
  // 2. Determine Situation
  let situation = 'E'; // Regular
  if (trainingDays > 0) {
      situation = balance < 0 ? 'A' : 'B';
  } else if (transferEntry) {
      situation = balance < 0 ? 'C' : 'D';
  }

  // 3. Build Statement based on template
  let statement = '';
  
  switch (situation) {
      case 'A': // Training Deficit
          statement = `${staffNoDisplay} took [V/L or Holiday] on [Date of Leave] to balance insufficient work hours in cycle ${cycleStartStr} to ${cycleEndStr} of attendance ${courseName} from/on ${trainingStart} to ${trainingEnd}.`;
          break;
      case 'B': // Training Surplus
          statement = `${staffNoDisplay} took time off lieu from [Time] to [Time] on [Date of OIL] due to surplus working hours in cycle ${cycleStartStr} to ${cycleEndStr} of attendance ${courseName} from/on ${trainingStart} to ${trainingEnd}.`;
          break;
      case 'C': // Redeploy Deficit
          statement = `${staffNoDisplay} took [V/L or Holiday] on [Date of Leave] to balance insufficient work hours in cycle ${cycleStartStr} to ${cycleEndStr} due to redeployment to other team on ${transferDateStr || '[Last Working Day]'}.`;
          break;
      case 'D': // Redeploy Surplus
          statement = `${staffNoDisplay} took time off lieu from [Time] to [Time] on [Date of OIL] due to surplus working hours in cycle ${cycleStartStr} to ${cycleEndStr} prior to redeployment to other team on ${transferDateStr || '[Last Working Day]'}.`;
          break;
      case 'E': // Regular
      default:
          const status = balance >= 0 ? "surplus" : "deficit";
          statement = `Work hours report for cycle ${cycleStartStr} to ${cycleEndStr}: Staff ${staffNoDisplay} has a net ${status} of ${Math.abs(balance).toFixed(2)} hours.`;
          break;
  }

  // 4. Build Log
  const irregularityNotes = entries
    .filter(e => e.type !== EntryType.REGULAR_SHIFT && e.type !== EntryType.OFF_DAY)
    .map(e => {
        let details = '';
        if (e.type === EntryType.COURSE_TRAINING) {
            details = `[Course: ${e.courseName || 'Unspecified'}]`;
            if (e.startTime && e.endTime) {
                details += ` ${e.startTime}-${e.endTime}`;
            }
        } else if (e.type === EntryType.TIME_OFF) {
            details = `(Deduction: ${e.customHours}hrs)`;
            if (e.startTime && e.endTime) {
                details += ` ${e.startTime}-${e.endTime}`;
            }
        }
        return `- **Day ${e.dayId}** (${formatDate(addDays(cycleStartDate, e.dayId - 1))}): ${e.type} ${e.type === EntryType.CUSTOM ? `(${e.customHours}hrs)` : ''} ${details} ${e.note ? `- Note: ${e.note}` : ''}`;
    })
    .join('\n');

  // 5. Final Markdown
  const report = `
### Balance Report
**Cycle:** ${cycleStartStr} — ${cycleEndStr}
**Staff:** ${staffNoDisplay}

**Stats:**
- Target: ${adjustedTarget.toFixed(2)}h
- Worked: ${totalWorked.toFixed(2)}h
- Balance: ${balance.toFixed(2)}h

---
### Formal Statement
> ${statement}

---
### Event Log
${irregularityNotes || "No irregularities recorded."}
`;

  return Promise.resolve(report);
};
