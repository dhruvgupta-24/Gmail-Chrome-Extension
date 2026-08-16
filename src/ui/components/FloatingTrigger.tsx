import React from 'react';
import { Sparkles } from 'lucide-react';
import { Position } from '../hooks/useDraggablePosition';

interface FloatingTriggerProps {
  onClick: () => void;
  isOpen: boolean;
  dueTodayCount: number;
  position?: Position;
}

export const FloatingTrigger: React.FC<FloatingTriggerProps> = ({
  onClick,
  isOpen,
  dueTodayCount,
  position
}) => {
  if (isOpen) return null;

  const style: React.CSSProperties = position
    ? {
        left: `${position.x}px`,
        top: `${position.y}px`
      }
    : {
        bottom: '24px',
        right: '24px'
      };

  return (
    <div
      style={style}
      className="fixed z-50 animate-fade-in select-none"
    >
      <button
        onClick={onClick}
        className="group relative flex items-center gap-2 px-4 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-full shadow-2xl hover:shadow-emerald-500/20 border border-slate-700 hover:border-emerald-500/50 transition-all hover:scale-105 cursor-pointer"
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
