import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DayEntry, EntryType, HOURS_CONFIG, Language } from './types';
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
    saveUserPrefs({ startDate, staffNumber, language, userTeam });
  }, [startDate, staffNumber, language, userTeam, isInitialized]);

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
    const [y, m, d] = startDate.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    start.setDate(start.getDate() + (cycleIndex * 18));
    return start;
  }, [startDate, cycleIndex]);

  const cycleEndDate = useMemo(() => {
    const end = new Date(cycleStartDate);
    end.setDate(end.getDate() + 17);
    return end;
  }, [cycleStartDate]);

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
    const d = new Date(cycleStartDate);
    d.setDate(d.getDate() + (dayId - 1));
    return d;
  };

  // Main Dashboard
  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 relative overflow-hidden font-sans">
      {/* Top Bar */}
      <div className="bg-white px-5 pt-12 pb-4 shadow-sm z-10 sticky top-0 flex justify-between items-center border-b border-slate-100">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Briefcase size={20} className="text-blue-600" />
            SHIFT CYCLE
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {cycleStartDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {cycleEndDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCycleIndex(cycleIndex - 1)} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"><ChevronLeft size={20} /></button>
          <button onClick={handleJumpToToday} className="p-2 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"><CalendarClock size={20} /></button>
          <button onClick={() => setCycleIndex(cycleIndex + 1)} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"><ChevronRight size={20} /></button>
          <button onClick={() => setIsWizardOpen(true)} className="p-2 rounded-full bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"><Wand2 size={20} /></button>
          <button onClick={() => setShowSettings(true)} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"><Settings size={20} /></button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-48 pt-4 scrollbar-hide">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] uppercase font-bold text-slate-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2 auto-rows-fr">
          {days.map(day => (
            <CalendarCell
              key={day.dayId}
              entry={day}
              date={getDayDate(day.dayId)}
              onClick={() => handleDayClick(day)}
              userTeam={userTeam}
            />
          ))}
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
          onApply={handleSituationApply}
          onApplyRange={handleSituationApplyRange}
        />
      )}

      {/* Settings Drawer */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="w-80 h-full bg-slate-900 text-slate-300 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings size={20} /> {t('settings')}</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-8">
              {/* User Team */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-3 block tracking-wider">{t('my_team')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map(team => (
                    <button
                      key={team}
                      onClick={() => setUserTeam(team)}
                      className={`py-3 rounded-xl text-sm font-bold transition-all ${userTeam === team ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      {team}
                    </button>
                  ))}
                </div>
              </div>

              {/* Report */}
              {report && (
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                    <Info size={12} /> {t('report_generated')}
                  </h3>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{report}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Data Management */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 mb-3 block tracking-wider">{t('data_management')}</label>
                <div className="space-y-3">
                  <button onClick={handleResetApp} className="w-full p-4 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors font-bold text-sm">
                    <Eraser size={16} /> {t('reset_data')}
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleBackup} className="p-4 bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-slate-700 transition-colors font-bold text-xs">
                      <Download size={16} className="mb-1" /> {t('backup_data')}
                    </button>
                    <div className="relative">
                      <input type="file" onChange={handleRestore} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept=".json" />
                      <button className="w-full h-full p-4 bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-slate-700 transition-colors font-bold text-xs pointer-events-none">
                        <Upload size={16} className="mb-1" /> {t('restore_data')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 text-center">
                <p className="text-[10px] text-slate-600 font-mono">v1.2.0 • Shift Cycle Manager</p>
              </div>
            </div>
          </div>
        </div>
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
