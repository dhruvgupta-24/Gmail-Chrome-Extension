import React from 'react';
import { Sparkles } from 'lucide-react';

interface FloatingTriggerProps {
  onClick: () => void;
  isOpen: boolean;
  dueTodayCount: number;
}

export const FloatingTrigger: React.FC<FloatingTriggerProps> = ({
  onClick,
  isOpen,
  dueTodayCount
}) => {
  if (isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in select-none">
      <button
        onClick={onClick}
        className="group relative flex items-center gap-2 px-4 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-full shadow-2xl hover:shadow-emerald-500/20 border border-slate-700 hover:border-emerald-500/50 transition-all hover:scale-105"
        title="Open Gmail AI Assistant"
      >
        <div className="relative flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-emerald-400 group-hover:rotate-12 transition-transform duration-300" />
          {dueTodayCount > 0 && (
            <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-slate-900 animate-pulse">
              {dueTodayCount}
            </span>
          )}
        </div>
        <span className="text-xs font-semibold tracking-wide pr-1">
          AI Assistant
        </span>
      </button>
    </div>
  );
};
