import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DayEntry, EntryType, HOURS_CONFIG, Language, Division, FontSize, parseSluCell, getSluCycleIndex, SLU_ANCHOR_DATE, getCycleStartEnd, SLU_UNIT_TEAM_OPTIONS } from './types';
import CalendarCell from './components/CalendarCell';
import DayCard from './components/DayCard';
import StatsPanel from './components/StatsPanel';
import SituationWizard from './components/SituationWizard';
import { generateBalanceReport } from './services/geminiService';
import { loadCycleData, saveCycleData, loadUserPrefs, saveUserPrefs, clearAllData, hasCycleData, generateEmptyCycle, getBackupData, restoreBackupData } from './services/storageService';
import { calculateCycleStats } from './utils/balanceUtils';
import { Info, AlertCircle, Wand2, RefreshCcw, Calendar as CalendarIcon, ChevronLeft, ChevronRight, History, CalendarClock, Search, UserCircle, Lock, Menu, Settings, X, Save, PaintBucket, Check, Eraser, Download, Upload, Languages, Briefcase } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

// Custom Icon for High Speed Pursuit Craft (Port Side / Facing Left) - Updated to Sleek Yacht Profile
const PursuitCraft = ({ size = 24, className = "", fill = "none", ...props }: React.SVGProps<SVGSVGElement> & { size?: number | string, fill?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Hull */}
      <path d="M2 14c0 0 4.5-1.5 10.5-1.5h10v3H10.5C6 15.5 3 15 2 14z" fill={fill !== 'none' ? fill : 'none'} />

      {/* Cabin Superstructure */}
      <path d="M9.5 12.5l2.5-4h7l2 4" />
      {/* Window Split */}
      <path d="M13.5 8.5v4" />

      {/* Radar Arch / Mast */}
      <path d="M16 8.5l1.5-3.5h2" />
      <path d="M18.5 5l0.5-2" />

      {/* Bow Rail */}
      <path d="M3 12.5l3-1h3" />

      {/* Water Line */}
      <path d="M4 17h16" strokeDasharray="2 3" className="opacity-50" />
    </svg>
  );
};

// Days of week for calendar header
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const AppContent: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();

  //Add userTeam state
  const [userTeam, setUserTeam] = useState<number | undefined>();
  const [division, setDivision] = useState<Division>('MSSU');
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [sluSelection, setSluSelection] = useState<string | undefined>();
  const selectedSlu = useMemo(() => parseSluCell(sluSelection || ''), [sluSelection]);
  const selectedSluUnit = selectedSlu?.unit;
  const selectedSluTeam = selectedSlu?.team;


  // Cycle State
  const [cycleIndex, setCycleIndex] = useState(0); // 0 = Anchor cycle. Positive = future, Negative = past.
  const [days, setDays] = useState<DayEntry[]>([]); // Current loaded days
  const [previousBalance, setPreviousBalance] = useState<number>(0); // Carry over for current cycle
  const [isLinkedBalance, setIsLinkedBalance] = useState(false); // If true, prevBalance is auto-calculated

  // App State
  const [startDate, setStartDate] = useState<string>('');
  const [staffNumber, setStaffNumber] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<DayEntry | null>(null); // For modal
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Paint Mode State
  const [isPaintMode, setIsPaintMode] = useState(false);
  const [paintType, setPaintType] = useState<EntryType>(EntryType.REGULAR_SHIFT);

  // Dirty Checking Refs (To prevent auto-saving when just navigating)
  const lastLoadedDaysRef = useRef<string>('');
  const lastLoadedBalanceRef = useRef<number>(0);
  const isResettingRef = useRef(false);

  // --- Helper: Gap-Aware Previous Balance Calculation ---
  const getEffectivePreviousBalance = (targetIndex: number): { balance: number, isLinked: boolean } => {
    // 1. If we are at the anchor or before, use stored data directly
    if (targetIndex <= 0) {
      if (hasCycleData(targetIndex - 1)) {
        const { days, previousBalance } = loadCycleData(targetIndex - 1);
        const stats = calculateCycleStats(days, previousBalance);
        return { balance: stats.netBalance, isLinked: true };
      }
      return { balance: 0, isLinked: false };
    }

    // 2. Search backwards for the last cycle that actually has data
    let searchIndex = targetIndex - 1;
    let foundIndex: number | null = null;

    // Safety break: don't search back more than 100 cycles to avoid lag
    const limit = Math.max(-10, targetIndex - 100);

    while (searchIndex >= limit) {
      if (hasCycleData(searchIndex)) {
        foundIndex = searchIndex;
        break;
      }
      searchIndex--;
    }

    // 3. If found, calculate its end balance
    if (foundIndex !== null) {
      const { days, previousBalance } = loadCycleData(foundIndex);
      const stats = calculateCycleStats(days, previousBalance);
      return { balance: stats.netBalance, isLinked: true };
    }

    // 4. If no history found, check Cycle 0 specifically (as anchor fallback)
    if (hasCycleData(0)) {
      const { days, previousBalance } = loadCycleData(0);
      const stats = calculateCycleStats(days, previousBalance);
      return { balance: stats.netBalance, isLinked: true };
    }

    // 5. Default
    return { balance: 0, isLinked: false };
  };

  // --- Initialization ---
  useEffect(() => {
    const prefs = loadUserPrefs();
    setStartDate(prefs.startDate);
    setStaffNumber(prefs.staffNumber || '');
    setUserTeam(prefs.userTeam);
    setDivision(prefs.division || 'MSSU');
    setFontSize(prefs.fontSize || 'medium');
    const migratedSluSelection = prefs.sluSelection || (
      prefs.sluUnit && prefs.sluTeam ? `${prefs.sluUnit.replace(/^C/i, '')}${prefs.sluTeam.toUpperCase()}` : undefined
    );
    setSluSelection(migratedSluSelection);
    // Language is handled by Context, but we might want to sync if it changed externally? 
    // Usually Context handles initialization.

    let targetIndex = 0;

    // Calculate current cycle based on Today if start date exists
    if (prefs.startDate) {
      const [y, m, d] = prefs.startDate.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diffTime = today.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      // Cycle index is floor(days / 18)
      targetIndex = Math.floor(diffDays / 18);
    }

    setCycleIndex(targetIndex);

    const initialData = loadCycleData(targetIndex);
    setDays(initialData.days);

    lastLoadedDaysRef.current = JSON.stringify(initialData.days);
    lastLoadedBalanceRef.current = initialData.previousBalance;

    // Logic to determine initial balance state without overwriting saved data aggressively
    let initBalance = initialData.previousBalance;
    let initLinked = false;

    // We check if we *should* link for UI status
    const linkResult = getEffectivePreviousBalance(targetIndex);

    // Check conditions for applying linked balance
    // If no data exists for this specific cycle, rely on the calculated link balance.
    if (!hasCycleData(targetIndex)) {
      initBalance = linkResult.balance;
      initLinked = linkResult.isLinked;
    } else {
      // Use saved data, but check if it matches linked for UI
      if (linkResult.isLinked && Math.abs(linkResult.balance - initBalance) < 0.01) {
        initLinked = true;
      }
    }

    setPreviousBalance(initBalance);
    setIsLinkedBalance(initLinked);
    setIsInitialized(true);
  }, []);

  // --- Persist Data on Change (Only if Dirty) ---
  useEffect(() => {
    if (!isInitialized || isResettingRef.current) return;

    const currentDaysStr = JSON.stringify(days);
    const isDirty = currentDaysStr !== lastLoadedDaysRef.current || previousBalance !== lastLoadedBalanceRef.current;

    if (isDirty) {
      saveCycleData(cycleIndex, days, previousBalance);
      lastLoadedDaysRef.current = currentDaysStr;
      lastLoadedBalanceRef.current = previousBalance;
    }
  }, [days, previousBalance, cycleIndex, isInitialized]);

  // Save prefs immediately
  useEffect(() => {
    if (!isInitialized || isResettingRef.current) return;
    // Note: language is saved by setLanguage in context
    saveUserPrefs({
      startDate,
      staffNumber,
      language,
      userTeam,
      division,
      fontSize,
      sluSelection,
      // Keep legacy keys for backwards compatibility.
      sluUnit: selectedSluUnit,
      sluTeam: selectedSluTeam
    });
  }, [startDate, staffNumber, language, userTeam, division, fontSize, sluSelection, selectedSluUnit, selectedSluTeam, isInitialized]);

  // --- Cycle Navigation Handlers ---
  const handleCycleChange = (newIndex: number) => {
    if (cycleIndex !== newIndex && isInitialized) {
      saveCycleData(cycleIndex, days, previousBalance);
      lastLoadedDaysRef.current = JSON.stringify(days);
      lastLoadedBalanceRef.current = previousBalance;
    }

    setCycleIndex(newIndex);

    const data = loadCycleData(newIndex);
    setDays(data.days);

    lastLoadedDaysRef.current = JSON.stringify(data.days);

    let newBalance = data.previousBalance;
    let isLinked = false;

    const linkResult = getEffectivePreviousBalance(newIndex);

    if (!hasCycleData(newIndex)) {
      newBalance = linkResult.balance;
      isLinked = linkResult.isLinked;
    } else {
      newBalance = data.previousBalance;
      if (linkResult.isLinked && Math.abs(linkResult.balance - newBalance) < 0.01) {
        isLinked = true;
      }
    }

    setPreviousBalance(newBalance);
    setIsLinkedBalance(isLinked);
    lastLoadedBalanceRef.current = newBalance;

    setReport(null);
    setSelectedDay(null);
  };

  const handleJumpToToday = () => {
    if (!startDate) return;

    const [y, m, d] = startDate.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const newCycleIndex = Math.floor(diffDays / 18);
    if (newCycleIndex !== cycleIndex) {
      handleCycleChange(newCycleIndex);
    }
  };

  const handleDayUpdate = (updatedEntry: DayEntry) => {
    setDays(prev => prev.map(d => d.dayId === updatedEntry.dayId ? updatedEntry : d));
    if (selectedDay?.dayId === updatedEntry.dayId) {
      setSelectedDay(updatedEntry);
    }
  };

  const handleDayClick = (day: DayEntry) => {
    if (isPaintMode) {
      let newHours = 0;
      switch (paintType) {
        case EntryType.REGULAR_SHIFT: newHours = HOURS_CONFIG.REGULAR_SHIFT_HOURS; break;
        case EntryType.LEAVE_VL:
        case EntryType.LEAVE_HOLIDAY: newHours = HOURS_CONFIG.LEAVE_HOURS; break;
        default: newHours = 0;
      }
      handleDayUpdate({
        ...day,
        type: paintType,
        customHours: newHours
      });
    } else {
      setSelectedDay(day);
    }
  };

  const handleSituationApply = (updates: Partial<DayEntry>[]) => {
    setDays(prev => prev.map(d => d.dayId === d.dayId ? { ...d, ...updates.find(u => u.dayId === d.dayId) } : d));
  };

  const handleSituationApplyRange = (
    start: Date, end: Date, type: EntryType, note: string,
    courseName?: string, courseLocation?: string, customHours?: number,
    startTime?: string, endTime?: string, breakMinutes?: number
  ) => {
    if (!startDate) return;
    const [y, m, d] = startDate.split('-').map(Number);
    const globalStart = new Date(y, m - 1, d);

    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(0, 0, 0, 0);

    const updatesByCycle: Record<number, DayEntry[]> = {};

    let current = new Date(s);
    while (current <= e) {
      const diffTime = current.getTime() - globalStart.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const cIndex = Math.floor(diffDays / 18);
      const dayInCycle = ((diffDays % 18) + 18) % 18 + 1;

      if (!updatesByCycle[cIndex]) {
        if (cIndex === cycleIndex) {
          updatesByCycle[cIndex] = [...days];
        } else {
          updatesByCycle[cIndex] = loadCycleData(cIndex).days;
        }
      }

      const cycleDays = updatesByCycle[cIndex];
      const dayIdx = cycleDays.findIndex(d => d.dayId === dayInCycle);
      if (dayIdx !== -1) {
        cycleDays[dayIdx] = {
          ...cycleDays[dayIdx],
          type,
          note,
          courseName,
          courseLocation,
          customHours: customHours || 0,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          breakMinutes: breakMinutes || undefined
        };
      }

      current.setDate(current.getDate() + 1);
    }

    const sortedIndices = Object.keys(updatesByCycle).map(Number).sort((a, b) => a - b);
    let runningBalance: number | null = null;

    sortedIndices.forEach((idx, i) => {
      const cycleDays = updatesByCycle[idx];
      let startBal = 0;

      if (i === 0) {
        if (idx === cycleIndex) {
          startBal = previousBalance;
        } else {
          startBal = loadCycleData(idx).previousBalance;
        }
      } else {
        if (runningBalance !== null && idx === sortedIndices[i - 1] + 1) {
          startBal = runningBalance;
        } else {
          if (idx === cycleIndex) {
            startBal = previousBalance;
          } else {
            startBal = loadCycleData(idx).previousBalance;
          }
        }
      }

      const stats = calculateCycleStats(cycleDays, startBal);
      runningBalance = stats.netBalance;

      if (idx === cycleIndex) {
        setDays(cycleDays);
        if (i > 0 && idx === sortedIndices[i - 1] + 1) {
          setPreviousBalance(startBal);
          setIsLinkedBalance(true);
        }
      } else {
        saveCycleData(idx, cycleDays, startBal);
      }
    });
  };

  const cycleStats = useMemo(() => calculateCycleStats(days, previousBalance), [days, previousBalance]);

  const cycleStartDate = useMemo(() => {
    if (!startDate) return new Date();
    return getCycleStartEnd(startDate, cycleIndex).start;
  }, [startDate, cycleIndex]);

  const cycleEndDate = useMemo(() => {
    if (!startDate) return new Date();
    return getCycleStartEnd(startDate, cycleIndex).end;
  }, [startDate, cycleIndex]);

  const sluCycleIndex = useMemo(() => getSluCycleIndex(cycleStartDate), [cycleStartDate]);
  const sluCycleRange = useMemo(() => getCycleStartEnd(SLU_ANCHOR_DATE, sluCycleIndex), [sluCycleIndex]);

  const handleGenerateReport = async () => {
    setLoading(true);
    setReport(null);
    try {
      const result = await generateBalanceReport(
        days,
        cycleStats.totalWorked,
        cycleStats.netBalance,
        cycleStats.adjustedTarget,
        cycleStats.trainingDays,
        previousBalance,
        staffNumber,
        cycleStartDate,
        cycleEndDate,
        language
      );
      setReport(result);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetApp = () => {
    if (confirm(t('reset_confirm'))) {
      isResettingRef.current = true;
      setTimeout(() => {
        clearAllData();
        window.location.reload();
      }, 100);
    }
  };

  const handleBackup = () => {
    const dataStr = getBackupData();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shiftcycle_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        if (restoreBackupData(json)) {
          alert(t('restore_success'));
          window.location.reload();
        } else {
          alert(t('restore_fail'));
        }
      } catch (err) {
        alert(t('restore_fail'));
      }
    };
    reader.readAsText(file);
  };

  // Welcome / Setup Screen
  if (!startDate) {
    return (
      <div className="h-[100dvh] flex items-center justify-center p-6 bg-slate-50 overflow-hidden">
        <div className="max-w-sm w-full bg-white p-8 rounded-3xl shadow-2xl border border-slate-100">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-6 mx-auto shadow-sm">
            <PursuitCraft size={32} fill="currentColor" className="text-blue-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 text-center mb-2 tracking-tight">{t('app_name')}</h1>
          <p className="text-slate-500 text-center mb-8 text-sm">{t('welcome_message')}</p>

          {/* Team Selection */}
          <div className="space-y-4 mb-6">
            <label className="text-xs font-bold uppercase text-slate-400 mb-1.5 block tracking-wider">
              {t('select_team')}
            </label>
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(team => (
                <button
                  key={team}
                  onClick={() => setUserTeam(team)}
                  className={`p-4 rounded-2xl font-bold text-base transition-all shadow-sm ${userTeam === team
                    ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-400'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300'
                    }`}
                >
                  {team}
                </button>
              ))}
            </div>
          </div>

          {/* Language Selection */}
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => setLanguage('en')}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition-all ${language === 'en' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('zh-HK')}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition-all ${language === 'zh-HK' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              繁體中文
            </button>
          </div>

          {/* Start Date */}
          <div className="mt-8">
            <label className="text-xs font-bold uppercase text-slate-400 mb-1.5 block tracking-wider">
              {t('cycle_start_date')}
            </label>
            <input
              type="date"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-2.5 leading-relaxed bg-blue-50 p-2 rounded-lg text-blue-600">
              <Info size={10} className="inline mr-1" />
              {t('pick_first_day')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Helper to calculate date for a specific day in the cycle
  const getDayDate = (dayId: number) => {
    const d = new Date(startDate);
    // Add cycle offset (cycleIndex * 18 days) + day offset (dayId - 1)
    d.setDate(d.getDate() + (cycleIndex * 18) + (dayId - 1));
    return d;
  };

  // Main Dashboard
  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 relative overflow-hidden font-sans" style={{ zoom: fontSize === 'small' ? 0.85 : fontSize === 'large' ? 1.15 : 1 }}>
      {/* Top Bar */}
      <div className="bg-white px-3 pt-safe pb-1.5 shadow-sm z-10 sticky top-0 border-b border-slate-100">
        <div className="flex justify-between items-center pt-2">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              <Briefcase size={18} className="text-blue-600 shrink-0" />
              SHIFT CYCLE
            </h1>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider space-y-0.5">
              <p><span className="text-slate-500">{t('cycle_mssu')}:</span> {cycleStartDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {cycleEndDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
              <p><span className="text-slate-500">{t('cycle_slu')}:</span> {sluCycleRange.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {sluCycleRange.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => handleCycleChange(cycleIndex - 1)} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors active:scale-95"><ChevronLeft size={20} /></button>
            <button onClick={() => handleCycleChange(cycleIndex + 1)} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors active:scale-95"><ChevronRight size={20} /></button>
          </div>
        </div>
        <div className="flex gap-1.5 mt-1.5 pb-0.5">
          <button onClick={handleJumpToToday} title={t('jump_to_today')} className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center justify-center gap-1 text-[11px] font-bold active:scale-95"><CalendarClock size={13} />{t('jump_to_today')}</button>
          <button onClick={() => setIsWizardOpen(true)} title={t('situation_wizard')} className="flex-1 py-2 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors flex items-center justify-center gap-1 text-[11px] font-bold active:scale-95"><Wand2 size={13} />{t('situation_wizard')}</button>
          <button onClick={() => setShowSettings(true)} title={t('settings')} className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1 text-[11px] font-bold active:scale-95"><Settings size={13} />{t('settings')}</button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-2 pb-44 pt-2 scrollbar-hide">
        {/* Carried Over Balance Card */}
        <div className={`flex items-center justify-between px-3 py-1.5 mb-2 rounded-xl bg-white shadow-sm border ${previousBalance < 0 ? 'border-red-100' : 'border-slate-200'}`}>
          <div className="text-[10px] font-bold text-slate-400 uppercase leading-tight whitespace-pre-line">{t('carried_over')}</div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              value={previousBalance}
              onChange={(e) => {
                setPreviousBalance(parseFloat(e.target.value) || 0);
                setIsLinkedBalance(false);
              }}
              className={`text-right w-24 font-black text-xl bg-transparent border-none outline-none p-0 ${previousBalance < 0 ? 'text-red-500' : 'text-slate-800'}`}
            />
            {previousBalance !== 0 && (
              <button
                onClick={() => { setPreviousBalance(0); setIsLinkedBalance(false); }}
                className="p-1 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-95"
                title="Clear to 0"
              >
                <X size={14} />
              </button>
            )}
            <button
              onClick={() => {
                const { balance, isLinked } = getEffectivePreviousBalance(cycleIndex);
                setPreviousBalance(balance);
                setIsLinkedBalance(isLinked);
              }}
              className={`p-1 rounded-full transition-colors ${isLinkedBalance ? 'text-blue-200 hover:text-blue-600' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
              title="Recalculate / Sync Balance"
            >
              <RefreshCcw size={14} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] uppercase font-bold text-slate-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 auto-rows-fr">
          {(() => {
            const firstDate = getDayDate(1);
            const jsDay = firstDate.getDay(); // 0=Sun,1=Mon,...,6=Sat
            const startCol = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0,...,Sun=6

            const cells: React.ReactNode[] = [];
            let lastMonth = -1;

            for (let i = 0; i < startCol; i++) {
              cells.push(<div key={`empty-${i}`} />);
            }

            days.forEach((day) => {
              const date = getDayDate(day.dayId);
              const month = date.getMonth();

              if (month !== lastMonth) {
                if (lastMonth !== -1) {
                  const currentPos = (startCol + day.dayId - 1) % 7;
                  for (let i = 0; i < (7 - currentPos) % 7; i++) {
                    cells.push(<div key={`gap-${day.dayId}-${i}`} />);
                  }
                  const monthLabel = date.toLocaleDateString(language === 'zh-HK' ? 'zh-HK' : 'en-US', { month: 'long' });
                  cells.push(
                    <div key={`month-${month}`} className="col-span-7 flex items-center gap-2 py-1">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{monthLabel}</span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                  );
                  const newJsDay = date.getDay();
                  const newStartCol = newJsDay === 0 ? 6 : newJsDay - 1;
                  for (let i = 0; i < newStartCol; i++) {
                    cells.push(<div key={`empty2-${day.dayId}-${i}`} />);
                  }
                }
                lastMonth = month;
              }

              cells.push(
                <CalendarCell
                  key={day.dayId}
                  entry={day}
                  date={date}
                  onClick={() => handleDayClick(day)}
                  userTeam={userTeam}
                  division={division}
                  sluUnit={selectedSluUnit}
                  sluTeam={selectedSluTeam}
                  cycleIndex={cycleIndex}
                />
              );
            });

            return cells;
          })()}
        </div>
      </div>

      {/* Stats Panel */}
      <StatsPanel
        totalWorked={cycleStats.totalWorked}
        balance={cycleStats.netBalance}
        adjustedTarget={cycleStats.adjustedTarget}
        trainingDays={cycleStats.trainingDays}
        previousBalance={previousBalance}
        onGenerate={handleGenerateReport}
        isLoading={loading}
      />

      {/* Report Overlay */}
      {report && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm" onClick={() => setReport(null)} />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[110] pb-safe animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 pt-6 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Info size={20} /> {t('report_generated') || 'Generated Report'}</h2>
              <button onClick={() => setReport(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm">
            <DayCard
              entry={selectedDay}
              onClose={() => setSelectedDay(null)}
              onChange={handleDayUpdate}
              date={getDayDate(selectedDay.dayId)}
            />
          </div>
          {/* Click outside to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setSelectedDay(null)} />
        </div>
      )}

      {isWizardOpen && (
        <SituationWizard
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          days={days}
          startDate={new Date(startDate)}
          onApply={handleSituationApply}
          onApplyRange={handleSituationApplyRange}
        />
      )}

      {/* Settings Dialog */}
      {showSettings && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[50vh] overflow-y-auto pointer-events-auto">
              <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-2xl">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Settings size={18} /> {t('settings')}</h2>
                <button onClick={() => setShowSettings(false)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5 px-5 py-4">
              {/* Division Selection */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">Division</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['MSSU', 'SLU'] as Division[]).map(div => (
                    <button
                      key={div}
                      onClick={() => setDivision(div)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${division === div ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      {div}
                    </button>
                  ))}
                </div>
              </div>

              {/* MSSU: Team Selection */}
              {division === 'MSSU' && (
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">{t('my_team')}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map(team => (
                      <button
                        key={team}
                        onClick={() => setUserTeam(team)}
                        className={`py-2 rounded-lg text-sm font-bold transition-all ${userTeam === team ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {team}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* SLU: Combined Unit/Team Selection */}
              {division === 'SLU' && (
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">Unit / Team</label>
                  <div className="grid grid-cols-3 gap-2">
                    {SLU_UNIT_TEAM_OPTIONS.map(option => (
                      <button
                        key={option}
                        onClick={() => setSluSelection(option)}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${sluSelection === option ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Staff Number */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">{t('staff_number')}</label>
                <input
                  type="text"
                  placeholder="e.g. 12345"
                  value={staffNumber}
                  onChange={(e) => setStaffNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-300"
                />
              </div>

              {/* Font Size */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">{language === 'zh-HK' ? '字體大小' : 'Font Size'}</label>
                <div className="grid grid-cols-3 gap-2">
                  {([['small', 'S'], ['medium', 'M'], ['large', 'L']] as [FontSize, string][]).map(([sz, label]) => (
                    <button
                      key={sz}
                      onClick={() => setFontSize(sz)}
                      className={`py-2 rounded-lg font-bold transition-all ${fontSize === sz ? 'bg-slate-700 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'} ${sz === 'small' ? 'text-xs' : sz === 'large' ? 'text-base' : 'text-sm'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Selection */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">{t('language')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLanguage('en')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${language === 'en' ? 'bg-slate-700 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => setLanguage('zh-HK')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${language === 'zh-HK' ? 'bg-slate-700 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    繁體中文
                  </button>
                </div>
              </div>

              {/* Previous Balance Override */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">{t('net_balance')} (Override)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={previousBalance}
                    onChange={(e) => setPreviousBalance(parseFloat(e.target.value) || 0)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <div className="text-xs font-bold text-slate-400 uppercase">Hours</div>
                </div>
              </div>

              {/* Report moved to main screen overlay */}

              {/* Data Management */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block tracking-wider">{t('data_management')}</label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleBackup} className="py-2 px-3 bg-slate-100 rounded-lg flex items-center justify-center gap-1.5 hover:bg-slate-200 transition-colors font-bold text-xs text-slate-600">
                      <Download size={14} /> {t('backup_data')}
                    </button>
                    <div className="relative">
                      <input type="file" onChange={handleRestore} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept=".json" />
                      <button className="w-full py-2 px-3 bg-slate-100 rounded-lg flex items-center justify-center gap-1.5 hover:bg-slate-200 transition-colors font-bold text-xs text-slate-600">
                        <Upload size={14} /> {t('restore_data')}
                      </button>
                    </div>
                  </div>
                  <button onClick={handleResetApp} className="w-full py-2 bg-red-50 text-red-500 rounded-lg flex items-center justify-center gap-1.5 hover:bg-red-100 transition-colors font-bold text-xs">
                    <Eraser size={14} /> {t('reset_data')}
                  </button>
                </div>
              </div>

              <div className="pt-4 pb-2 text-center">
                <p className="text-[10px] text-slate-600 font-mono">v1.2.0 • Shift Cycle Manager</p>
              </div>
            </div>
          </div>
          </div>
        </>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-100 border-t-blue-600"></div>
            <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-widest">{t('analyzing')}</p>
          </div>
        </div>
      )}
    </div>
  );
};


const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
};
export default App;
