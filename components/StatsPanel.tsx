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
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-safe pt-3 px-4 z-50">
      <div className="max-w-md mx-auto flex flex-col gap-3">
        
        {/* Progress & Target Row */}
        <div className="flex items-end justify-between text-xs mb-1">
             <div className="flex flex-col">
                 <span className="text-slate-500 font-medium uppercase tracking-wider flex items-center gap-1">
                    <Target size={12} /> Target
                 </span>
                 <span className="text-slate-900 font-bold text-base">
                    {adjustedTarget.toFixed(1)}h
                    {trainingDays > 0 && <span className="text-purple-600 text-[10px] ml-1">(-{trainingDays} course)</span>}
                 </span>
             </div>
             <div className="flex flex-col items-end">
                 <span className="text-slate-500 font-medium uppercase tracking-wider">Worked</span>
                 <span className="text-indigo-600 font-bold text-base">{totalWorked.toFixed(1)}h</span>
             </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative mb-1">
            <div 
                className={`h-full transition-all duration-500 ${totalWorked >= adjustedTarget ? 'bg-green-500' : 'bg-indigo-500'}`} 
                style={{ width: `${progressPercent}%` }}
            ></div>
        </div>

        {/* Main Stats Footer */}
        <div className="flex items-center justify-between gap-4">
            
            {/* Balance Display */}
            <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    {previousBalance !== 0 && <History size={10} className={previousBalance > 0 ? "text-green-500" : "text-red-500"} />}
                    Net Balance
                </span>
                <div className={`text-2xl font-black flex items-center gap-1 leading-none ${isSurplus ? 'text-green-600' : 'text-red-500'}`}>
                    {isSurplus ? '+' : ''}{balance.toFixed(1)}
                    <span className="text-sm font-medium text-slate-400">h</span>
                </div>
                {isSurplus && balance > 4 && (
                    <span className="text-[10px] text-green-600 font-medium mt-0.5 animate-in fade-in">
                       ≈ {potentialOilDays} Days / {potentialFullShifts} Shifts OIL
                    </span>
                )}
            </div>

            {/* Action Button */}
            <button
                onClick={onGenerate}
                disabled={isLoading}
                className={`
                    flex-1 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95
                    flex items-center justify-center gap-2 text-sm
                    ${isLoading 
                    ? 'bg-slate-100 text-slate-400' 
                    : isSurplus 
                        ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }
                `}
            >
                {isLoading ? (
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-white rounded-full animate-spin" />
                ) : (
                    <>
                    {isSurplus ? <Leaf size={18} /> : <CheckCircle2 size={18} />}
                    {isSurplus ? "Suggest OIL Plan" : "Analyze Report"}
                    </>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;