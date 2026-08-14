import React from 'react';
import { Sparkles, RefreshCw, Settings, X, Inbox, MessageSquare, Check } from 'lucide-react';

interface AssistantHeaderProps {
  activeTab: 'briefing' | 'chat';
  onTabChange: (tab: 'briefing' | 'chat') => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenSettings: () => void;
  onClose: () => void;
  dueTodayCount: number;
  lastSyncTimestamp?: number;
}

export const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  onOpenSettings,
  onClose,
  dueTodayCount,
  lastSyncTimestamp
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
    <div className="flex flex-col border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              Gmail AI Assistant
              {dueTodayCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-full">
                  {dueTodayCount} due today
                </span>
              )}
            </h2>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <Check className="w-2.5 h-2.5 text-emerald-500" />
              <span>{formatSyncTime(lastSyncTimestamp)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Sync mailbox"
            className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <button
            onClick={onOpenSettings}
            title="Settings & AI Model"
            className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            title="Close panel"
            className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex px-4 space-x-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
        <button
          onClick={() => onTabChange('briefing')}
          className={`flex items-center space-x-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
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
          className={`flex items-center space-x-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
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
