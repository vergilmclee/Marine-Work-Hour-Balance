
import React from 'react';
import { HOURS_CONFIG } from '../types';
import { ArrowUpCircle, ArrowDownCircle, CheckCircle2, GraduationCap, Target, History, Leaf } from 'lucide-react';

interface StatsPanelProps {
  totalWorked: number;
  balance: number;
  adjustedTarget: number;
  trainingDays: number;
  previousBalance: number;
  onGenerate: () => void;
  isLoading: boolean;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ 
  totalWorked, 
  balance, 
  adjustedTarget,
  trainingDays,
  previousBalance,
  onGenerate, 
  isLoading 
}) => {
  const isSurplus = balance >= 0;
  // Progress calculation strictly on worked vs target (ignoring previous balance for the bar visual)
  const progressPercent = Math.min((totalWorked / adjustedTarget) * 100, 100);

  // Calculate potential OIL (Time-off Lieu) metrics
  const potentialOilDays = Math.floor(balance / HOURS_CONFIG.LEAVE_HOURS);
  const potentialFullShifts = Math.floor(balance / HOURS_CONFIG.REGULAR_SHIFT_HOURS);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50 rounded-t-[2.5rem] pt-6 px-6 pb-safe">
      <div className="max-w-md mx-auto flex flex-col gap-6 pb-6">
        
        {/* Top Row: Target & Worked */}
        <div className="flex items-end justify-between">
             {/* Target Section */}
             <div className="flex flex-col gap-1">
                 <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <Target size={12} strokeWidth={2.5} /> Target
                 </span>
                 <div className="flex items-baseline gap-1">
                    <span className="text-slate-900 font-black text-2xl tracking-tight leading-none">
                        {adjustedTarget.toFixed(1)}h
                    </span>
                    {trainingDays > 0 && <span className="text-purple-600 text-[9px] font-bold bg-purple-50 px-1.5 py-0.5 rounded-md">-{trainingDays} course</span>}
                 </div>
             </div>
             
             {/* Worked Section */}
             <div className="flex flex-col items-end gap-1">
                 <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Worked</span>
                 <span className="text-indigo-600 font-black text-2xl tracking-tight leading-none">
                    {totalWorked.toFixed(1)}<span className="text-base font-bold text-indigo-300 ml-0.5">h</span>
                 </span>
             </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
            <div 
                className={`h-full rounded-full transition-all duration-700 ease-out ${totalWorked >= adjustedTarget ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-indigo-400 to-indigo-500'}`} 
                style={{ width: `${progressPercent}%` }}
            ></div>
        </div>

        {/* Bottom Row: Balance & Action */}
        <div className="flex items-end justify-between gap-4">
            
            {/* Balance Display */}
            <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                    {previousBalance !== 0 && <History size={10} className={previousBalance > 0 ? "text-green-500" : "text-red-500"} />}
                    Net Balance
                </span>
                <div className={`text-3xl font-black flex items-baseline tracking-tighter leading-none ${isSurplus ? 'text-green-500' : 'text-red-500'}`}>
                    {isSurplus ? '+' : ''}{balance.toFixed(1)}
                    <span className="text-lg font-bold text-slate-300 ml-1">h</span>
                </div>
            </div>

            {/* Action Button - Gradient Style */}
            <button
                onClick={onGenerate}
                disabled={isLoading}
                className={`
                    relative group overflow-hidden px-5 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95
                    flex items-center gap-2 text-sm text-white
                    ${isLoading 
                        ? 'bg-slate-100 text-slate-400 shadow-none cursor-wait' 
                        : isSurplus 
                            ? 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-green-200 hover:shadow-green-300'
                            : 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-indigo-200 hover:shadow-indigo-300'
                    }
                `}
            >
                 <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <>
                    {isSurplus ? <CheckCircle2 size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}
                    <span className="relative whitespace-nowrap">{isSurplus ? "Suggest OIL Plan" : "Analyze Report"}</span>
                    </>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;
