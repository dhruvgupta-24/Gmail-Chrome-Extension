import React from 'react';
import { BriefingData } from '../../storage/events-store';
import { EventCard } from './EventCard';
import { Calendar, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface BriefingViewProps {
  briefing: BriefingData | null;
  isLoading: boolean;
  onRefresh: () => void;
  onSelectAction: (query: string) => void;
}

export const BriefingView: React.FC<BriefingViewProps> = ({
  briefing,
  isLoading,
  onRefresh,
  onSelectAction
}) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  if (isLoading && !briefing) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="w-7 h-7 text-emerald-600 dark:text-emerald-400 animate-spin mb-3" />
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Scanning recent emails...</h3>
        <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
          Retrieving academic deadlines, tests, and priority actions.
        </p>
      </div>
    );
  }

  const hasEvents = briefing && briefing.totalCount > 0;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-4 overscroll-contain">
      {/* Header Card */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent p-3.5 border border-emerald-500/20 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {getGreeting()}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{todayStr}</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-[11px] font-medium text-slate-700 dark:text-slate-200 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            <span>{isLoading ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>

        {/* Quick summary status */}
        <div className="mt-2.5 pt-2 border-t border-emerald-500/10 flex items-center justify-between text-xs">
          <span className="text-slate-600 dark:text-slate-400 font-medium">
            {briefing?.today.length
              ? `You have ${briefing.today.length} item${briefing.today.length > 1 ? 's' : ''} requiring attention today!`
              : 'You have no urgent deadlines due today.'}
          </span>
        </div>
      </div>

      {!hasEvents ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Inbox is organized
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
            No pending tests, assessments, or placement deadlines detected in your synced emails.
          </p>
          <button
            onClick={() => onSelectAction('Find all upcoming tests and assessments')}
            className="mt-3 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            Search all mailbox events &rarr;
          </button>
        </div>
      ) : (
        <>
          {/* Today's Priority Section */}
          {briefing.today.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-0.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Today's Priorities ({briefing.today.length})
                </h2>
              </div>
              <div className="space-y-2">
                {briefing.today.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}

          {/* Tomorrow's Section */}
          {briefing.tomorrow.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-0.5">
                <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Tomorrow ({briefing.tomorrow.length})
                </h2>
              </div>
              <div className="space-y-2">
                {briefing.tomorrow.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          {briefing.upcoming.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Upcoming ({briefing.upcoming.length})
                </h2>
              </div>
              <div className="space-y-2">
                {briefing.upcoming.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
