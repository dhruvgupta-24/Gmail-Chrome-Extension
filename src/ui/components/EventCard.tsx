import React, { useState } from 'react';
import { ExtractedEvent, ActionLink } from '../../types/events';
import { formatEventSemanticDate, openGmailMessageInCurrentTab, getTodayDateString } from '../../shared/utils';
import { getBestActionLinkForStage } from '../../services/ai/local-responder';
import { deduplicateActionLinks } from '../../services/gmail/links';
import {
  ExternalLink,
  Mail,
  Clock,
  Building2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Code2,
  Users,
  GraduationCap,
  Calendar,
  Video
} from 'lucide-react';

interface EventCardProps {
  event: ExtractedEvent;
}

export const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Identify active stage for the card context (today or next upcoming stage)
  const todayStr = getTodayDateString();
  const activeTodayStage = (event.stages || []).find(s => s.date === todayStr);
  const activeUpcomingStage = (event.stages || []).find(s => s.date && s.date >= todayStr);
  const activeStage = activeTodayStage || activeUpcomingStage;

  const displayType = activeStage ? activeStage.type : event.type;
  const displayTitle = activeStage
    ? (event.company && !activeStage.name.toLowerCase().includes(event.company.toLowerCase())
        ? `${event.company} ${activeStage.name}`
        : activeStage.name)
    : event.title;

  const getStatusBadge = () => {
    switch (event.status) {
      case 'today':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
            TODAY
          </span>
        );
      case 'tomorrow':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            TOMORROW
          </span>
        );
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            UPCOMING
          </span>
        );
      default:
        return null;
    }
  };

  const getTypeIcon = () => {
    switch (displayType) {
      case 'test':
      case 'exam':
      case 'quiz':
      case 'assessment':
        return <GraduationCap className="w-3.5 h-3.5 text-blue-500" />;
      case 'coding_round':
        return <Code2 className="w-3.5 h-3.5 text-purple-500" />;
      case 'interview':
        return <Users className="w-3.5 h-3.5 text-emerald-500" />;
      case 'ppt':
        return <Video className="w-3.5 h-3.5 text-indigo-500" />;
      case 'nomination':
      case 'assignment':
      case 'submission':
      case 'registration':
        return <FileCheck className="w-3.5 h-3.5 text-teal-500" />;
      case 'hackathon':
        return <Code2 className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <Calendar className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  // Filter links specifically relevant to the active stage (excluding meeting links on assessment stages!)
  const actionableLinks = React.useMemo(() => {
    const rawLinks = event.links || [];
    const filtered: ActionLink[] = [];

    if (activeStage) {
      const best = getBestActionLinkForStage(activeStage.type, activeStage.links, rawLinks);
      if (best) {
        filtered.push(best);
      }
    } else {
      return deduplicateActionLinks(rawLinks);
    }
    return filtered;
  }, [event.links, activeStage]);

  const primarySource = event.sourceMessages[0];

  const handleOpenEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    if (primarySource) {
      openGmailMessageInCurrentTab(primarySource.messageId, primarySource.threadId);
    }
  };

  return (
    <div className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 p-3.5 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {getStatusBadge()}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
            {getTypeIcon()}
            {displayType.replace('_', ' ')}
          </span>
        </div>

        {event.actionRequired && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-3.5 h-3.5" />
            Action Required
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
        {displayTitle}
      </h3>

      {/* Meta: Organization & Semantic Date */}
      <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
        {event.organization && (
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span className="truncate font-medium">{event.organization}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <span className="font-medium">{formatEventSemanticDate(event)}</span>
        </div>
      </div>

      {/* Action required description if present */}
      {event.actionDescription && (
        <div className="mt-2 text-xs bg-amber-500/10 text-amber-800 dark:text-amber-300 px-2.5 py-1.5 rounded-md leading-relaxed">
          {event.actionDescription}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 flex-wrap">
          {actionableLinks.slice(0, 2).map((link: ActionLink, idx: number) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded-md transition-colors"
            >
              <span>{link.label}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}

          {primarySource && (
            <button
              onClick={handleOpenEmail}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
              title="Open exact email in current Gmail view"
            >
              <Mail className="w-3 h-3" />
              <span>Open Email</span>
            </button>
          )}
        </div>

        {event.sourceMessages.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-colors cursor-pointer"
            title="Toggle details"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Expanded Source Details */}
      {isExpanded && primarySource && (
        <div className="mt-2 pt-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/60 space-y-1">
          <div className="font-medium text-slate-700 dark:text-slate-300 truncate">
            Subject: {primarySource.subject}
          </div>
          {primarySource.sender && <div className="truncate">From: {primarySource.sender}</div>}
          {primarySource.snippet && <p className="italic line-clamp-2">"{primarySource.snippet}"</p>}
        </div>
      )}
    </div>
  );
};
