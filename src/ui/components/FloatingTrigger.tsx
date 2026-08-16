import React from 'react';
import { Sparkles, GripHorizontal } from 'lucide-react';
import { Position } from '../hooks/useDraggablePosition';

interface FloatingTriggerProps {
  onClick: () => void;
  isOpen: boolean;
  dueTodayCount: number;
  position?: Position;
  onPointerDown?: (e: React.PointerEvent) => void;
  isDragging?: boolean;
}

export const FloatingTrigger: React.FC<FloatingTriggerProps> = ({
  onClick,
  isOpen,
  dueTodayCount,
  position,
  onPointerDown,
  isDragging
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
      onPointerDown={onPointerDown}
      className={`fixed z-50 select-none touch-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab animate-fade-in'
      }`}
    >
      <button
        onClick={onClick}
        className={`group relative flex items-center gap-2 px-3.5 py-2.5 bg-slate-900 dark:bg-slate-800 text-white rounded-full shadow-2xl hover:shadow-emerald-500/20 border border-slate-700 hover:border-emerald-500/50 transition-all ${
          isDragging ? 'scale-105 shadow-emerald-500/30' : 'hover:scale-105'
        }`}
        title="Click to open or drag to reposition assistant"
      >
        <div className="relative flex items-center justify-center pointer-events-none">
          <Sparkles className="w-4 h-4 text-emerald-400 group-hover:rotate-12 transition-transform duration-300" />
          {dueTodayCount > 0 && (
            <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-slate-900 animate-pulse">
              {dueTodayCount}
            </span>
          )}
        </div>
        <span className="text-xs font-semibold tracking-wide pr-0.5 pointer-events-none">
          AI Assistant
        </span>
        <GripHorizontal className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 pointer-events-none" />
      </button>
    </div>
  );
};
