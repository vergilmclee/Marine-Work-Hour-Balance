
import React, { useState, useEffect } from 'react';
import { DayEntry, EntryType, HOURS_CONFIG } from '../types';
import { GraduationCap, ArrowRightCircle, Check, X, CalendarRange, Info, MapPin, FileText, Clock, ArrowRight, ArrowLeftCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface SituationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  days: DayEntry[];
  startDate: Date;
  onApply: (updates: Partial<DayEntry>[]) => void;
  onApplyRange: (start: Date, end: Date, type: EntryType, note: string, courseName?: string, courseLocation?: string, customHours?: number, startTime?: string, endTime?: string, breakMinutes?: number) => void;
}

type SituationMode = 'SELECT_TYPE' | 'TRAINING_DATES' | 'REDEPLOY_DATE' | 'JOIN_DATE';
type InputMode = 'GRID' | 'RANGE';

const SituationWizard: React.FC<SituationWizardProps> = ({ isOpen, onClose, days, startDate, onApply, onApplyRange }) => {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<SituationMode>('SELECT_TYPE');
  const [inputMode, setInputMode] = useState<InputMode>('GRID');
  const [selectedDayIds, setSelectedDayIds] = useState<number[]>([]);
  
  // Training Details
  const [courseName, setCourseName] = useState('');
  const [courseLocation, setCourseLocation] = useState('');
  
  // Time Calculation State
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState<string>('0');
  
  // Date Range State
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  if (!isOpen) return null;

  const getDayDate = (dayId: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + (dayId - 1));
    return d;
  };

  const calculateHours = (): number => {
    if (!startTime || !endTime) return 0;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startDateObj = new Date(0, 0, 0, startH, startM);
    const endDateObj = new Date(0, 0, 0, endH, endM);

    let diffMs = endDateObj.getTime() - startDateObj.getTime();
    if (diffMs < 0) {
        diffMs += 24 * 60 * 60 * 1000;
    }

    const totalMinutes = diffMs / (1000 * 60);
    const bMins = parseInt(breakMinutes) || 0;
    const netMinutes = Math.max(0, totalMinutes - bMins);
    return parseFloat((netMinutes / 60).toFixed(2));
  };

  const handleApplyTraining = () => {
    const note = courseName ? `${t('wizard_note_training')}: ${courseName}` : t('wizard_note_training');
    const hours = calculateHours();
    const bMins = parseInt(breakMinutes) || 0;

    if (inputMode === 'RANGE') {
        if (!rangeStart || !rangeEnd) return;
        const [sy, sm, sd] = rangeStart.split('-').map(Number);
        const [ey, em, ed] = rangeEnd.split('-').map(Number);
        const s = new Date(sy, sm - 1, sd);
        const e = new Date(ey, em - 1, ed);
        
        onApplyRange(
            s, e, EntryType.COURSE_TRAINING, note, 
            courseName, courseLocation, hours,
            startTime, endTime, bMins
        );
        onClose();
    } else {
        const updates = selectedDayIds.map(id => ({
          dayId: id,
          type: EntryType.COURSE_TRAINING,
          customHours: hours,
          note: note,
          courseName: courseName || undefined,
          courseLocation: courseLocation || undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          breakMinutes: bMins
        }));
        onApply(updates);
        onClose();
    }
  };

  const handleApplyRedeploy = () => {
    if (selectedDayIds.length !== 1) return;
    const lastDayId = selectedDayIds[0];
    
    // All days AFTER lastDayId become TRANSFERRED_OUT
    const updates = days
      .filter(d => d.dayId > lastDayId)
      .map(d => ({
        dayId: d.dayId,
        type: EntryType.TRANSFERRED_OUT,
        customHours: 0,
        note: t('wizard_note_transfer')
      }));
    
    onApply(updates);
    onClose();
  };

  const handleApplyJoin = () => {
    if (selectedDayIds.length !== 1) return;
    const firstDayId = selectedDayIds[0];
    
    // All days BEFORE firstDayId become TRANSFERRED_OUT (Not Joined Yet)
    const updates = days
      .filter(d => d.dayId < firstDayId)
      .map(d => ({
        dayId: d.dayId,
        type: EntryType.TRANSFERRED_OUT,
        customHours: 0,
        note: t('wizard_note_join')
      }));
    
    onApply(updates);
    onClose();
  };

  const toggleDaySelection = (dayId: number) => {
    if (mode === 'REDEPLOY_DATE' || mode === 'JOIN_DATE') {
      setSelectedDayIds([dayId]);
    } else {
      if (selectedDayIds.includes(dayId)) {
        setSelectedDayIds(prev => prev.filter(id => id !== dayId));
      } else {
        setSelectedDayIds(prev => [...prev, dayId]);
      }
    }
  };

  const calculatedHours = calculateHours();

  const renderCalendarGrid = () => {
    return (
      <div className="grid grid-cols-6 gap-2 mt-4">
        {days.map(day => {
          const date = getDayDate(day.dayId);
          const isSelected = selectedDayIds.includes(day.dayId);
          
          let isFutureGhost = false;
          if (mode === 'REDEPLOY_DATE' && selectedDayIds.length > 0) {
             if (day.dayId > selectedDayIds[0]) isFutureGhost = true;
          }
          if (mode === 'JOIN_DATE' && selectedDayIds.length > 0) {
             if (day.dayId < selectedDayIds[0]) isFutureGhost = true;
          }

          return (
            <button
              key={day.dayId}
              onClick={() => toggleDaySelection(day.dayId)}
              className={`
                aspect-square rounded-lg border text-xs flex flex-col items-center justify-center relative
                ${isSelected 
                  ? 'bg-indigo-600 border-indigo-700 text-white ring-2 ring-indigo-200' 
                  : isFutureGhost 
                    ? 'bg-slate-100 text-slate-300 border-dashed border-slate-300'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }
              `}
            >
              <span className="font-bold">{date.getDate()}</span>
              <span className="text-[8px] uppercase">{date.toLocaleDateString(language === 'zh-HK' ? 'zh-HK' : 'en-US', { weekday: 'short' })}</span>
              {isSelected && <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border border-white translate-x-1/4 -translate-y-1/4" />}
            </button>
          );
        })}
      </div>
    );
  };

  const renderDateRangeInput = () => {
      return (
          <div className="mt-4 space-y-4">
              <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg flex gap-3 text-xs text-yellow-800">
                  <Info className="w-4 h-4 shrink-0 text-yellow-600" />
                  <p>{t('wizard_range_info')}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">From</label>
                      <input 
                        type="date" 
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                      />
                  </div>
                  <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">To</label>
                       <input 
                        type="date" 
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                      />
                  </div>
              </div>
          </div>
      )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[80] backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[90] pb-safe animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur z-10">
          <h2 className="font-bold text-lg text-slate-800">
            {mode === 'SELECT_TYPE' && t('select_situation')}
            {mode === 'TRAINING_DATES' && t('select_days')}
            {mode === 'REDEPLOY_DATE' && t('confirm_last_day')}
            {mode === 'JOIN_DATE' && t('confirm_first_day')}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          
          {/* Step 1: Selection Mode */}
          {mode === 'SELECT_TYPE' && (
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => setMode('TRAINING_DATES')}
                className="flex items-center gap-4 p-4 rounded-xl border border-purple-200 bg-purple-50 text-left hover:bg-purple-100 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-purple-200 flex items-center justify-center text-purple-700 shrink-0">
                  <GraduationCap size={24} />
                </div>
                <div>
                  <div className="font-bold text-slate-900">{t('attend_training')}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('attend_training_desc')}</div>
                </div>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setMode('REDEPLOY_DATE')}
                  className="flex flex-col gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 text-left hover:bg-slate-100 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                    <ArrowRightCircle size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{t('redeploy')}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t('redeploy_desc')}</div>
                  </div>
                </button>

                <button 
                  onClick={() => setMode('JOIN_DATE')}
                  className="flex flex-col gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 text-left hover:bg-blue-100 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                    <ArrowLeftCircle size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{t('join_team')}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t('join_team_desc')}</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Training Date Selection */}
          {mode === 'TRAINING_DATES' && (
            <div>
               {/* Training Details Inputs */}
               <div className="mb-6 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                      <FileText size={12} /> {t('course_name')}
                    </label>
                    <input 
                      type="text" 
                      placeholder="..."
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                      <MapPin size={12} /> {t('location')}
                    </label>
                    <input 
                      type="text" 
                      placeholder="..."
                      value={courseLocation}
                      onChange={(e) => setCourseLocation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Time Calculator for Course Duration */}
                  <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">{t('start_time')}</label>
                            <input 
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-400"
                            />
                        </div>
                        <div className="flex items-center justify-center pt-5 text-slate-300">
                            <ArrowRight size={14} />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">{t('end_time')}</label>
                            <input 
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-400"
                            />
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                          <div className="w-1/3">
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">{t('break_min')}</label>
                              <input 
                                  type="number"
                                  placeholder="0"
                                  value={breakMinutes}
                                  onChange={(e) => setBreakMinutes(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-400"
                              />
                          </div>
                          <div className="text-right">
                              <label className="text-[10px] font-bold text-purple-400 uppercase block mb-1">{t('impact_hours')}</label>
                              <div className="text-xl font-black text-purple-600">
                                  {calculatedHours > 0 ? calculatedHours.toFixed(2) : '--'} <span className="text-sm font-bold text-purple-300">h</span>
                              </div>
                          </div>
                      </div>
                      
                      <div className="text-[10px] text-slate-400 leading-tight">
                         {t('reduction_value')} (Default: {HOURS_CONFIG.AVERAGE_DAILY_HOURS.toFixed(2)}h)
                      </div>
                  </div>
               </div>

               <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                   <button 
                     onClick={() => setInputMode('GRID')}
                     className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${inputMode === 'GRID' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                   >
                     {t('select_days')}
                   </button>
                   <button 
                     onClick={() => setInputMode('RANGE')}
                     className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${inputMode === 'RANGE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                   >
                     <CalendarRange size={12} /> {t('date_range')}
                   </button>
               </div>

              {inputMode === 'GRID' ? (
                <>
                    <p className="text-sm text-slate-500">{t('tap_dates_training')}</p>
                    {renderCalendarGrid()}
                </>
              ) : (
                  renderDateRangeInput()
              )}

              <button 
                onClick={handleApplyTraining}
                disabled={inputMode === 'GRID' ? selectedDayIds.length === 0 : (!rangeStart || !rangeEnd)}
                className="w-full mt-6 bg-purple-600 text-white py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-purple-200"
              >
                <Check size={18} /> 
                {inputMode === 'GRID' 
                    ? t('apply_n_days', { n: selectedDayIds.length })
                    : t('apply_range')
                }
              </button>
            </div>
          )}

          {/* Step 3: Redeploy Date Selection */}
          {mode === 'REDEPLOY_DATE' && (
            <div>
              <p className="text-sm text-slate-500">{t('tap_last_day')}</p>
              {renderCalendarGrid()}
              <button 
                onClick={handleApplyRedeploy}
                disabled={selectedDayIds.length === 0}
                className="w-full mt-6 bg-slate-800 text-white py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                <Check size={18} /> {t('confirm_last_day')}
              </button>
            </div>
          )}

          {/* Step 4: Join Date Selection */}
          {mode === 'JOIN_DATE' && (
            <div>
              <p className="text-sm text-slate-500">{t('tap_first_day')}</p>
              {renderCalendarGrid()}
              <button 
                onClick={handleApplyJoin}
                disabled={selectedDayIds.length === 0}
                className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-blue-200"
              >
                <Check size={18} /> {t('confirm_first_day')}
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default SituationWizard;
