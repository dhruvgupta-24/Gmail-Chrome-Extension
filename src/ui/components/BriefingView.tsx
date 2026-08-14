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
      <div className="flex flex-col items-center justify-center h-64 p-6 text-center">
        <RefreshCw className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-spin mb-3" />
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Scanning recent emails...</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Retrieving academic deadlines, tests, and priority actions.
        </p>
      </div>
    );
  }

  const hasEvents = briefing && briefing.totalCount > 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
      {/* Header Card */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent p-4 border border-emerald-500/20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {getGreeting()}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{todayStr}</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-medium text-slate-700 dark:text-slate-200 rounded-lg shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            <span>Sync</span>
          </button>
        </div>

        {briefing && briefing.today.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-lg border border-rose-200 dark:border-rose-800/80">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>You have {briefing.today.length} item{briefing.today.length > 1 ? 's' : ''} requiring attention today!</span>
          </div>
        )}
      </div>

      {!hasEvents ? (
        <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <CheckCircle2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2.5" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No urgent obligations found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
            Your mailbox appears clear of immediate deadlines or tests for the selected window.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              Sync Mailbox Now
            </button>
            <button
              onClick={() => onSelectAction('Find all upcoming tests and assessments')}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
            >
              Search Tests
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* TODAY SECTION */}
          {briefing.today.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold tracking-wider text-rose-600 dark:text-rose-400 uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Today
                </h2>
                <span className="text-[11px] font-medium text-slate-400">
                  {briefing.today.length} item{briefing.today.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2.5">
                {briefing.today.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* TOMORROW SECTION */}
          {briefing.tomorrow.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold tracking-wider text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Tomorrow
                </h2>
                <span className="text-[11px] font-medium text-slate-400">
                  {briefing.tomorrow.length} item{briefing.tomorrow.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2.5">
                {briefing.tomorrow.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* UPCOMING SECTION */}
          {briefing.upcoming.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold tracking-wider text-slate-600 dark:text-slate-400 uppercase flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Upcoming
                </h2>
                <span className="text-[11px] font-medium text-slate-400">
                  {briefing.upcoming.length} item{briefing.upcoming.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2.5">
                {briefing.upcoming.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
