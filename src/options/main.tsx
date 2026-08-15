import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsModal } from '../ui/components/SettingsModal';
import { ExtendedSettings, getSettings, saveSettings } from '../storage/settings-store';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { OAuthStatus, ExtensionRequest, ExtensionResponse } from '../types/messages';
import { ProviderHealthStatus } from '../types/ai';
import '../content/styles.css';

const OptionsApp: React.FC = () => {
  const [settings, setSettings] = useState<ExtendedSettings>(DEFAULT_SETTINGS);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);

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
    getSettings().then(setSettings);
    sendMessage<OAuthStatus>({ type: 'AUTH_GET_STATUS' })
      .then(setOauthStatus)
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <SettingsModal
        isOpen={true}
        onClose={() => window.close()}
        settings={settings}
        oauthStatus={oauthStatus}
        onSaveSettings={async updated => {
          await saveSettings(updated);
          const fresh = await getSettings();
          setSettings(fresh);
        }}
        onTestOllama={async () => {
          return await sendMessage<ProviderHealthStatus>({ type: 'AI_CHECK_HEALTH' });
        }}
        onLoginOAuth={async (clientId?: string) => {
          await sendMessage({ type: 'AUTH_START_LOGIN', customClientId: clientId });
          const status = await sendMessage<OAuthStatus>({ type: 'AUTH_GET_STATUS' });
          setOauthStatus(status);
        }}
        onLogoutOAuth={async () => {
          await sendMessage({ type: 'AUTH_LOGOUT' });
          const status = await sendMessage<OAuthStatus>({ type: 'AUTH_GET_STATUS' });
          setOauthStatus(status);
        }}
        onClearData={async () => {
          await sendMessage({ type: 'EVENTS_CLEAR_ALL' });
        }}
        onGetDiagnostics={async () => {
          return await sendMessage<any>({ type: 'SYSTEM_GET_DIAGNOSTICS' });
        }}
      />
    </div>
  );
};

const root = createRoot(document.getElementById('options-root')!);
root.render(<OptionsApp />);
