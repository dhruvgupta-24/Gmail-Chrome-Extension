import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Sparkles, Mail, Settings, AlertCircle, ExternalLink } from 'lucide-react';
import { BriefingData } from '../storage/events-store';
import { OAuthStatus, ExtensionRequest, ExtensionResponse } from '../types/messages';
import '../content/styles.css';

const PopupApp: React.FC = () => {
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);

  const sendMessage = async <T,>(req: ExtensionRequest): Promise<T> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(req, (res: ExtensionResponse<T>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (res.success) resolve(res.data);
        else reject(new Error(res.error));
      });
    });
  };

  useEffect(() => {
    sendMessage<OAuthStatus>({ type: 'AUTH_GET_STATUS' })
      .then(setOauthStatus)
      .catch(() => {});

    sendMessage<BriefingData>({ type: 'EVENTS_GET_BRIEFING' })
      .then(setBriefing)
      .catch(() => {});
  }, []);

  const openGmail = () => {
    chrome.tabs.create({ url: 'https://mail.google.com' });
  };

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  };

  const todayCount = briefing?.today.length || 0;
  const tomorrowCount = briefing?.tomorrow.length || 0;
  const upcomingCount = briefing?.upcoming.length || 0;

  return (
    <div className="p-4 space-y-4 font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-800 dark:text-slate-100">
              Gmail AI Assistant
            </h1>
            <p className="text-[11px] text-slate-500">
              {oauthStatus?.isAuthenticated ? oauthStatus.userEmail : 'Not signed in'}
            </p>
          </div>
        </div>

        <button
          onClick={openOptions}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors"
          title="Open Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-center">
          <div className="text-lg font-bold text-rose-600 dark:text-rose-400">{todayCount}</div>
          <div className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wider">Today</div>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-center">
          <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{tomorrowCount}</div>
          <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Tomorrow</div>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
          <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{upcomingCount}</div>
          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Upcoming</div>
        </div>
      </div>

      {!oauthStatus?.isAuthenticated && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300 text-[11px]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            Please configure your Google Cloud Client ID in Settings to authorize Gmail access.
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pt-1">
        <button
          onClick={openGmail}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
        >
          <Mail className="w-4 h-4" />
          <span>Open Gmail</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
        </button>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('popup-root')!);
root.render(<PopupApp />);
