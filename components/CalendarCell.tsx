
import React from 'react';
import { DayEntry, EntryType } from '../types';
import { Briefcase, Sun, Calendar, Clock, GraduationCap, ArrowRightCircle, MinusCircle } from 'lucide-react';

interface CalendarCellProps {
  entry: DayEntry;
  date: Date;
  onClick: () => void;
}

const CalendarCell: React.FC<CalendarCellProps> = ({ entry, date, onClick }) => {
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

  // Tiny badge text
  const getBadge = () => {
    if (entry.type === EntryType.REGULAR_SHIFT) return 'Work';
    if (entry.type === EntryType.OFF_DAY) return 'Off';
    if (entry.type === EntryType.COURSE_TRAINING) return 'Course';
    if (entry.type === EntryType.LEAVE_VL) return 'V/L';
    if (entry.type === EntryType.LEAVE_HOLIDAY) return 'H/L';
    if (entry.type === EntryType.TRANSFERRED_OUT) return 'Moved';
    if (entry.type === EntryType.TIME_OFF) return 'T/O';
    if (entry.type === EntryType.CUSTOM) return `${entry.customHours}h`;
    return '...';
  }

  const hasNote = entry.note && entry.note.trim().length > 0;

  return (
    <button 
      onClick={onClick}
      className={`
        rounded-xl border p-1 relative flex flex-col justify-between items-start transition-all duration-200 active:scale-95 h-full min-h-[56px]
        ${getBgColor()}
      `}
    >
      <div className="flex justify-between w-full items-start">
        <span className={`text-[10px] font-bold leading-none ${entry.type === EntryType.REGULAR_SHIFT ? 'text-white' : isWeekend ? 'text-red-400' : 'text-slate-700'}`}>
          {dayNum}
        </span>
        {hasNote && (
          <div className={`w-1 h-1 rounded-full ${entry.type === EntryType.REGULAR_SHIFT ? 'bg-amber-400' : 'bg-amber-500'}`} />
        )}
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
