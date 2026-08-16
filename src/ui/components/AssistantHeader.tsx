import React from 'react';
import { Sparkles, RefreshCw, Settings, Minus, X, Inbox, MessageSquare, Check, GripHorizontal } from 'lucide-react';

interface AssistantHeaderProps {
  activeTab: 'briefing' | 'chat';
  onTabChange: (tab: 'briefing' | 'chat') => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenSettings: () => void;
  onClose: () => void;
  onMinimize?: () => void;
  dueTodayCount: number;
  lastSyncTimestamp?: number;
  onPointerDown?: (e: React.PointerEvent) => void;
  isDragging?: boolean;
}

export const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  onOpenSettings,
  onClose,
  onMinimize,
  dueTodayCount,
  lastSyncTimestamp,
  onPointerDown,
  isDragging
}) => {
  const formatSyncTime = (timestamp?: number) => {
    if (!timestamp) return 'Not synced';
    const diffMinutes = Math.round((Date.now() - timestamp) / (1000 * 60));
    if (diffMinutes < 1) return 'Synced just now';
    if (diffMinutes === 1) return 'Synced 1m ago';
    if (diffMinutes < 60) return `Synced ${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    return `Synced ${diffHours}h ago`;
  };

  return (
    <div className="flex flex-col shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm select-none rounded-t-2xl z-10">
      {/* Top bar with Drag Handle */}
      <div
        onPointerDown={onPointerDown}
        className={`flex items-center justify-between px-3.5 py-2.5 transition-colors touch-none ${
          isDragging ? 'cursor-grabbing bg-slate-100/80 dark:bg-slate-800/80' : 'cursor-grab hover:bg-slate-50/80 dark:hover:bg-slate-850/50'
        }`}
        title="Drag to reposition assistant"
      >
        <div className="flex items-center space-x-2 min-w-0 pointer-events-none">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 truncate">
              <span className="truncate">Gmail AI Assistant</span>
              {dueTodayCount > 0 && (
                <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-full shrink-0">
                  {dueTodayCount} due
                </span>
              )}
            </h2>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <Check className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
              <span className="truncate">{formatSyncTime(lastSyncTimestamp)}</span>
            </p>
          </div>
        </div>

        {/* Center Drag Grip Visual Indicator */}
        <div className="flex items-center justify-center text-slate-300 dark:text-slate-600 pointer-events-none px-1">
          <GripHorizontal className="w-4 h-4" />
        </div>

        {/* Action Buttons (Clicks do not initiate drag) */}
        <div
          className="flex items-center space-x-1 shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Sync mailbox"
            className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <button
            onClick={onOpenSettings}
            title="Settings & AI Model"
            className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMinimize || onClose}
            title="Minimize assistant"
            className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div
        className="flex px-3.5 space-x-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onTabChange('briefing')}
          className={`flex items-center space-x-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'briefing'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>Briefing Feed</span>
        </button>
        <button
          onClick={() => onTabChange('chat')}
          className={`flex items-center space-x-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'chat'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Ask Assistant</span>
        </button>
      </div>
    </div>
  );
};
