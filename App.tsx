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
            <div className={`flex items-center justify-between p-4 rounded-2xl bg-white shadow-sm border ${previousBalance < 0 ? 'border-red-100' : 'border-slate-200'}`}>
                <div className="text-[10px] font-bold text-slate-400 uppercase leading-tight whitespace-pre-line">{t('carried_over')}</div>
                <div className="flex items-center gap-2">
                    <input 
                        type="number" 
                        step="0.01"
                        value={previousBalance}
                        onChange={(e) => {
                            setPreviousBalance(parseFloat(e.target.value) || 0);
                            setIsLinkedBalance(false);
                        }}
                        className={`text-right w-32 font-black text-3xl bg-transparent border-none outline-none p-0 ${previousBalance < 0 ? 'text-red-500' : 'text-slate-800'}`}
                    />
                    <button 
                        onClick={() => {
                            const { balance, isLinked } = getEffectivePreviousBalance(cycleIndex);
                            setPreviousBalance(balance);
                            setIsLinkedBalance(isLinked);
                        }}
                        className={`p-2 rounded-full transition-colors ${isLinkedBalance ? 'text-blue-200 hover:text-blue-600' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
                        title="Recalculate / Sync Balance"
                    >
                        <RefreshCcw size={16} />
                    </button>
                </div>
            </div>

            {/* Tools Row */}
            <div className="grid grid-cols-3 gap-2">
                 <button 
                    onClick={handleJumpToToday} 
                    className="py-2 bg-white border border-slate-200 rounded-xl text-slate-500 font-bold hover:bg-slate-50 hover:text-blue-600 transition-all flex flex-col items-center justify-center gap-1 shadow-sm min-h-[60px]"
                 >
                     <CalendarClock size={18} />
                     <span className="text-[9px] uppercase tracking-tight leading-none px-1 text-center">{t('jump_to_today')}</span>
                 </button>
                 
                 <button 
                    onClick={() => setIsWizardOpen(true)} 
                    className="py-2 bg-white border border-purple-200 rounded-xl text-purple-600 font-bold hover:bg-purple-50 transition-all flex flex-col items-center justify-center gap-1 shadow-sm min-h-[60px]"
                 >
                     <Wand2 size={18} />
                     <span className="text-[9px] uppercase tracking-tight leading-none px-1 text-center">{t('situation_wizard')}</span>
                 </button>

                 <button 
                    onClick={() => setIsPaintMode(!isPaintMode)}
                    className={`py-2 border rounded-xl font-bold transition-all flex flex-col items-center justify-center gap-1 shadow-sm min-h-[60px]
                        ${isPaintMode ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50'}
                    `}
                >
                    {isPaintMode ? <Check size={18} /> : <PaintBucket size={18} />}
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
    </LanguageProvider>
  );
};

export default App;
