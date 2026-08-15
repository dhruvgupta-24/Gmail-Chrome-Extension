import React, { useState, useEffect, useCallback } from 'react';
import { BriefingData } from '../storage/events-store';
import { ChatMessage, ProviderHealthStatus } from '../types/ai';
import { OAuthStatus, ExtensionRequest, ExtensionResponse } from '../types/messages';
import { ExtendedSettings } from '../storage/settings-store';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { AssistantHeader } from './components/AssistantHeader';
import { BriefingView } from './components/BriefingView';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { FloatingTrigger } from './components/FloatingTrigger';
import { isGmailDarkMode } from '../content/gmail-observer';

export const App: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'briefing' | 'chat'>('briefing');
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<ExtendedSettings>(DEFAULT_SETTINGS);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Helper to send typed message to background service worker
  const sendMessage = useCallback(async <T,>(req: ExtensionRequest): Promise<T> => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      throw new Error('Chrome extension runtime not available');
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(req, (res: ExtensionResponse<T>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res) {
          reject(new Error('No response received from background service worker.'));
          return;
        }
        if (res.success) {
          resolve(res.data);
        } else {
          reject(new Error(res.error || 'Unknown extension error'));
        }
      });
    });
  }, []);

  // Check dark mode
  useEffect(() => {
    setIsDarkMode(isGmailDarkMode());
  }, []);

  // Initial load: settings, auth status, local briefing
  useEffect(() => {
    const init = async () => {
      try {
        const loadedSettings = await sendMessage<ExtendedSettings>({ type: 'SETTINGS_GET' });
        if (loadedSettings) setSettings(loadedSettings);

        const auth = await sendMessage<OAuthStatus>({ type: 'AUTH_GET_STATUS' });
        setOauthStatus(auth);

        const initialBriefing = await sendMessage<BriefingData>({ type: 'EVENTS_GET_BRIEFING' });
        if (initialBriefing) setBriefing(initialBriefing);

        // If authenticated, do a soft background refresh of recent briefing
        if (auth && auth.isAuthenticated) {
          sendMessage<BriefingData>({ type: 'GMAIL_SYNC_BRIEFING' })
            .then(data => data && setBriefing(data))
            .catch(() => {});
        }
      } catch (err) {
        console.warn('[Assistant App] Init warning:', err);
      }
    };

    init();
  }, [sendMessage]);

  // Sync Mailbox
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const auth = await sendMessage<OAuthStatus>({ type: 'AUTH_GET_STATUS' });
      setOauthStatus(auth);

      if (!auth.isAuthenticated) {
        setIsSettingsOpen(true);
        throw new Error('Please sign in to Google OAuth in Settings to sync emails.');
      }

      const updated = await sendMessage<BriefingData>({ type: 'GMAIL_SYNC_BRIEFING', forceRefresh: true });
      if (updated) setBriefing(updated);
      const freshSettings = await sendMessage<ExtendedSettings>({ type: 'SETTINGS_GET' });
      if (freshSettings) setSettings(freshSettings);
    } catch (err: any) {
      alert(err.message || 'Failed to sync emails.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Send Chat Query
  const handleSendMessage = async (queryText: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: queryText,
      timestamp: Date.now()
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setActiveTab('chat');
    setIsLoading(true);

    try {
      const res = await sendMessage<{
        content: string;
        events?: any[];
        sourceMessages?: any[];
      }>({
        type: 'AI_CHAT',
        query: queryText,
        conversationHistory: newHistory
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: res.content,
        timestamp: Date.now(),
        sourceMessages: res.sourceMessages,
        suggestedFollowUps: generateSuggestedFollowUps(queryText, res.content)
      };

      setMessages([...newHistory, assistantMsg]);

      // Refresh briefing state in background
      sendMessage<BriefingData>({ type: 'EVENTS_GET_BRIEFING' })
        .then(b => b && setBriefing(b))
        .catch(() => {});
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.message || 'Failed to process query'}. If this is related to Ollama or OAuth, please verify your settings.`,
        timestamp: Date.now(),
        isError: true
      };
      setMessages([...newHistory, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateSuggestedFollowUps = (userQ: string, _answer: string): string[] => {
    const lower = userQ.toLowerCase();
    if (lower.includes('test') || lower.includes('assessment') || lower.includes('exam')) {
      return ['What is due tomorrow?', 'Show registration deadlines'];
    }
    if (lower.includes('today') || lower.includes('due')) {
      return ['What do I have due tomorrow?', 'Find all upcoming tests'];
    }
    if (lower.includes('placement') || lower.includes('internship')) {
      return ['What tests are scheduled this week?', 'Show interview schedule'];
    }
    return ['What do I have today and tomorrow?', 'Upcoming Tests'];
  };

  const dueTodayCount = briefing?.today.length || 0;

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      {/* Minimized Floating Button in Bottom-Right */}
      <FloatingTrigger
        isOpen={isOpen}
        onClick={() => setIsOpen(true)}
        dueTodayCount={dueTodayCount}
      />

      {/* Floating Assistant Card / Popup */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[999999] w-[calc(100vw-32px)] sm:w-[410px] h-[min(620px,calc(100vh-48px))] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xl shadow-slate-900/25 dark:shadow-black/70 flex flex-col overflow-hidden animate-popup-in select-text">
          <AssistantHeader
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onClose={() => setIsOpen(false)}
            onMinimize={() => setIsOpen(false)}
            dueTodayCount={dueTodayCount}
            lastSyncTimestamp={settings.lastSyncTimestamp}
          />

          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30 dark:bg-slate-950/20">
            {activeTab === 'briefing' ? (
              <BriefingView
                briefing={briefing}
                isLoading={isRefreshing && !briefing}
                onRefresh={handleRefresh}
                onSelectAction={handleSendMessage}
              />
            ) : (
              <ChatView
                messages={messages}
                isLoading={isLoading}
                onSendMessage={handleSendMessage}
                onClearHistory={() => setMessages([])}
              />
            )}
          </div>

          {/* Settings Modal */}
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            oauthStatus={oauthStatus}
            onSaveSettings={async updated => {
              const res = await sendMessage<ExtendedSettings>({
                type: 'SETTINGS_SAVE',
                settings: updated
              });
              setSettings(res);
            }}
            onTestOllama={async () => {
              return await sendMessage<ProviderHealthStatus>({ type: 'AI_CHECK_HEALTH' });
            }}
            onLoginOAuth={async (clientId?: string) => {
              try {
                const res = await sendMessage<{ success: boolean; token?: string; error?: string }>({
                  type: 'AUTH_START_LOGIN',
                  customClientId: clientId
                });
                if (!res.success) {
                  alert(res.error || 'Login failed. Please check your Google Cloud Web Application Client ID.');
                } else {
                  const status = await sendMessage<OAuthStatus>({ type: 'AUTH_GET_STATUS' });
                  setOauthStatus(status);
                  const freshSettings = await sendMessage<ExtendedSettings>({ type: 'SETTINGS_GET' });
                  if (freshSettings) setSettings(freshSettings);
                  await handleRefresh();
                }
              } catch (err: any) {
                alert(`Sign in error: ${err.message || err}`);
              }
            }}
            onLogoutOAuth={async () => {
              await sendMessage({ type: 'AUTH_LOGOUT' });
              const status = await sendMessage<OAuthStatus>({ type: 'AUTH_GET_STATUS' });
              setOauthStatus(status);
            }}
            onClearData={async () => {
              await sendMessage({ type: 'EVENTS_CLEAR_ALL' });
              const emptyBriefing = await sendMessage<BriefingData>({ type: 'EVENTS_GET_BRIEFING' });
              setBriefing(emptyBriefing);
            }}
            onGetDiagnostics={async () => {
              return await sendMessage<any>({ type: 'SYSTEM_GET_DIAGNOSTICS' });
            }}
          />
        </div>
      )}
    </div>
  );
};
