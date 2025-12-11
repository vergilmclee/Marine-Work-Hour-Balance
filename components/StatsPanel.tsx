
import React from 'react';
import { HOURS_CONFIG } from '../types';
import { ArrowUpCircle, ArrowDownCircle, CheckCircle2, GraduationCap, Target, History, Leaf } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

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
  const { t } = useLanguage();
  const isSurplus = balance >= 0;
  // Progress calculation strictly on worked vs target (ignoring previous balance for the bar visual)
  const progressPercent = Math.min((totalWorked / adjustedTarget) * 100, 100);

  // Calculate potential OIL (Time-off Lieu) metrics
  const potentialOilDays = Math.floor(balance / HOURS_CONFIG.LEAVE_HOURS);
  const potentialFullShifts = Math.floor(balance / HOURS_CONFIG.REGULAR_SHIFT_HOURS);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50 rounded-t-[2rem] pt-3 px-4 pb-safe transition-all">
      <div className="max-w-md mx-auto flex flex-col gap-2 pb-1">
        
        {/* Top Row: Target & Worked */}
        <div className="flex items-end justify-between">
             {/* Target Section */}
             <div className="flex flex-col">
                 <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mb-0.5">
                    <Target size={10} strokeWidth={2.5} /> {t('target')}
                 </span>
                 <div className="flex items-baseline gap-1">
                    <span className="text-slate-900 font-black text-2xl tracking-tight leading-none">
                        {adjustedTarget.toFixed(1)}h
                    </span>
                    {trainingDays > 0 && <span className="text-purple-600 text-[8px] font-bold bg-purple-50 px-1.5 py-0.5 rounded-md">-{trainingDays} {t('type_course')}</span>}
                 </div>
             </div>
             
             {/* Worked Section */}
             <div className="flex flex-col items-end">
                 <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">{t('worked')}</span>
                 <span className="text-indigo-600 font-black text-2xl tracking-tight leading-none">
                    {totalWorked.toFixed(1)}<span className="text-sm font-bold text-indigo-300 ml-0.5">h</span>
                 </span>
             </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative my-0.5">
            <div 
                className={`h-full rounded-full transition-all duration-700 ease-out ${totalWorked >= adjustedTarget ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-indigo-400 to-indigo-500'}`} 
                style={{ width: `${progressPercent}%` }}
            ></div>
        </div>

        {/* Bottom Row: Balance & Action */}
        <div className="flex items-end justify-between gap-4">
            
            {/* Balance Display */}
            <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1 mb-0.5">
                    {previousBalance !== 0 && <History size={10} className={previousBalance > 0 ? "text-green-500" : "text-red-500"} />}
                    {t('net_balance')}
                </span>
                <div className={`text-3xl font-black flex items-baseline tracking-tighter leading-none ${isSurplus ? 'text-green-500' : 'text-red-500'}`}>
                    {isSurplus ? '+' : ''}{balance.toFixed(1)}
                    <span className="text-base font-bold text-slate-300 ml-1">h</span>
                </div>
            </div>

            {/* Action Button - Gradient Style */}
            <button
                onClick={onGenerate}
                disabled={isLoading}
                className={`
                    relative group overflow-hidden px-4 py-2 rounded-xl font-bold shadow-lg transition-all active:scale-95
                    flex items-center gap-2 text-xs text-white h-10
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
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <>
                    {isSurplus ? <CheckCircle2 size={16} strokeWidth={2.5} /> : <CheckCircle2 size={16} strokeWidth={2.5} />}
                    <span className="relative whitespace-nowrap">{isSurplus ? t('suggest_oil') : t('analyze_report')}</span>
                    </>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;
