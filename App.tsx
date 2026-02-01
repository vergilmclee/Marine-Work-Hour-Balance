
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DayEntry, EntryType, HOURS_CONFIG, Language } from './types';
import CalendarCell from './components/CalendarCell';
import DayCard from './components/DayCard';
import StatsPanel from './components/StatsPanel';
import SituationWizard from './components/SituationWizard';
import { generateBalanceReport } from './services/geminiService';
import { loadCycleData, saveCycleData, loadUserPrefs, saveUserPrefs, clearAllData, hasCycleData, generateEmptyCycle, getBackupData, restoreBackupData } from './services/storageService';
import { calculateCycleStats } from './utils/balanceUtils';
import { Info, AlertCircle, Wand2, RefreshCcw, Calendar as CalendarIcon, ChevronLeft, ChevronRight, History, CalendarClock, Search, UserCircle, Lock, Menu, Settings, X, Save, PaintBucket, Check, Eraser, Download, Upload, Languages } from 'lucide-react';
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
    // Language is handled by Context, but we might want to sync if it changed externally? 
    // Usually Context handles initialization.
    
    let targetIndex = 0;
    
    // Calculate current cycle based on Today if start date exists
    if (prefs.startDate) {
         const [y, m, d] = prefs.startDate.split('-').map(Number);
         const start = new Date(y, m - 1, d);
         const today = new Date();
         today.setHours(0,0,0,0);
         
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
    saveUserPrefs({ startDate, staffNumber, language });
  }, [startDate, staffNumber, language, isInitialized]);

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
    today.setHours(0,0,0,0);

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
    
    const s = new Date(start); s.setHours(0,0,0,0);
    const e = new Date(end); e.setHours(0,0,0,0);

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
            if (runningBalance !== null && idx === sortedIndices[i-1] + 1) {
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
            if (i > 0 && idx === sortedIndices[i-1] + 1) {
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
                  <p className="text-slate-500 text-center mb-8 text-sm">{t('set_anchor_desc')}</p>
                  
                  <div className="space-y-5">
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-400 mb-1.5 block tracking-wider">{t('staff_number')}</label>
                        <input 
                            type="text" 
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder-slate-300"
                            placeholder="e.g. 12345"
                            value={staffNumber}
                            onChange={(e) => setStaffNumber(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-400 mb-1.5 block tracking-wider">{t('cycle_start_date')}</label>
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

                    <div className="flex justify-center gap-2 pt-2">
                        <button onClick={() => setLanguage('en')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${language === 'en' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>English</button>
                        <button onClick={() => setLanguage('zh-HK')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${language === 'zh-HK' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>繁體中文</button>
                    </div>
                  </div>
              </div>
          </div>
      )
  }

  const getDayDate = (dayId: number) => {
      const d = new Date(cycleStartDate);
      d.setDate(d.getDate() + (dayId - 1));
      return d;
  };

  const PAINT_OPTIONS = [
    { type: EntryType.REGULAR_SHIFT, label: t('type_work'), color: 'bg-blue-600 border-blue-600 text-white' },
    { type: EntryType.OFF_DAY, label: t('type_off'), color: 'bg-slate-100 border-slate-200 text-slate-500' },
    { type: EntryType.LEAVE_VL, label: t('type_vl'), color: 'bg-blue-100 border-blue-200 text-blue-700' },
    { type: EntryType.LEAVE_HOLIDAY, label: t('type_hl'), color: 'bg-indigo-100 border-indigo-200 text-indigo-700' },
    { type: EntryType.TIME_OFF, label: t('type_to'), color: 'bg-orange-100 border-orange-200 text-orange-700' },
  ];

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 max-w-lg mx-auto shadow-2xl relative overflow-hidden">
      
      {/* Top Header */}
      <div className="bg-slate-900 text-white pt-safe px-6 pb-6 rounded-b-[2.5rem] shadow-xl relative z-20 shrink-0 transition-all duration-300 ease-out">
         <div className="flex justify-between items-center mb-4 mt-1">
             <div className="flex items-center gap-3">
                <PursuitCraft className="text-yellow-400 fill-yellow-400" size={22} />
                <h1 className="font-black text-xl tracking-tight">{t('app_name')}</h1>
             </div>
             
             {/* Settings Toggle */}
             <button onClick={() => setShowSettings(!showSettings)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all active:scale-95">
                 <Settings size={18} />
             </button>
         </div>

         {/* Cycle Nav */}
         <div className="flex items-center justify-between bg-white/10 backdrop-blur-lg rounded-2xl p-2 border border-white/10 shadow-inner">
             <button onClick={() => handleCycleChange(cycleIndex - 1)} className="p-2 hover:bg-white/10 rounded-xl text-slate-200 transition-colors">
                 <ChevronLeft size={20} />
             </button>
             <div className="text-center px-2">
                 <div className="text-sm font-bold text-white tracking-wide">
                     {cycleStartDate.toLocaleDateString(language === 'zh-HK' ? 'zh-HK' : 'en-GB', { month: 'short', day: 'numeric' })} - {cycleEndDate.toLocaleDateString(language === 'zh-HK' ? 'zh-HK' : 'en-GB', { month: 'short', day: 'numeric', year: '2-digit' })}
                 </div>
             </div>
             <button onClick={() => handleCycleChange(cycleIndex + 1)} className="p-2 hover:bg-white/10 rounded-xl text-slate-200 transition-colors">
                 <ChevronRight size={20} />
             </button>
         </div>
         
         {/* Settings Drawer */}
         {showSettings && (
             <div className="absolute top-full left-4 right-4 mt-2 bg-slate-800/95 backdrop-blur-xl rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 border border-white/10 shadow-2xl z-50">
                 <div className="flex justify-between items-center mb-2">
                     <h3 className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">{t('settings')}</h3>
                     <button onClick={() => setShowSettings(false)}><X size={14} className="text-slate-400"/></button>
                 </div>
                 
                 {/* Language Switcher */}
                 <div className="bg-slate-900/50 rounded-xl p-1 flex gap-1 mb-3 border border-slate-700/50">
                     <button 
                        onClick={() => setLanguage('en')}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${language === 'en' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400 hover:bg-white/5'}`}
                     >
                         English
                     </button>
                     <button 
                        onClick={() => setLanguage('zh-HK')}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${language === 'zh-HK' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400 hover:bg-white/5'}`}
                     >
                         繁體中文
                     </button>
                 </div>

                 <div className="space-y-2 mb-3">
                     <div>
                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">{t('staff_number')}</label>
                        <input type="text" value={staffNumber} onChange={(e) => setStaffNumber(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"/>
                     </div>
                     <div>
                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">{t('anchor_date')}</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"/>
                     </div>
                 </div>
                 <div className="grid grid-cols-2 gap-2 mb-2">
                     <button onClick={handleBackup} className="py-2 bg-blue-500/10 text-blue-300 text-[10px] rounded-lg font-bold border border-blue-500/20">{t('backup')}</button>
                     <label className="py-2 bg-blue-500/10 text-blue-300 text-[10px] rounded-lg font-bold border border-blue-500/20 text-center cursor-pointer">
                         {t('restore')} <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
                     </label>
                 </div>
                 <button onClick={handleResetApp} className="w-full py-2 bg-red-500/10 text-red-400 text-[10px] rounded-lg font-bold border border-red-500/20">{t('reset_app')}</button>
             </div>
         )}
      </div>

      {/* Flexible Content Area - Contains Tools, Balance & Calendar */}
      <div className="flex-1 flex flex-col px-4 pt-4 gap-2 overflow-hidden relative z-10">
        
        {/* Top Controls Row */}
        <div className="mb-2 space-y-2">
            {/* Balance Card */}
            <div className={`flex items-center justify-between px-4 py-2 rounded-2xl bg-white shadow-sm border ${previousBalance < 0 ? 'border-red-100' : 'border-slate-200'}`}>
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
                        className={`text-right w-28 font-black text-2xl bg-transparent border-none outline-none p-0 ${previousBalance < 0 ? 'text-red-500' : 'text-slate-800'}`}
                    />
                    <button 
                        onClick={() => {
                            const { balance, isLinked } = getEffectivePreviousBalance(cycleIndex);
                            setPreviousBalance(balance);
                            setIsLinkedBalance(isLinked);
                        }}
                        className={`p-1.5 rounded-full transition-colors ${isLinkedBalance ? 'text-blue-200 hover:text-blue-600' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
                        title="Recalculate / Sync Balance"
                    >
                        <RefreshCcw size={14} />
                    </button>
                </div>
            </div>

            {/* Tools Row */}
            <div className="grid grid-cols-3 gap-2">
                 <button 
                    onClick={handleJumpToToday} 
                    className="py-1.5 bg-white border border-slate-200 rounded-xl text-slate-500 font-bold hover:bg-slate-50 hover:text-blue-600 transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm min-h-[48px]"
                 >
                     <CalendarClock size={16} />
                     <span className="text-[9px] uppercase tracking-tight leading-none px-1 text-center">{t('jump_to_today')}</span>
                 </button>
                 
                 <button 
                    onClick={() => setIsWizardOpen(true)} 
                    className="py-1.5 bg-white border border-purple-200 rounded-xl text-purple-600 font-bold hover:bg-purple-50 transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm min-h-[48px]"
                 >
                     <Wand2 size={16} />
                     <span className="text-[9px] uppercase tracking-tight leading-none px-1 text-center">{t('situation_wizard')}</span>
                 </button>

                 <button 
                    onClick={() => setIsPaintMode(!isPaintMode)}
                    className={`py-1.5 border rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm min-h-[48px]
                        ${isPaintMode ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50'}
                    `}
                >
                    {isPaintMode ? <Check size={16} /> : <PaintBucket size={16} />}
                    <span className="text-[9px] uppercase tracking-tight leading-none px-1 text-center">{t('quick_paint')}</span>
                </button>
            </div>
        </div>

        {/* Calendar Container */}
        <div className="flex-1 bg-white rounded-2xl p-2 shadow-sm border border-slate-100 relative overflow-hidden flex flex-col min-h-0">
            {/* Paint Palette */}
            {isPaintMode && (
                <div className="mb-2 bg-slate-50 p-1.5 rounded-lg flex gap-1 overflow-x-auto border border-slate-100 shrink-0 no-scrollbar">
                    {PAINT_OPTIONS.map(opt => (
                        <button
                            key={opt.type}
                            onClick={() => setPaintType(opt.type)}
                            className={`
                                flex-shrink-0 px-2 py-1.5 rounded-md text-[10px] font-bold border transition-all whitespace-nowrap
                                ${paintType === opt.type 
                                    ? `${opt.color} ring-1 ring-offset-1 ring-blue-300` 
                                    : 'bg-white border-slate-200 text-slate-500 opacity-60'
                                }
                            `}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
            
            {/* Days Header */}
            <div className="grid grid-cols-6 gap-1 mb-1 shrink-0">
                {WEEKDAYS.map(d => (
                    <div key={d} className="text-center text-[9px] font-bold text-slate-300 uppercase">{d}</div>
                ))}
            </div>
            
            {/* Grid */}
            <div className="grid grid-cols-6 gap-1.5 flex-1 min-h-0 content-start overflow-y-auto no-scrollbar pb-1">
                {days.map(day => (
                    <CalendarCell 
                        key={day.dayId} 
                        entry={day} 
                        date={getDayDate(day.dayId)}
                        onClick={() => handleDayClick(day)}
                    />
                ))}
            </div>
        </div>
        
        {/* Spacer for Stats Panel - Reduced height to allow more calendar visibility */}
        <div className="h-[120px] shrink-0" />
      </div>

      {/* Report Modal */}
      {report && (
            <div className="absolute inset-x-4 bottom-[220px] top-20 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 z-40 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-10">
                <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white">
                    <div className="flex items-center gap-2 text-indigo-600">
                        <PursuitCraft size={16} fill="currentColor" className="text-indigo-100" />
                        <h2 className="font-bold text-sm">{t('generated_report')}</h2>
                    </div>
                    <button onClick={() => setReport(null)} className="p-1 rounded-full hover:bg-slate-100"><X size={16} className="text-slate-400"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown>{report}</ReactMarkdown>
                    </div>
                </div>
                <div className="p-3 bg-slate-50 border-t border-slate-100">
                    <button 
                        onClick={() => navigator.clipboard.writeText(report)} 
                        className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                    >
                        <Save size={14} /> {t('copy_clipboard')}
                    </button>
                </div>
            </div>
      )}

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

      {/* Selected Day Modal */}
      {selectedDay && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
             <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setSelectedDay(null)} />
             <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-1 animate-in zoom-in-95 duration-200">
                 <div className="absolute top-3 right-3 z-10">
                     <button onClick={() => setSelectedDay(null)} className="p-1.5 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors">
                         <X size={16} />
                     </button>
                 </div>
                 <DayCard 
                    entry={selectedDay}
                    date={getDayDate(selectedDay.dayId)}
                    onChange={handleDayUpdate}
                    onClose={() => setSelectedDay(null)}
                />
             </div>
          </div>
      )}

      {/* Wizard */}
      {isWizardOpen && (
        <SituationWizard 
           isOpen={isWizardOpen}
           onClose={() => setIsWizardOpen(false)}
           days={days}
           startDate={cycleStartDate}
           onApply={handleSituationApply}
           onApplyRange={handleSituationApplyRange}
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>import React from 'react';
import { DayEntry, EntryType, TEAM_ROTATION } from '../types';
import { Briefcase, Sun, Calendar, Clock, GraduationCap, ArrowRightCircle, MinusCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface CalendarCellProps {
  entry: DayEntry;
  date: Date;
  onClick: () => void;
  userTeam?: number; // Highlight if this is user's team
}

const CalendarCell: React.FC<CalendarCellProps> = ({ entry, date, onClick, userTeam }) => {
  const { t } = useLanguage();

  const getBgColor = () => {
    switch (entry.type) {
      case EntryType.REGULAR_SHIFT: return 'bg-blue-600 shadow-blue-200 border-blue-500 text-white shadow-md';
      case EntryType.OFF_DAY: return 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50';
      case EntryType.LEAVE_VL:
      case EntryType.LEAVE_HOLIDAY: return 'bg-blue-50 border-blue-200 text-blue-700';
      case EntryType.COURSE_TRAINING: return 'bg-purple-50 border-purple-200 text-purple-700';
      case EntryType.TRANSFERRED_OUT: return 'bg-[repeating-linear-gradient(45deg,_#f1f5f9,_#f1f5f9_5px,_#e2e8f0_5px,_#e2e8f0_10px)] border-slate-200 text-slate-400 opacity-60';
      case EntryType.TIME_OFF: return 'bg-orange-50 border-orange-200 text-orange-700';
      case EntryType.CUSTOM: return 'bg-amber-50 border-amber-200 text-amber-700';
      default: return 'bg-white border-slate-100';
    }
  };

  const getIcon = () => {
    switch (entry.type) {
      case EntryType.REGULAR_SHIFT: return <Briefcase size={10} className="text-blue-100" />;
      case EntryType.OFF_DAY: return <Sun size={10} className="opacity-40" />;
      case EntryType.LEAVE_VL:
      case EntryType.LEAVE_HOLIDAY: return <Calendar size={10} />;
      case EntryType.COURSE_TRAINING: return <GraduationCap size={10} />;
      case EntryType.TRANSFERRED_OUT: return <ArrowRightCircle size={10} />;
      case EntryType.TIME_OFF: return <MinusCircle size={10} />;
      case EntryType.CUSTOM: return <Clock size={10} />;
      default: return null;
    }
  };

  const dayNum = date.getDate();
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  // Get teams working this day from rotation pattern
  const workingTeams = TEAM_ROTATION[entry.dayId] || [];
  const isUserTeamWorking = userTeam && workingTeams.includes(userTeam);

  // Tiny badge text
  const getBadge = () => {
    if (entry.type === EntryType.REGULAR_SHIFT) return t('type_work');
    if (entry.type === EntryType.OFF_DAY) return t('type_off');
    if (entry.type === EntryType.COURSE_TRAINING) return t('type_course');
    if (entry.type === EntryType.LEAVE_VL) return t('type_vl');
    if (entry.type === EntryType.LEAVE_HOLIDAY) return t('type_hl');
    if (entry.type === EntryType.TRANSFERRED_OUT) return t('type_moved');
    if (entry.type === EntryType.TIME_OFF) return t('type_to');
    if (entry.type === EntryType.CUSTOM) return `${entry.customHours}h`;
    return '...';
  }

  const hasNote = entry.note && entry.note.trim().length > 0;

  // Team badge colors
  const getTeamColor = (team: number) => {
    switch (team) {
      case 1: return 'bg-red-500';
      case 2: return 'bg-blue-500';
      case 3: return 'bg-green-500';
      case 4: return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <button 
      onClick={onClick}
      className={`
        rounded-xl border p-1 relative flex flex-col justify-between items-start transition-all duration-200 active:scale-95 h-full min-h-[56px]
        ${getBgColor()}
        ${isUserTeamWorking ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}
      `}
    >
      <div className="flex justify-between w-full items-start">
        <span className={`text-[10px] font-bold leading-none ${entry.type === EntryType.REGULAR_SHIFT ? 'text-white' : isWeekend ? 'text-red-400' : 'text-slate-700'}`}>
          {dayNum}
        </span>
        <div className="flex gap-0.5 items-center">
          {hasNote && (
            <div className={`w-1 h-1 rounded-full ${entry.type === EntryType.REGULAR_SHIFT ? 'bg-amber-400' : 'bg-amber-500'}`} />
          )}
          {/* Team badges - show which teams are working */}
          {entry.type === EntryType.REGULAR_SHIFT && workingTeams.length > 0 && (
            <div className="flex gap-0.5">
              {workingTeams.map(team => (
                <div 
                  key={team}
                  className={`w-3 h-3 rounded-full ${getTeamColor(team)} text-white text-[6px] font-black flex items-center justify-center border border-white/50`}
                  title={`Unit ${team}`}
                >
                  {team}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start w-full gap-0">
         <div className="mb-0.5 opacity-80">{getIcon()}</div>
         <span className={`text-[7px] font-bold uppercase tracking-tight leading-none ${entry.type === EntryType.REGULAR_SHIFT ? 'text-blue-100' : 'opacity-70'}`}>
            {getBadge()}
         </span>
      </div>
    </button>
  );
};

export default CalendarCell;


import { DayEntry, EntryType, UserPrefs, TEAM_ROTATION } from '../types';

const STORAGE_KEY = 'shiftcycle_data_v1';
const PREFS_KEY = 'shiftcycle_prefs_v1';

interface CycleData {
  [cycleIndex: number]: {
    days: DayEntry[];
    previousBalance: number;
  };
}

export const generateEmptyCycle = (): DayEntry[] => {
  return Array.from({ length: 18 }, (_, i) => {
    const dayId = i + 1;
    const workingTeams = TEAM_ROTATION[dayId] || [];
    
    return {
      dayId,
      type: EntryType.OFF_DAY,
      customHours: 0,
      note: '',
      assignedTeam: workingTeams.length === 1 ? workingTeams[0] : undefined
    };
  });
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


export const TRANSLATIONS = {
  en: {
    // App
    app_name: 'Work Hour Balancer',
    staff_number: 'Staff Number',
    cycle_start_date: 'Cycle Start Date',
    anchor_date: 'Anchor Date',
    set_anchor_desc: 'Set your anchor date to start tracking.',
    pick_first_day: 'Pick the first day of ANY previous cycle.',
    carried_over: 'Carried\nOver',
    jump_to_today: 'Jump to Today',
    situation_wizard: 'Situation Wizard',
    quick_paint: 'Quick Paint Mode',
    settings: 'Settings',
    backup: 'Backup',
    restore: 'Restore',
    reset_app: 'Reset App',
    reset_confirm: 'Reset application data? This cannot be undone.',
    target: 'Target',
    worked: 'Worked',
    net_balance: 'Net Balance',
    analyze_report: 'Analyze Report',
    suggest_oil: 'Suggest OIL Plan',
    generated_report: 'Generated Report',
    copy_clipboard: 'Copy to Clipboard',
    confirm: 'Confirm',
    cancel: 'Cancel',
    apply: 'Apply',
    restore_success: 'Data restored successfully. Reloading...',
    restore_fail: 'Failed to parse backup file.',
    my_team: 'My Team',
    select_team: 'Select Your Team',
    team_unit: 'Unit',
    
    // Types & Badges
    type_work: 'Work',
    type_off: 'Off',
    type_vl: 'VL',
    type_hl: 'HL',
    type_to: 'T/O',
    type_custom: 'Custom',
    type_course: 'Course',
    type_moved: 'Moved',

    // Wizard
    select_situation: 'Select Situation',
    attend_training: 'Attend Training / Course',
    attend_training_desc: 'Mark specific days where you attend a course.',
    redeploy: 'Redeploy / Transfer',
    redeploy_desc: 'Leaving the team mid-cycle.',
    join_team: 'Join Team / Deploy In',
    join_team_desc: 'Joining the team mid-cycle.',
    course_name: 'Course Name',
    location: 'Location',
    start_time: 'Start Time',
    end_time: 'End Time',
    break_min: 'Break (min)',
    impact_hours: 'Impact Hours',
    select_days: 'Select Days',
    date_range: 'Date Range',
    apply_n_days: 'Apply {n} Days',
    apply_range: 'Apply Date Range',
    confirm_last_day: 'Confirm Last Day',
    confirm_first_day: 'Confirm First Day',
    wizard_note_training: 'Training',
    wizard_note_transfer: 'Transferred',
    wizard_note_join: 'Joined Team',
    wizard_range_info: 'Use this for courses longer than 18 days. The app will automatically update all affected cycles.',
    tap_dates_training: 'Tap all dates you will be attending training.',
    tap_last_day: 'Tap the LAST day you will work for this team in this cycle.',
    tap_first_day: 'Tap the FIRST day you will work for this team in this cycle.',

    // DayCard
    set_status: 'Set Status',
    add_note: 'Add a note...',
    report_absence: 'Report Absence / Time Off (T/O)',
    time_off_start: 'Time Off Start',
    time_off_end: 'Time Off End',
    work_start: 'Work Start',
    work_end: 'Work End',
    adjustment_min: 'Adjustment (min)',
    deduction: 'Deduction',
    total_hours: 'Total Hours',
    shift_credit: 'Shift Credit',
    reduction_value: 'Reduction Value',
    managed_by_wizard: 'This day is managed by the Situation Wizard. To edit details, use the Wizard. Select an option below to overwrite.',
    
    // Report Gen
    report_title: 'Balance Report',
    report_formal: 'Formal Statement',
    report_log: 'Event Log',
    report_stats: 'Stats',
    report_cycle: 'Cycle',
    report_staff: 'Staff',
    report_options: 'Suggested OIL Options',
    report_deficit_res: 'Deficit Resolution',
    report_surplus_msg: 'You have a surplus of',
    report_deficit_msg: 'You are short',
    opt_full_shifts: 'Clear with Full Shifts',
    opt_leave_days: 'Clear with Leave Days',
    opt_exact: 'Exact Time Off',
    rec_leave: 'Apply for',
    rec_work: 'Work',
    rec_deduct_to: 'Deduct',
    rec_shifts: 'extra shifts',
    rec_arrange: 'Arrange a repayment shift or mutual exchange.',
    full_shift: 'Full Shift(s)',
    leave_day: 'Leave Day(s)',
    remaining: 'Remaining',
    take_exactly: 'Take exactly',
    off: 'off',
    no_irregularities: 'No irregularities recorded.'
  },
  'zh-HK': {
    app_name: 'Work Hour Balancer',
    staff_number: '員工編號',
    cycle_start_date: '週期開始日期',
    anchor_date: '錨點日期',
    set_anchor_desc: '設定您的錨點日期以開始追蹤。',
    pick_first_day: '選擇任何一個過往週期的第一天。',
    carried_over: '上期\n結轉',
    jump_to_today: '跳至今天',
    situation_wizard: '情況精靈',
    quick_paint: '快速填色',
    settings: '設定',
    backup: '備份',
    restore: '還原',
    reset_app: '重置',
    reset_confirm: '重置應用程式資料？此操作無法還原。',
    target: '目標',
    worked: '已工作',
    net_balance: '淨結餘',
    analyze_report: '分析報告',
    suggest_oil: '建議 OIL 方案',
    generated_report: '已生成報告',
    copy_clipboard: '複製到剪貼簿',
    confirm: '確認',
    cancel: '取消',
    apply: '應用',
    restore_success: '資料已成功還原。正在重新載入...',
    restore_fail: '無法解析備份檔案。',
    my_team: '我的小隊',
    select_team: '選擇您的小隊',
    team_unit: '小隊',
    
    type_work: '工作',
    type_off: '休息',
    type_vl: '年假',
    type_hl: '法定假日',
    type_to: '超時工作補償',
    type_custom: '自訂',
    type_course: '課程',
    type_moved: '調走',

    select_situation: '選擇情況',
    attend_training: '參加訓練 / 課程',
    attend_training_desc: '標記參加課程的日子。',
    redeploy: '調配 / 轉移',
    redeploy_desc: '在週期中途離開團隊。',
    join_team: '調配至此團隊',
    join_team_desc: '在週期中途加入團隊。',
    course_name: '課程名稱',
    location: '地點',
    start_time: '開始時間',
    end_time: '結束時間',
    break_min: '休息 (分鐘)',
    impact_hours: '影響時數',
    select_days: '選擇日子',
    date_range: '日期範圍',
    apply_n_days: '應用 {n} 天',
    apply_range: '應用日期範圍',
    confirm_last_day: '確認最後工作日',
    confirm_first_day: '確認第一工作日',
    wizard_note_training: '訓練',
    wizard_note_transfer: '已調走',
    wizard_note_join: '加入團隊',
    wizard_range_info: '用於超過 18 天的課程。應用程式會自動更新所有受影響的週期。',
    tap_dates_training: '點擊所有您將參加訓練的日期。',
    tap_last_day: '點擊您在此週期中為此團隊工作的最後一天。',
    tap_first_day: '點擊您在此週期中為此團隊工作的第一天。',

    set_status: '設定狀態',
    add_note: '新增備註...',
    report_absence: '報告缺勤 / 補休 (T/O)',
    time_off_start: '缺勤開始',
    time_off_end: '缺勤結束',
    work_start: '工作開始',
    work_end: '工作結束',
    adjustment_min: '調整 (分鐘)',
    deduction: '扣減',
    total_hours: '總時數',
    shift_credit: '更份時數',
    reduction_value: '扣減值',
    managed_by_wizard: '此日由情況精靈管理。如需編輯，請使用精靈。選擇下方選項可覆蓋設定。',
    
    report_title: '結餘報告',
    report_formal: '正式聲明',
    report_log: '事件記錄',
    report_stats: '統計',
    report_cycle: '週期',
    report_staff: '員工',
    report_options: '建議補休 (OIL) 方案',
    report_deficit_res: '赤字解決方案',
    report_surplus_msg: '您有盈餘',
    report_deficit_msg: '您欠缺',
    opt_full_shifts: '以全更抵銷',
    opt_leave_days: '以年假抵銷',
    opt_exact: '精確補休',
    rec_leave: '申請',
    rec_work: '工作',
    rec_deduct_to: '扣除',
    rec_shifts: '額外更份',
    rec_arrange: '安排補更或互換更份。',
    full_shift: '個全更',
    leave_day: '天年假',
    remaining: '剩餘',
    take_exactly: '取剛好',
    off: '休假',
    no_irregularities: '沒有記錄異常情況。'
  }
};


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

  );
};

export default App;
