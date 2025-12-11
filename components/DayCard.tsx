
import React, { useEffect, useState } from 'react';
import { DayEntry, EntryType, HOURS_CONFIG } from '../types';
import { Briefcase, Sun, Calendar, Clock, Edit3, GraduationCap, ArrowRightCircle, MapPin, AlertCircle, ArrowRight, Check, MinusCircle } from 'lucide-react';

interface DayCardProps {
  entry: DayEntry;
  date: Date;
  onChange: (updatedEntry: DayEntry) => void;
  onClose?: () => void;
}

const DayCard: React.FC<DayCardProps> = ({ entry, date, onChange, onClose }) => {
  // Local state for calculator to ensure smooth typing before committing to entry
  const [startTime, setStartTime] = useState(entry.startTime || '');
  const [endTime, setEndTime] = useState(entry.endTime || '');
  const [breakMinutes, setBreakMinutes] = useState(entry.breakMinutes || 0);

  // Sync local state when entry changes externally (e.g. switching days)
  useEffect(() => {
    setStartTime(entry.startTime || '');
    setEndTime(entry.endTime || '');
    setBreakMinutes(entry.breakMinutes || 0);
  }, [entry.dayId, entry.startTime, entry.endTime, entry.breakMinutes]);

  const getIcon = () => {
    switch (entry.type) {
      case EntryType.REGULAR_SHIFT: return <Briefcase className="w-5 h-5 text-white" />;
      case EntryType.OFF_DAY: return <Sun className="w-5 h-5 text-slate-400" />;
      case EntryType.LEAVE_VL:
      case EntryType.LEAVE_HOLIDAY: return <Calendar className="w-5 h-5 text-blue-600" />;
      case EntryType.COURSE_TRAINING: return <GraduationCap className="w-5 h-5 text-purple-600" />;
      case EntryType.TRANSFERRED_OUT: return <ArrowRightCircle className="w-5 h-5 text-slate-400" />;
      case EntryType.TIME_OFF: return <MinusCircle className="w-5 h-5 text-orange-500" />;
      case EntryType.CUSTOM: return <Clock className="w-5 h-5 text-amber-600" />;
    }
  };

  const getBgColor = () => {
    switch (entry.type) {
      case EntryType.REGULAR_SHIFT: return 'bg-blue-600 from-blue-600 to-blue-700 bg-gradient-to-br text-white shadow-blue-200';
      case EntryType.OFF_DAY: return 'bg-white border-slate-100 shadow-sm';
      case EntryType.LEAVE_VL:
      case EntryType.LEAVE_HOLIDAY: return 'bg-blue-50 border-blue-200';
      case EntryType.COURSE_TRAINING: return 'bg-purple-50 border-purple-200';
      case EntryType.TRANSFERRED_OUT: return 'bg-slate-100 border-slate-200';
      case EntryType.TIME_OFF: return 'bg-orange-50 border-orange-200';
      case EntryType.CUSTOM: return 'bg-amber-50 border-amber-200';
    }
  };

  const setType = (newType: EntryType) => {
    let newHours = 0;
    switch (newType) {
      case EntryType.REGULAR_SHIFT: newHours = HOURS_CONFIG.REGULAR_SHIFT_HOURS; break;
      case EntryType.LEAVE_VL:
      case EntryType.LEAVE_HOLIDAY: newHours = HOURS_CONFIG.LEAVE_HOURS; break;
      case EntryType.CUSTOM: newHours = entry.customHours || 0; break;
      case EntryType.COURSE_TRAINING: newHours = 0; break;
      case EntryType.TRANSFERRED_OUT: newHours = 0; break;
      case EntryType.TIME_OFF: newHours = 0; break; // Default deduction 0
      default: newHours = 0;
    }
    
    // Reset calculator fields when switching types to avoid confusion
    onChange({ 
        ...entry, 
        type: newType, 
        customHours: newHours,
        startTime: '',
        endTime: '',
        breakMinutes: 0
    });
  };

  const handleManualHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onChange({ ...entry, customHours: isNaN(val) ? 0 : val });
  };

  // --- Time Calculator Logic ---
  const calculateHours = (start: string, end: string, breakMins: number) => {
    if (!start || !end) return;

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    const startDateObj = new Date(0, 0, 0, startH, startM);
    const endDateObj = new Date(0, 0, 0, endH, endM);

    let diffMs = endDateObj.getTime() - startDateObj.getTime();
    if (diffMs < 0) {
        diffMs += 24 * 60 * 60 * 1000; // Handle overnight shift (e.g. 20:00 to 08:00)
    }

    const totalMinutes = diffMs / (1000 * 60);
    const netMinutes = Math.max(0, totalMinutes - breakMins);
    const netHours = parseFloat((netMinutes / 60).toFixed(2));

    onChange({
        ...entry,
        startTime: start,
        endTime: end,
        breakMinutes: breakMins,
        customHours: netHours
    });
  };

  const handleTimeChange = (field: 'start' | 'end' | 'break', value: string) => {
      let s = startTime;
      let e = endTime;
      let b = breakMinutes;

      if (field === 'start') { setStartTime(value); s = value; }
      if (field === 'end') { setEndTime(value); e = value; }
      if (field === 'break') { 
          const val = parseInt(value) || 0;
          setBreakMinutes(val); 
          b = val; 
      }

      calculateHours(s, e, b);
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...entry, note: e.target.value });
  };
  
  const handleCourseNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...entry, courseName: e.target.value });
  };
  
  const handleCourseLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...entry, courseLocation: e.target.value });
  };

  // Format Date
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Filtered out COURSE_TRAINING and TRANSFERRED_OUT as requested
  const TYPE_BUTTONS = [
      { id: EntryType.REGULAR_SHIFT, label: 'Work', icon: Briefcase },
      { id: EntryType.OFF_DAY, label: 'Off', icon: Sun },
      { id: EntryType.LEAVE_VL, label: 'Leave', icon: Calendar },
      { id: EntryType.CUSTOM, label: 'Custom', icon: Clock },
  ];

  const QUICK_TYPES = [
      { id: EntryType.LEAVE_VL, label: 'V/L' },
      { id: EntryType.LEAVE_HOLIDAY, label: 'H/L' },
      { id: EntryType.TIME_OFF, label: 'T/O' },
  ];

  const isWizardType = entry.type === EntryType.COURSE_TRAINING || entry.type === EntryType.TRANSFERRED_OUT;
  const isTimeInputVisible = entry.type === EntryType.CUSTOM || entry.type === EntryType.TIME_OFF;
  const isDeductionType = entry.type === EntryType.TIME_OFF;

  const getConfirmButtonStyle = () => {
      if (entry.type === EntryType.REGULAR_SHIFT) {
          return 'bg-white text-blue-600 hover:bg-blue-50';
      }
      return 'bg-slate-900 text-white hover:bg-slate-800';
  }

  return (
    <div className={`relative p-5 rounded-3xl border transition-all duration-200 shadow-xl ${getBgColor()}`}>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col">
           <span className={`text-xs font-bold uppercase tracking-wider mb-0.5 opacity-80 ${entry.type === EntryType.REGULAR_SHIFT ? 'text-blue-100' : 'text-slate-500'}`}>{dayName}</span>
           <span className={`text-xl font-black ${entry.type === EntryType.REGULAR_SHIFT ? 'text-white' : 'text-slate-800'}`}>{fullDate}</span>
        </div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${entry.type === EntryType.REGULAR_SHIFT ? 'bg-white/20 backdrop-blur-md' : 'bg-white'}`}>
            {getIcon()}
        </div>
      </div>

      {/* Main Form Area */}
      <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-1 space-y-2">
          
          {/* Status Banner for Wizard Types */}
          {isWizardType && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle size={16} className="text-slate-400 mt-0.5 shrink-0" />
                  <div>
                      <div className="text-xs font-bold text-slate-700 uppercase">
                          {entry.type === EntryType.COURSE_TRAINING ? 'Training Course' : 'Redeployed (Transferred)'}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                          This day is managed by the Situation Wizard. To edit details, use the Wizard. Select an option below to overwrite.
                      </div>
                  </div>
              </div>
          )}

          {/* Grid Type Selection */}
          <div className="bg-white rounded-xl border border-black/5 p-2 shadow-sm space-y-2">
             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1">Set Status</label>
             <div className="grid grid-cols-4 gap-2">
                 {TYPE_BUTTONS.map(btn => (
                     <button
                        key={btn.id}
                        onClick={() => setType(btn.id)}
                        className={`
                            flex flex-col items-center justify-center py-2.5 rounded-lg border transition-all
                            ${entry.type === btn.id 
                                ? 'bg-slate-800 text-white border-slate-900 shadow-md transform scale-[1.02]' 
                                : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'
                            }
                        `}
                     >
                         <btn.icon size={16} className="mb-1" />
                         <span className="text-[10px] font-bold">{btn.label}</span>
                     </button>
                 ))}
             </div>
             
             {/* Quick Select Row */}
             <div className="flex gap-2 border-t border-slate-100 pt-2">
                {QUICK_TYPES.map(qt => (
                    <button
                        key={qt.id}
                        onClick={() => setType(qt.id)}
                        className={`
                            flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all uppercase tracking-wide
                            ${entry.type === qt.id 
                                ? `${qt.id === EntryType.TIME_OFF ? 'bg-orange-600 border-orange-700' : 'bg-blue-600 border-blue-700'} text-white shadow-sm` 
                                : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'
                            }
                        `}
                    >
                        {qt.label}
                    </button>
                ))}
             </div>
          </div>

          {/* Notes Field */}
          <div className="bg-white rounded-xl border border-black/5 p-2 px-3 shadow-sm flex items-center gap-2">
             <div className="text-slate-300"><Edit3 size={14} /></div>
             <input 
                type="text" 
                placeholder="Add a note..." 
                value={entry.note}
                onChange={handleNoteChange}
                className="w-full text-xs py-1 outline-none text-slate-600 placeholder-slate-300 bg-transparent" 
              />
          </div>

          {/* Special: Report Absence Button for Regular Shift */}
          {entry.type === EntryType.REGULAR_SHIFT && (
              <div className="animate-in fade-in slide-in-from-top-1 pt-2">
                  <button 
                    onClick={() => setType(EntryType.TIME_OFF)}
                    className="w-full py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                      <MinusCircle size={14} /> Report Absence / Time Off (T/O)
                  </button>
              </div>
          )}

          {/* Conditional: Custom/T-O Hours Calculator */}
          {isTimeInputVisible && (
             <div className={`bg-white rounded-xl border p-3 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-1 ${isDeductionType ? 'border-orange-200' : 'border-amber-200'}`}>
                
                {/* Time Input Row */}
                <div className="flex gap-2">
                    <div className="flex-1">
                         <label className={`text-[9px] font-bold uppercase block mb-1 ${isDeductionType ? 'text-orange-400' : 'text-slate-400'}`}>
                             {isDeductionType ? 'Time Off Start' : 'Start Time'}
                         </label>
                         <input 
                            type="time"
                            value={startTime}
                            onChange={(e) => handleTimeChange('start', e.target.value)}
                            className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-${isDeductionType ? 'orange' : 'amber'}-400`}
                         />
                    </div>
                    <div className="flex items-center justify-center pt-4 text-slate-300">
                        <ArrowRightCircle size={14} />
                    </div>
                    <div className="flex-1">
                         <label className={`text-[9px] font-bold uppercase block mb-1 ${isDeductionType ? 'text-orange-400' : 'text-slate-400'}`}>
                             {isDeductionType ? 'Time Off End' : 'End Time'}
                         </label>
                         <input 
                            type="time"
                            value={endTime}
                            onChange={(e) => handleTimeChange('end', e.target.value)}
                            className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-${isDeductionType ? 'orange' : 'amber'}-400`}
                         />
                    </div>
                </div>

                {/* Deduction Row */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <div className="flex-1">
                        <label className={`text-[9px] font-bold uppercase block mb-1 ${isDeductionType ? 'text-orange-400' : 'text-slate-400'}`}>
                            {isDeductionType ? 'Adjustment (min)' : 'Time Off / Break (min)'}
                        </label>
                        <input 
                            type="number" 
                            placeholder="0"
                            value={breakMinutes || ''}
                            onChange={(e) => handleTimeChange('break', e.target.value)}
                            className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-${isDeductionType ? 'orange' : 'amber'}-400`}
                        />
                    </div>
                    
                    {/* Result Display */}
                    <div className="flex flex-col items-end pl-2">
                        <label className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isDeductionType ? 'text-orange-500' : 'text-amber-500'}`}>
                            {isDeductionType ? 'Deduction' : 'Total Hours'}
                        </label>
                        <div className="flex items-baseline gap-1">
                            <input
                                type="number"
                                step="0.01"
                                value={entry.customHours || ''}
                                onChange={handleManualHoursChange}
                                placeholder="0"
                                className={`w-16 text-right text-xl font-black outline-none border-b-2 bg-transparent ${isDeductionType ? 'text-orange-600 border-orange-100 focus:border-orange-400' : 'text-amber-600 border-amber-100 focus:border-amber-500'}`}
                            />
                            <span className={`text-[10px] font-bold ${isDeductionType ? 'text-orange-400' : 'text-amber-400'}`}>h</span>
                        </div>
                    </div>
                </div>
                {isDeductionType && (
                    <div className="bg-orange-100/50 rounded-lg p-2 mt-2 flex justify-between items-center text-[10px] font-bold text-orange-800">
                         <span>Shift Credit ({HOURS_CONFIG.REGULAR_SHIFT_HOURS}h) - {entry.customHours?.toFixed(2) || 0}h</span>
                         <span className="text-lg">= {(Math.max(0, HOURS_CONFIG.REGULAR_SHIFT_HOURS - (entry.customHours || 0))).toFixed(2)}h</span>
                    </div>
                )}
             </div>
          )}

          {/* Conditional: Training Details */}
          {entry.type === EntryType.COURSE_TRAINING && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <div className="grid grid-cols-2 gap-2">
                   <div className="bg-white rounded-xl border border-purple-100 p-2 px-3">
                      <label className="text-[9px] font-bold text-purple-400 uppercase block mb-1">Course Name</label>
                      <input 
                        type="text" 
                        value={entry.courseName || ''}
                        onChange={handleCourseNameChange}
                        placeholder="Name..."
                        className="w-full text-xs font-medium outline-none text-slate-700 placeholder-slate-300"
                      />
                   </div>
                   <div className="bg-white rounded-xl border border-purple-100 p-2 px-3">
                      <label className="text-[9px] font-bold text-purple-400 uppercase block mb-1">Location</label>
                       <input 
                        type="text" 
                        value={entry.courseLocation || ''}
                        onChange={handleCourseLocationChange}
                        placeholder="Loc..."
                        className="w-full text-xs font-medium outline-none text-slate-700 placeholder-slate-300"
                      />
                   </div>
                </div>
                
                {entry.startTime && entry.endTime && (
                   <div className="bg-white/50 rounded-lg px-3 py-2 flex items-center justify-between border border-purple-100/50">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                           <Clock size={12} className="text-purple-400" />
                           {entry.startTime} <ArrowRight size={10} className="text-slate-300"/> {entry.endTime}
                           {entry.breakMinutes ? <span className="text-[10px] text-slate-400 font-medium">(-{entry.breakMinutes}m)</span> : null}
                        </div>
                   </div>
                )}

                <div className="bg-white/50 rounded-lg px-2 py-1 text-right">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                        Reduction Value: <span className="text-purple-700">{entry.customHours > 0 ? entry.customHours.toFixed(2) : HOURS_CONFIG.AVERAGE_DAILY_HOURS.toFixed(2)}h</span>
                    </span>
                </div>
              </div>
          )}
      </div>
      
      {/* Footer Info & Confirm Button */}
      <div className="mt-4 flex justify-between items-center px-1">
         <div className="text-[10px] opacity-40 font-mono font-medium">
             ID: #{entry.dayId}
         </div>
         {onClose && (
            <button 
                onClick={onClose}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all active:scale-95 flex items-center gap-2 ${getConfirmButtonStyle()}`}
            >
                <Check size={14} /> Confirm
            </button>
         )}
      </div>
    </div>
  );
};

export default DayCard;
