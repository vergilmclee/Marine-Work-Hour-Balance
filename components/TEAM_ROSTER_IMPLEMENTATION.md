# Team Roster Display - Implementation Guide

## Overview
This enhancement adds team assignment visibility to the Work Hour Balancer app, showing which unit (1, 2, 3, or 4) is working each shift according to the 18-day rotation pattern from your roster.

## Key Changes

### 1. **Team Rotation Pattern** (types.ts)
Added `TEAM_ROTATION` constant that maps each day (1-18) to the working teams:
- Based on the roster pattern from the PDF
- Handles both single-team and multi-team days
- Example: Day 7 has teams 1 & 2 working together

```typescript
export const TEAM_ROTATION: Record<number, number[]> = {
  1: [2],      // Day 1: Team 2 works
  2: [1],      // Day 2: Team 1 works
  3: [3],      // Day 3: Team 3 works
  // ... continues for all 18 days
};
```

### 2. **Enhanced Data Structure** (types.ts)
- Added `assignedTeam` field to `DayEntry` interface
- Added `userTeam` field to `UserPrefs` interface for user's team assignment

### 3. **Visual Team Indicators** (CalendarCell.tsx)
Each calendar cell now shows:
- **Team badges**: Small colored circles (1-4) showing which teams are working
  - Team 1: Red
  - Team 2: Blue  
  - Team 3: Green
  - Team 4: Yellow
- **Highlight ring**: Golden ring around cells when user's team is working
- Badges appear in top-right corner alongside note indicators

### 4. **Team Selection** (Additions needed in App.tsx)
Add team selector in the welcome screen and settings:
```tsx
<div className="space-y-2">
  <label className="text-xs font-bold">Select Your Team</label>
  <div className="grid grid-cols-4 gap-2">
    {[1,2,3,4].map(team => (
      <button 
        onClick={() => setUserTeam(team)}
        className={`p-3 rounded-xl ${userTeam === team ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
      >
        Unit {team}
      </button>
    ))}
  </div>
</div>
```

## Integration Steps

### Step 1: Replace Files
Replace these files in your project with the enhanced versions:
1. `types.ts` - Core data structures with team support
2. `components/CalendarCell.tsx` - Calendar cell with team badges
3. `services/storageService.ts` - Storage with team field
4. `utils/translations.ts` - Added team-related strings

### Step 2: Update App.tsx
Add these changes to `App.tsx`:

1. **Add userTeam state**:
```tsx
const [userTeam, setUserTeam] = useState<number | undefined>();
```

2. **Load/save userTeam in useEffect**:
```tsx
useEffect(() => {
  const prefs = loadUserPrefs();
  setUserTeam(prefs.userTeam);
  // ... existing code
}, []);

useEffect(() => {
  saveUserPrefs({ startDate, staffNumber, language, userTeam });
}, [startDate, staffNumber, language, userTeam]);
```

3. **Add team selector to welcome screen** (before language buttons):
```tsx
<div>
  <label className="text-xs font-bold uppercase text-slate-400 mb-1.5 block tracking-wider">
    {t('select_team')}
  </label>
  <div className="grid grid-cols-4 gap-2">
    {[1,2,3,4].map(team => (
      <button
        key={team}
        onClick={() => setUserTeam(team)}
        className={`p-3 rounded-xl font-bold text-sm transition-all ${
          userTeam === team 
            ? 'bg-blue-600 text-white shadow-lg' 
            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
        }`}
      >
        {team}
      </button>
    ))}
  </div>
</div>
```

4. **Add team selector to settings drawer**:
```tsx
<div className="mb-3">
  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-2">
    {t('my_team')}
  </label>
  <div className="grid grid-cols-4 gap-1.5">
    {[1,2,3,4].map(team => (
      <button
        key={team}
        onClick={() => setUserTeam(team)}
        className={`py-2 rounded-lg text-xs font-bold transition-all ${
          userTeam === team
            ? 'bg-blue-500 text-white shadow-md'
            : 'bg-slate-900/50 text-slate-400 hover:bg-white/5'
        }`}
      >
        {team}
      </button>
    ))}
  </div>
</div>
```

5. **Pass userTeam to CalendarCell**:
```tsx
<CalendarCell 
  key={day.dayId} 
  entry={day} 
  date={getDayDate(day.dayId)}
  onClick={() => handleDayClick(day)}
  userTeam={userTeam}  // Add this prop
/>
```

## How It Works

1. **Pattern Recognition**: The `TEAM_ROTATION` constant follows the 18-day pattern from your roster
2. **Visual Indicators**: Small numbered circles show which teams work each day
3. **User Highlighting**: Days when the user's team works get a golden ring highlight
4. **Multi-Team Days**: Days 7 and 12 show multiple team badges (e.g., teams 1&2, or 2&3)

## Example Display

```
┌─────────────┐
│ 15     ②③   │  <- Team 2 & 3 working
│             │
│  💼         │
│  WORK       │
└─────────────┘

┌─────────────┐  <- Golden ring when user's team
│ 16  ④🟡     │     is working (Team 4 in this case)
│             │
│  💼         │
│  WORK       │
└─────────────┘
```

## Benefits

1. **At-a-glance roster view**: See which teams are scheduled without opening each day
2. **Personal awareness**: Golden highlight shows your working days immediately
3. **Team coordination**: Easy to see overlap days when multiple teams work together
4. **Roster compliance**: Visual verification that your entries match the official roster pattern

## Testing

1. Verify team badges appear on work days (days with REGULAR_SHIFT type)
2. Check that the rotation pattern matches your PDF roster
3. Confirm the golden ring appears when your selected team is working
4. Test multi-team days (Day 7: teams 1&2, Day 12: teams 2&3)
5. Verify team selection persists after app restart

## Notes

- Team badges only appear on `REGULAR_SHIFT` days
- The pattern repeats every 18 days across all cycles
- Team colors are consistent: Red=1, Blue=2, Green=3, Yellow=4
- Days off (OFF_DAY type) don't show team badges
