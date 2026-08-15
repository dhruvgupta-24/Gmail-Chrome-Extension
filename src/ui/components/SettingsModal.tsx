import React, { useState, useEffect } from 'react';
import { ExtendedSettings } from '../../storage/settings-store';
import { OAuthStatus, SystemDiagnostics } from '../../types/messages';
import { ProviderHealthStatus } from '../../types/ai';
import { DEFAULT_USER_CONTEXT } from '../../shared/constants';
import {
  X,
  Cpu,
  Key,
  UserCircle,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  LogIn,
  Activity,
  Mail,
  Server,
  Layers
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ExtendedSettings;
  oauthStatus: OAuthStatus | null;
  onSaveSettings: (settings: Partial<ExtendedSettings>) => Promise<void>;
  onTestOllama: () => Promise<ProviderHealthStatus>;
  onLoginOAuth: (clientId?: string) => Promise<void>;
  onLogoutOAuth: () => Promise<void>;
  onClearData: () => Promise<void>;
  onGetDiagnostics?: () => Promise<SystemDiagnostics>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  oauthStatus,
  onSaveSettings,
  onTestOllama,
  onLoginOAuth,
  onLogoutOAuth,
  onClearData,
  onGetDiagnostics
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'oauth' | 'context' | 'data' | 'diagnostics'>('ai');
  const [formData, setFormData] = useState<ExtendedSettings>(settings);
  const [healthStatus, setHealthStatus] = useState<ProviderHealthStatus | null>(null);
  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const loadDiagnostics = async () => {
    if (!onGetDiagnostics) return;
    setIsLoadingDiagnostics(true);
    try {
      const diag = await onGetDiagnostics();
      setDiagnostics(diag);
    } catch (err) {
      console.warn('Failed to load diagnostics:', err);
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'diagnostics') {
      loadDiagnostics();
    }
  }, [activeTab]);

  if (!isOpen) return null;

  const redirectUri = typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getRedirectURL
    ? chrome.identity.getRedirectURL()
    : 'https://<extension-id>.chromiumapp.org/';

  const handleTestOllama = async () => {
    setIsTestingOllama(true);
    setHealthStatus(null);
    try {
      await onSaveSettings({
        ollama: {
          ...formData.ollama,
          baseUrl: formData.ollama.baseUrl,
          model: formData.ollama.model
        }
      });
      const status = await onTestOllama();
      setHealthStatus(status);
    } catch (err: any) {
      setHealthStatus({
        isAvailable: false,
        provider: 'ollama',
        message: 'Test failed',
        errorDetails: err.message
      });
    } finally {
      setIsTestingOllama(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveSettings(formData);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOAuthLogin = async () => {
    setIsLoggingIn(true);
    try {
      await onLoginOAuth(formData.googleClientId);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-850 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Assistant Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-5 gap-3 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors shrink-0 ${
              activeTab === 'ai'
                ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>AI Provider</span>
          </button>
          <button
            onClick={() => setActiveTab('oauth')}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors shrink-0 ${
              activeTab === 'oauth'
                ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Google OAuth</span>
          </button>
          <button
            onClick={() => setActiveTab('context')}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors shrink-0 ${
              activeTab === 'context'
                ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <UserCircle className="w-3.5 h-3.5" />
            <span>Context</span>
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors shrink-0 ${
              activeTab === 'diagnostics'
                ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Diagnostics</span>
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors shrink-0 ${
              activeTab === 'data'
                ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Data</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: AI Provider */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Active AI Provider
                </label>
                <select
                  value={formData.activeProvider}
                  onChange={e => setFormData({ ...formData, activeProvider: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="ollama">Ollama (Local & Free)</option>
                  <option value="gemini">Google Gemini API (Cloud)</option>
                </select>
              </div>

              {formData.activeProvider === 'ollama' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Ollama Base URL
                    </label>
                    <input
                      type="text"
                      value={formData.ollama.baseUrl}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          ollama: { ...formData.ollama, baseUrl: e.target.value }
                        })
                      }
                      placeholder="http://localhost:11434"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Model Name
                    </label>
                    <input
                      type="text"
                      value={formData.ollama.model}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          ollama: { ...formData.ollama, model: e.target.value }
                        })
                      }
                      placeholder="llama3.2"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Recommended: <code className="text-emerald-600 dark:text-emerald-400">llama3.2</code>, <code className="text-emerald-600 dark:text-emerald-400">mistral</code>, or <code className="text-emerald-600 dark:text-emerald-400">qwen2.5</code>.
                    </p>
                  </div>

                  {/* Health Test */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTestOllama}
                      disabled={isTestingOllama}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors"
                    >
                      {isTestingOllama ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>Test Ollama Connection</span>
                    </button>

                    {healthStatus && (
                      <div
                        className={`mt-3 p-3 rounded-lg text-xs ${
                          healthStatus.isAvailable
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold">
                          {healthStatus.isAvailable ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          )}
                          <span>{healthStatus.message}</span>
                        </div>
                        {healthStatus.errorDetails && (
                          <p className="mt-1 text-[11px] opacity-90">{healthStatus.errorDetails}</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {formData.activeProvider === 'gemini' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Google Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={formData.gemini.apiKey}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        gemini: { ...formData.gemini, apiKey: e.target.value }
                      })
                    }
                    placeholder="AIzaSy..."
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Google OAuth */}
          {activeTab === 'oauth' && (
            <div className="space-y-4 text-xs">
              {/* Status Banner */}
              <div
                className={`p-3 rounded-lg border ${
                  oauthStatus?.isAuthenticated
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {oauthStatus?.isAuthenticated ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    )}
                    <div>
                      <div className="font-semibold">
                        {oauthStatus?.isAuthenticated ? 'Signed In to Gmail' : 'Not Authenticated'}
                      </div>
                      {oauthStatus?.userEmail && (
                        <div className="text-[11px] opacity-90">{oauthStatus.userEmail}</div>
                      )}
                    </div>
                  </div>

                  {oauthStatus?.isAuthenticated ? (
                    <button
                      onClick={onLogoutOAuth}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded font-medium hover:bg-slate-50"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Sign Out</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleOAuthLogin}
                      disabled={isLoggingIn}
                      className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 transition-colors"
                    >
                      {isLoggingIn ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
                      <span>Sign In</span>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Google Cloud OAuth Client ID (Type: Web Application)
                </label>
                <input
                  type="text"
                  value={formData.googleClientId || ''}
                  onChange={e => setFormData({ ...formData, googleClientId: e.target.value })}
                  placeholder="e.g. 123456789-xxxxxx.apps.googleusercontent.com"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Authorized Redirect URI (for Google Cloud Console)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={redirectUri}
                    className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(redirectUri)}
                    className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors shrink-0"
                    title="Copy redirect URI"
                  >
                    {copiedRedirect ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Student Context */}
          {activeTab === 'context' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  User Context &amp; Prioritization Rules
                </label>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, userContextPrompt: DEFAULT_USER_CONTEXT })}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Reset to Student Default
                </button>
              </div>
              <textarea
                rows={10}
                value={formData.userContextPrompt}
                onChange={e => setFormData({ ...formData, userContextPrompt: e.target.value })}
                className="w-full p-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono leading-relaxed"
              />
            </div>
          )}

          {/* TAB 4: Real Diagnostic Mode */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Live System Telemetry
                </span>
                <button
                  onClick={loadDiagnostics}
                  disabled={isLoadingDiagnostics}
                  className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingDiagnostics ? 'animate-spin' : ''}`} />
                  <span>Refresh Diagnostics</span>
                </button>
              </div>

              {isLoadingDiagnostics && !diagnostics ? (
                <div className="flex justify-center p-6">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                </div>
              ) : diagnostics ? (
                <div className="space-y-3 font-mono text-[11px]">
                  {/* Gmail Status */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold font-sans text-xs text-slate-800 dark:text-slate-200">
                      <Mail className="w-3.5 h-3.5 text-blue-500" />
                      <span>Gmail Integration</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-slate-400">Authenticated: </span>
                        <span className={diagnostics.gmail.isAuthenticated ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                          {diagnostics.gmail.isAuthenticated ? 'YES' : 'NO'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Account: </span>
                        <span className="truncate">{diagnostics.gmail.userEmail || 'None'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Indexed Events: </span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{diagnostics.gmail.indexedEventsCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Cached Emails: </span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{diagnostics.gmail.cachedMessagesCount}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400">Last Sync: </span>
                        <span>{diagnostics.gmail.lastSyncTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* AI Status */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold font-sans text-xs text-slate-800 dark:text-slate-200">
                      <Server className="w-3.5 h-3.5 text-purple-500" />
                      <span>AI Provider &amp; Model</span>
                    </div>
                    <div className="space-y-1 pt-1">
                      <div>
                        <span className="text-slate-400">Provider: </span>
                        <span className="uppercase font-bold text-slate-700 dark:text-slate-300">{diagnostics.ai.activeProvider}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Server Reachable: </span>
                        <span className={diagnostics.ai.isAvailable ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                          {diagnostics.ai.isAvailable ? 'YES (Connected)' : 'NO (Offline/Starting)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Selected Model: </span>
                        <span className="text-slate-700 dark:text-slate-300">{diagnostics.ai.currentModel}</span>
                      </div>
                      {diagnostics.ai.message && (
                        <div className="text-[10px] text-slate-500 italic">
                          Status: {diagnostics.ai.message}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Extension Runtime */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold font-sans text-xs text-slate-800 dark:text-slate-200">
                      <Layers className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Extension Runtime</span>
                    </div>
                    <div className="space-y-1 pt-1">
                      <div>
                        <span className="text-slate-400">Content Script: </span>
                        <span className="text-emerald-600 font-bold">LOADED &amp; INJECTED</span>
                      </div>
                      <div className="truncate">
                        <span className="text-slate-400">Extension ID: </span>
                        <span>{diagnostics.extension.extensionId}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-slate-400">Redirect URI: </span>
                        <span>{diagnostics.extension.redirectUri}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-400">
                  Click Refresh Diagnostics to test live telemetry.
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Data Management */}
          {activeTab === 'data' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-2">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Local Cache &amp; Storage</h3>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  All extracted events, deadlines, and conversation history are stored on your local machine in IndexedDB.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm('Are you sure you want to clear all locally cached events and briefings?')) {
                        await onClearData();
                        alert('Local data cleared successfully.');
                      }
                    }}
                    className="px-3 py-2 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 font-medium transition-colors"
                  >
                    Clear All Cached Events
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
