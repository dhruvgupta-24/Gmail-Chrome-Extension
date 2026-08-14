import React from 'react';
import { CalendarDays, AlertTriangle, GraduationCap, Clock, Briefcase, Sparkles } from 'lucide-react';

interface QuickActionsProps {
  onSelectAction: (query: string) => void;
  disabled?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onSelectAction, disabled }) => {
  const actions = [
    { label: "Today's Briefing", query: "What important emails and deadlines do I have today?", icon: Sparkles },
    { label: 'Due Today', query: 'What do I have due today?', icon: AlertTriangle, highlight: true },
    { label: 'Due Tomorrow', query: 'What do I have due tomorrow?', icon: Clock },
    { label: 'Upcoming Tests', query: 'Find all upcoming tests, exams, and assessments with dates and links', icon: GraduationCap },
    { label: 'Action Required', query: 'What emails require action or registration from me?', icon: CalendarDays },
    { label: 'Placements & Jobs', query: 'Find all placement, internship, and interview emails', icon: Briefcase }
  ];

  return (
    <div className="py-2">
      <div className="flex items-center gap-1.5 px-3 py-1 overflow-x-auto no-scrollbar">
        {actions.map((act, idx) => {
          const Icon = act.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectAction(act.query)}
              disabled={disabled}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                act.highlight
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Icon className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>{act.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
