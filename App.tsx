
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DayEntry, EntryType, HOURS_CONFIG } from './types';
import CalendarCell from './components/CalendarCell';
import DayCard from './components/DayCard';
import StatsPanel from './components/StatsPanel';
import SituationWizard from './components/SituationWizard';
import { generateBalanceReport } from './services/geminiService';
import { loadCycleData, saveCycleData, loadUserPrefs, saveUserPrefs, clearAllData, hasCycleData, generateEmptyCycle, getBackupData, restoreBackupData } from './services/storageService';
import { calculateCycleStats } from './utils/balanceUtils';
import { Info, AlertCircle, Wand2, RefreshCcw, Calendar as CalendarIcon, ChevronLeft, ChevronRight, History, CalendarClock, Search, UserCircle, Lock, Menu, Settings, X, Save, PaintBucket, Check, Eraser, Download, Upload } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// Custom Icon for High Speed Pursuit Craft (Port Side / Facing Left)
const PursuitCraft = ({ size = 24, className = "", fill = "none", ...props }: React.SVGProps<SVGSVGElement> & { size?: number | string, fill?: string }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
      {...props}
    >
      {/* Hull facing left (Port side view) */}
      <path d="M22 17H10c-5 0-8-3-8-3l1-4h19v7Z" fill={fill !== 'none' ? fill : 'none'} />
      {/* Cabin */}
      <path d="M10 10l2-3h5v3" />
      {/* Mast/Radar */}
      <path d="M15 4v3" />
      {/* Speed lines/Water */}
      <path d="M2 20h20" strokeDasharray="2 4" />
    </svg>
  );
};

// Days of week for calendar header
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const App: React.FC = () => {
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
    saveUserPrefs({ startDate, staffNumber });
  }, [startDate, staffNumber, isInitialized]);

  // --- Cycle Navigation Handlers ---
  const handleCycleChange = (newIndex: number) => {
    setCycleIndex(newIndex);
    
    const data = loadCycleData(newIndex);
    setDays(data.days);
    
    lastLoadedDaysRef.current = JSON.stringify(data.days);
    
    let newBalance = data.previousBalance;
    let isLinked = false;

    // Calculate what the linked balance *would* be
    const linkResult = getEffectivePreviousBalance(newIndex);

    if (!hasCycleData(newIndex)) {
        // SCENARIO 1: No data exists for this cycle. 
        // We MUST use the calculated link balance to be helpful.
        newBalance = linkResult.balance;
        isLinked = linkResult.isLinked;
    } else {
        // SCENARIO 2: Data exists. 
        // We MUST respect the saved balance (Fixes the bug where manual edits were overwritten).
        newBalance = data.previousBalance;
        
        // We only show "Linked" status if the saved value matches the calculated one.
        if (linkResult.isLinked && Math.abs(linkResult.balance - newBalance) < 0.01) {
            isLinked = true;
        }
    }

    setPreviousBalance(newBalance);
    setIsLinkedBalance(isLinked);
    lastLoadedBalanceRef.current = newBalance; // Update ref so we don't treat this load as a "change"

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
          // Apply paint type
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

    // Save all affected cycles
    Object.keys(updatesByCycle).forEach(key => {
        const idx = parseInt(key);
        if (idx === cycleIndex) {
            setDays(updatesByCycle[idx]);
        } else {
            const existing = loadCycleData(idx);
            saveCycleData(idx, updatesByCycle[idx], existing.previousBalance);
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
            cycleEndDate
        );
        setReport(result);
    } catch (e: any) {
        alert(e.message);
    } finally {
        setLoading(false);
    }
  };

  const handleResetApp = () => {
      if (confirm("Reset application data? This cannot be undone.")) {
          isResettingRef.current = true;
          // Force a small delay to ensure any pending state updates don't clobber the clear
          // and to ensure the browser has time to process the clear before reload.
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
                  alert('Data restored successfully. Reloading...');
                  window.location.reload();
              } else {
                  alert('Invalid backup file.');
              }
          } catch (err) {
              alert('Failed to parse backup file.');
          }
      };
      reader.readAsText(file);
  };

  // Welcome / Setup Screen
  if (!startDate) {
      return (
          <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
              <div className="max-w-sm w-full bg-white p-8 rounded-3xl shadow-2xl border border-slate-100">
                  <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-6 mx-auto shadow-sm">
                      <PursuitCraft size={32} fill="currentColor" className="text-blue-500" />
                  </div>
                  <h1 className="text-2xl font-black text-slate-900 text-center mb-2 tracking-tight">ShiftCycle</h1>
                  <p className="text-slate-500 text-center mb-8 text-sm">Set your anchor date to start tracking.</p>
                  
                  <div className="space-y-5">
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-400 mb-1.5 block tracking-wider">Staff Number</label>
                        <input 
                            type="text" 
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 placeholder-slate-300"
                            placeholder="e.g. 12345"
                            value={staffNumber}
                            onChange={(e) => setStaffNumber(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold uppercase text-slate-400 mb-1.5 block tracking-wider">Cycle Start Date</label>
                        <input 
                            type="date" 
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                         <p className="text-[10px] text-slate-400 mt-2.5 leading-relaxed bg-blue-50 p-2 rounded-lg text-blue-600">
                            <Info size={10} className="inline mr-1" />
                            Pick the first day of <strong>ANY</strong> previous cycle. All future cycles will be calculated from this date.
                         </p>
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
    { type: EntryType.REGULAR_SHIFT, label: 'Work', color: 'bg-blue-600 border-blue-600 text-white' },
    { type: EntryType.OFF_DAY, label: 'Off', color: 'bg-slate-100 border-slate-200 text-slate-500' },
    { type: EntryType.LEAVE_VL, label: 'VL', color: 'bg-blue-100 border-blue-200 text-blue-700' },
    { type: EntryType.LEAVE_HOLIDAY, label: 'HL', color: 'bg-indigo-100 border-indigo-200 text-indigo-700' },
    { type: EntryType.TIME_OFF, label: 'T/O', color: 'bg-orange-100 border-orange-200 text-orange-700' },
  ];

  return (
    <div className="pb-40 max-w-lg mx-auto bg-slate-50 min-h-screen shadow-2xl relative">
      
      {/* Top Header */}
      <div className="bg-slate-900 text-white pt-safe px-4 pb-6 rounded-b-[2.5rem] shadow-xl relative overflow-hidden transition-all duration-300">
         <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2 pointer-events-none" />
         
         <div className="relative z-10 flex justify-between items-center mb-6 pt-2">
             <div>
                <h1 className="font-black text-xl tracking-tight flex items-center gap-2">
                    <PursuitCraft className="text-yellow-400 fill-yellow-400" size={20} />
                    ShiftCycle
                </h1>
             </div>
             <button onClick={() => setShowSettings(!showSettings)} className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-all active:scale-95 backdrop-blur-md">
                 <Settings size={20} />
             </button>
         </div>

         {/* Settings Drawer */}
         {showSettings && (
             <div className="mb-6 bg-slate-800/80 backdrop-blur-xl rounded-2xl p-4 animate-in fade-in slide-in-from-top-4 border border-white/10 shadow-2xl">
                 <h3 className="text-xs font-bold uppercase text-slate-400 mb-4 flex items-center gap-2"><UserCircle size={14}/> Settings</h3>
                 <div className="space-y-4 mb-4">
                     <div>
                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1.5">Staff Number</label>
                        <input 
                            type="text" 
                            value={staffNumber} 
                            onChange={(e) => setStaffNumber(e.target.value)} 
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                     </div>
                     <div>
                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1.5">Anchor Date</label>
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Changing this shifts all cycles.</p>
                     </div>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-2 mb-4">
                     <button onClick={handleBackup} className="py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs rounded-xl font-bold transition-colors flex items-center justify-center gap-2 border border-blue-500/20">
                         <Download size={14} /> Backup Data
                     </button>
                     <label className="py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs rounded-xl font-bold transition-colors flex items-center justify-center gap-2 border border-blue-500/20 cursor-pointer">
                         <Upload size={14} /> Restore Data
                         <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
                     </label>
                 </div>

                 <button onClick={handleResetApp} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded-xl font-bold transition-colors flex items-center justify-center gap-2 border border-red-500/20">
                     <RefreshCcw size={14} /> Reset Application Data
                 </button>
             </div>
         )}

         {/* Cycle Nav */}
         <div className="flex items-center justify-between bg-white/5 backdrop-blur-lg rounded-2xl p-1 mb-3 border border-white/10 shadow-lg">
             <button onClick={() => handleCycleChange(cycleIndex - 1)} className="p-3 hover:bg-white/10 rounded-xl text-slate-300 transition-colors">
                 <ChevronLeft size={20} />
             </button>
             <div className="text-center">
                 <div className="text-sm font-bold text-white tracking-wide">
                     {cycleStartDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {cycleEndDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                 </div>
             </div>
             <button onClick={() => handleCycleChange(cycleIndex + 1)} className="p-3 hover:bg-white/10 rounded-xl text-slate-300 transition-colors">
                 <ChevronRight size={20} />
             </button>
         </div>
         
         <div className="flex justify-center">
             <button onClick={handleJumpToToday} className="text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 px-4 py-1.5 rounded-full flex items-center gap-1.5 transition-colors font-bold border border-blue-500/20">
                 <CalendarClock size={12} /> Jump to Today
             </button>
         </div>
      </div>

      {/* Main Content */}
      <div className="px-4 mt-4 relative z-20 space-y-4">
        
        {/* Previous Balance Card */}
        <div className={`p-4 rounded-2xl border shadow-lg flex items-center justify-between transition-colors ${previousBalance < 0 ? 'bg-white border-red-100' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${previousBalance < 0 ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-500'}`}>
                    <History size={20} />
                </div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Carried Over</div>
                    <div className="text-xs font-medium text-slate-600">
                        {isLinkedBalance ? 'Auto-linked' : 'Manual Edit'}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div className="relative flex items-center">
                    <input 
                        type="number" 
                        step="0.01"
                        value={previousBalance}
                        onChange={(e) => {
                            setPreviousBalance(parseFloat(e.target.value) || 0);
                            setIsLinkedBalance(false);
                        }}
                        className={`text-right w-32 pr-6 font-black text-xl bg-transparent border-b-2 border-transparent focus:border-blue-500 outline-none transition-all ${previousBalance < 0 ? 'text-red-500' : 'text-slate-800'}`}
                    />
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300 pointer-events-none mt-0.5">h</span>
                </div>
                
                {!isLinkedBalance && (
                    <button 
                        onClick={() => {
                            const { balance, isLinked } = getEffectivePreviousBalance(cycleIndex);
                            setPreviousBalance(balance);
                            setIsLinkedBalance(isLinked);
                        }}
                        className="p-2 bg-slate-100 text-slate-400 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        title="Re-link to previous cycle history"
                    >
                        <RefreshCcw size={14} />
                    </button>
                )}
            </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 relative overflow-hidden">
            {isPaintMode && (
                <div className="absolute top-0 left-0 right-0 bg-blue-600 text-white text-[10px] font-bold py-1 text-center z-10 animate-in fade-in slide-in-from-top-1">
                    QUICK ASSIGN MODE ACTIVE
                </div>
            )}
            <div className="flex justify-between items-center mb-5 mt-2">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <CalendarIcon size={18} className="text-blue-600" />
                    Days
                </h2>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsPaintMode(!isPaintMode)}
                        className={`
                            text-[10px] font-bold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 border
                            ${isPaintMode 
                                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                                : 'text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100'
                            }
                        `}
                    >
                        {isPaintMode ? <Check size={12} /> : <PaintBucket size={12} />}
                        {isPaintMode ? 'Done' : 'Quick Assign'}
                    </button>
                    {!isPaintMode && (
                         <button 
                            onClick={() => setIsWizardOpen(true)}
                            className="text-[10px] font-bold text-purple-600 bg-purple-50 px-3 py-2 rounded-xl hover:bg-purple-100 transition-colors flex items-center gap-1.5 border border-purple-100"
                        >
                            <Wand2 size={12} /> Wizard
                        </button>
                    )}
                </div>
            </div>
            
            {/* Paint Palette */}
            {isPaintMode && (
                <div className="mb-4 bg-slate-50 p-2 rounded-xl flex gap-2 overflow-x-auto pb-2 border border-slate-100">
                    {PAINT_OPTIONS.map(opt => (
                        <button
                            key={opt.type}
                            onClick={() => setPaintType(opt.type)}
                            className={`
                                flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold border transition-all
                                ${paintType === opt.type 
                                    ? `${opt.color} ring-2 ring-offset-1 ring-blue-300` 
                                    : 'bg-white border-slate-200 text-slate-500 opacity-60'
                                }
                            `}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
            
            <div className="grid grid-cols-6 gap-2 mb-2">
                {['M','T','W','T','F','S'].map(d => (
                    <div key={d} className="text-center text-[10px] font-bold text-slate-300 uppercase">{d}</div>
                ))}
            </div>
            
            <div className="grid grid-cols-6 gap-2">
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

        {/* Report Area */}
        {report && (
            <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-indigo-600">
                        <PursuitCraft size={20} fill="currentColor" className="text-indigo-100" />
                        <h2 className="font-bold text-lg">Report</h2>
                    </div>
                    <button onClick={() => setReport(null)} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
                </div>
                <div className="prose prose-sm prose-slate max-w-none bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <ReactMarkdown>{report}</ReactMarkdown>
                </div>
                <button 
                    onClick={() => navigator.clipboard.writeText(report)} 
                    className="mt-4 w-full py-3 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                >
                    <Save size={14} /> Copy to Clipboard
                </button>
            </div>
        )}

        <div className="h-24" /> {/* Spacer for fixed bottom panel */}
      </div>

      {/* Selected Day Modal (Popup) */}
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

      {/* Other Modals - Conditionally rendered to force reset on close */}
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

      <StatsPanel 
        totalWorked={cycleStats.totalWorked}
        balance={cycleStats.netBalance}
        adjustedTarget={cycleStats.adjustedTarget}
        trainingDays={cycleStats.trainingDays}
        previousBalance={previousBalance}
        onGenerate={handleGenerateReport}
        isLoading={loading}
      />

    </div>
  );
};

export default App;
