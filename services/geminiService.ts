
import { DayEntry, HOURS_CONFIG, EntryType, Language } from '../types';
import { TRANSLATIONS } from '../utils/translations';

const formatDate = (date: Date, lang: Language): string => {
  return date.toLocaleDateString(lang === 'zh-HK' ? 'zh-HK' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
    language: Language = 'en',
    effectiveTrainingStart?: Date,
    effectiveTrainingEnd?: Date
): Promise<string> => {
  
  const T = TRANSLATIONS[language];

  // 1. Gather Data
  const trainingEntries = entries.filter(e => e.type === EntryType.COURSE_TRAINING);
  let courseName = language === 'zh-HK' ? '未指定課程' : 'Unspecified Course';
  let trainingStart = '';
  let trainingEnd = '';
  
  if (trainingEntries.length > 0) {
     const firstDayId = Math.min(...trainingEntries.map(e => e.dayId));
     const lastDayId = Math.max(...trainingEntries.map(e => e.dayId));
     
     let sDate = addDays(cycleStartDate, firstDayId - 1);
     let eDate = addDays(cycleStartDate, lastDayId - 1);

     if (effectiveTrainingStart) sDate = effectiveTrainingStart;
     if (effectiveTrainingEnd) eDate = effectiveTrainingEnd;

     trainingStart = formatDate(sDate, language);
     trainingEnd = formatDate(eDate, language);
     
     const entryWithName = trainingEntries.find(e => e.courseName && e.courseName.trim() !== '');
     if (entryWithName) courseName = entryWithName.courseName || courseName;
  }

  const transferEntry = entries.find(e => e.type === EntryType.TRANSFERRED_OUT);
  let transferDateStr = '';
  if (transferEntry) {
     const transferDayId = entries.findIndex(e => e.type === EntryType.TRANSFERRED_OUT) + 1;
     const lastWorkingDayId = Math.max(1, transferDayId - 1); 
     const lastWorkingDate = addDays(cycleStartDate, lastWorkingDayId - 1);
     transferDateStr = formatDate(lastWorkingDate, language);
  }

  const staffNoDisplay = staffNumber ? staffNumber : "[Staff No.]";
  const cycleStartStr = formatDate(cycleStartDate, language);
  const cycleEndStr = formatDate(cycleEndDate, language);
  
  // 2. Determine Situation
  let situation = 'E'; // Regular
  if (trainingDays > 0) {
      situation = balance < 0 ? 'A' : 'B';
  } else if (transferEntry) {
      situation = balance < 0 ? 'C' : 'D';
  }

  // 3. Build Statement based on template
  let statement = '';
  
  // Note: These statement templates are slightly complex to extract to translations.ts perfectly due to dynamic variable insertion.
  // Constructing them here using simple localized logic.
  
  const txt_staff = staffNoDisplay;
  const txt_cycle = `${cycleStartStr} - ${cycleEndStr}`;
  
  if (language === 'zh-HK') {
      switch (situation) {
          case 'A': // Training Deficit
              statement = `${txt_staff} 於 [日期] 申請了 [年假/假期] 以平衡在週期 ${txt_cycle} 期間因參加 ${courseName} (${trainingStart} 至 ${trainingEnd}) 而不足的工作時數。`;
              break;
          case 'B': // Training Surplus
              statement = `${txt_staff} 於 [日期] [時間] 至 [時間] 進行補休，以抵銷在週期 ${txt_cycle} 期間因參加 ${courseName} (${trainingStart} 至 ${trainingEnd}) 而產生的盈餘工時。`;
              break;
          case 'C': // Redeploy Deficit
              statement = `${txt_staff} 於 [日期] 申請了 [年假/假期] 以平衡在週期 ${txt_cycle} 期間因於 ${transferDateStr || '[最後工作日]'} 調配至其他團隊而不足的工作時數。`;
              break;
          case 'D': // Redeploy Surplus
              statement = `${txt_staff} 於 [日期] [時間] 至 [時間] 進行補休，以抵銷在週期 ${txt_cycle} 期間因於 ${transferDateStr || '[最後工作日]'} 調配至其他團隊前所產生的盈餘工時。`;
              break;
          default:
              if (balance >= 0) {
                 statement = `員工 ${txt_staff} 於週期 ${txt_cycle} 累積了 ${balance.toFixed(2)} 小時的淨盈餘。此盈餘可用於補休 (OIL)。`;
              } else {
                 statement = `員工 ${txt_staff} 於週期 ${txt_cycle} 有 ${Math.abs(balance).toFixed(2)} 小時的淨赤字，需透過假期或額外職務進行調整。`;
              }
              break;
      }
  } else {
      switch (situation) {
          case 'A': // Training Deficit
              statement = `${txt_staff} took [V/L or Holiday] on [Date of Leave] to balance insufficient work hours in cycle ${txt_cycle} of attendance ${courseName} from/on ${trainingStart} to ${trainingEnd}.`;
              break;
          case 'B': // Training Surplus
              statement = `${txt_staff} took time off lieu from [Time] to [Time] on [Date of OIL] due to surplus working hours in cycle ${txt_cycle} of attendance ${courseName} from/on ${trainingStart} to ${trainingEnd}.`;
              break;
          case 'C': // Redeploy Deficit
              statement = `${txt_staff} took [V/L or Holiday] on [Date of Leave] to balance insufficient work hours in cycle ${txt_cycle} due to redeployment to other team on ${transferDateStr || '[Last Working Day]'}.`;
              break;
          case 'D': // Redeploy Surplus
              statement = `${txt_staff} took time off lieu from [Time] to [Time] on [Date of OIL] due to surplus working hours in cycle ${txt_cycle} prior to redeployment to other team on ${transferDateStr || '[Last Working Day]'}.`;
              break;
          default:
              if (balance >= 0) {
                 statement = `Staff ${txt_staff} has accumulated a net surplus of ${balance.toFixed(2)} hours for the cycle ${txt_cycle}. This surplus is available for Time Off in Lieu (OIL).`;
              } else {
                 statement = `Staff ${txt_staff} has a net deficit of ${Math.abs(balance).toFixed(2)} hours for the cycle ${txt_cycle}, requiring adjustment via Leave or additional duties.`;
              }
              break;
      }
  }

  // 4. Calculate Suggestions
  let suggestionSection = '';
  const formatTime = (hours: number) => {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return `${h}h ${m}m`;
  };

  if (balance > 0.05) {
      const fullShifts = Math.floor(balance / HOURS_CONFIG.REGULAR_SHIFT_HOURS);
      const shiftRemainder = balance % HOURS_CONFIG.REGULAR_SHIFT_HOURS;
      
      // Updated Leave Days Logic: Allow 0.5 increments (half days)
      const halfLeaveHours = HOURS_CONFIG.LEAVE_HOURS / 2;
      const leaveHalfSteps = Math.floor(balance / halfLeaveHours);
      const leaveDays = leaveHalfSteps / 2; // e.g. 0.5, 1.0, 1.5
      const leaveRemainder = balance - (leaveDays * HOURS_CONFIG.LEAVE_HOURS);

      suggestionSection = `
### 🍃 ${T.report_options}
${T.report_surplus_msg} **${balance.toFixed(2)}h**.
`;
      
      let optCount = 1;

      // Option: Full Shifts
      if (fullShifts > 0) {
          const label = language === 'zh-HK' ? `方案 ${optCount}` : `Option ${optCount}`;
          suggestionSection += `
**${label}: ${T.opt_full_shifts}**
- **${fullShifts} ${T.full_shift}**
- ${T.remaining}: **${formatTime(shiftRemainder)}** (${shiftRemainder.toFixed(2)}h)
`;
          optCount++;
      }

      // Option: Leave Days
      if (leaveDays > 0) {
          const label = language === 'zh-HK' ? `方案 ${optCount}` : `Option ${optCount}`;
          suggestionSection += `
**${label}: ${T.opt_leave_days} (8.24h)**
- **${leaveDays} ${T.leave_day}**
- ${T.remaining}: **${formatTime(leaveRemainder)}** (${leaveRemainder.toFixed(2)}h)
`;
          optCount++;
      }

      // Option: Exact Time Off (Always present)
      const label = language === 'zh-HK' ? `方案 ${optCount}` : `Option ${optCount}`;
      suggestionSection += `
**${label}: ${T.opt_exact}**
- ${T.take_exactly} **${formatTime(balance)}** ${T.off}.
`;

  } else if (balance < -0.05) {
      const deficit = Math.abs(balance);
      const leaveNeeded = deficit / HOURS_CONFIG.LEAVE_HOURS;
      const shiftsNeeded = deficit / HOURS_CONFIG.REGULAR_SHIFT_HOURS;
      
      suggestionSection = `
### ⚠️ ${T.report_deficit_res}
${T.report_deficit_msg} **${deficit.toFixed(2)}h**.

**${language === 'zh-HK' ? '恢復選項' : 'Recovery Options'}:**
- ${T.rec_leave} **${leaveNeeded.toFixed(1)} ${T.leave_day}** (V/L).
- ${T.rec_work} **${shiftsNeeded.toFixed(1)} ${T.rec_shifts}**.
- ${T.rec_deduct_to} **${deficit.toFixed(2)}h** T/O.
- ${T.rec_arrange}
`;
  }

  // 5. Build Log
  const irregularityNotes = entries
    .filter(e => e.type !== EntryType.REGULAR_SHIFT && e.type !== EntryType.OFF_DAY)
    .map(e => {
        let details = '';
        if (e.type === EntryType.COURSE_TRAINING) {
            details = `[${T.type_course}: ${e.courseName || 'Unspecified'}]`;
            if (e.startTime && e.endTime) {
                details += ` ${e.startTime}-${e.endTime}`;
            }
        } else if (e.type === EntryType.TIME_OFF) {
            details = `(${T.deduction}: ${e.customHours}h)`;
            if (e.startTime && e.endTime) {
                details += ` ${e.startTime}-${e.endTime}`;
            }
        }
        return `- **${formatDate(addDays(cycleStartDate, e.dayId - 1), language)}** (Day ${e.dayId}): ${e.type} ${e.type === EntryType.CUSTOM ? `(${e.customHours}h)` : ''} ${details} ${e.note ? `- Note: ${e.note}` : ''}`;
    })
    .join('\n');

  // 6. Final Markdown
  const report = `
### ${T.report_title}
**${T.report_cycle}:** ${cycleStartStr} — ${cycleEndStr}
**${T.report_staff}:** ${staffNoDisplay}

**${T.report_stats}:**
- ${T.target}: ${adjustedTarget.toFixed(2)}h
- ${T.worked}: ${totalWorked.toFixed(2)}h
- ${T.net_balance}: ${balance.toFixed(2)}h

${suggestionSection}

---
### ${T.report_formal}
> ${statement}

---
### ${T.report_log}
${irregularityNotes || T.no_irregularities}
`;

  return Promise.resolve(report);
};
