import { OAuthStatus } from '../../types/messages';
import { getSettings, saveSettings } from '../../storage/settings-store';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email';
const TOKEN_STORAGE_KEY = 'gmail_oauth_token_data';

interface StoredTokenData {
  accessToken: string;
  expiresAt: number; // epoch ms
  userEmail?: string;
}

export class OAuthManager {
  private static instance: OAuthManager;

  private constructor() {}

  static getInstance(): OAuthManager {
    if (!OAuthManager.instance) {
      OAuthManager.instance = new OAuthManager();
    }
    return OAuthManager.instance;
  }

  /**
   * Gets the redirect URL for chrome.identity.launchWebAuthFlow.
   * e.g. https://<extension-id>.chromiumapp.org/
   */
  getRedirectUri(): string {
    if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getRedirectURL) {
      return chrome.identity.getRedirectURL();
    }
    return 'https://localhost/oauth2callback';
  }

  /**
   * Retrieves the currently stored token if valid.
   */
  async getValidToken(): Promise<string | null> {
    return new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve(null);
        return;
      }

      chrome.storage.local.get([TOKEN_STORAGE_KEY], result => {
        const data: StoredTokenData | undefined = result[TOKEN_STORAGE_KEY];
        if (!data || !data.accessToken) {
          resolve(null);
          return;
        }

        // Check expiration (with 2 minute grace period)
        if (Date.now() >= data.expiresAt - 120000) {
          resolve(null);
          return;
        }

        resolve(data.accessToken);
      });
    });
  }

  /**
   * Returns current OAuth authentication status and user email.
   */
  async getStatus(): Promise<OAuthStatus> {
    const settings = await getSettings();
    const token = await this.getValidToken();

    if (!token) {
      return {
        isAuthenticated: false,
        clientId: settings.googleClientId,
        errorMessage: settings.googleClientId ? 'Authentication required. Please sign in.' : 'Google Client ID not configured.'
      };
    }

    // Try reading cached email from storage
    return new Promise(resolve => {
      chrome.storage.local.get([TOKEN_STORAGE_KEY], async result => {
        const data: StoredTokenData = result[TOKEN_STORAGE_KEY];
        let userEmail = data?.userEmail;

        if (!userEmail) {
          userEmail = await this.fetchUserEmail(token);
        }

        resolve({
          isAuthenticated: true,
          userEmail,
          clientId: settings.googleClientId
        });
      });
    });
  }

  /**
   * Fetches the user email using Google OAuth UserInfo endpoint.
   */
  private async fetchUserEmail(token: string): Promise<string | undefined> {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const info = await res.json();
        if (info.email) {
          // Update stored token with email
          chrome.storage.local.get([TOKEN_STORAGE_KEY], result => {
            const data = result[TOKEN_STORAGE_KEY] || {};
            data.userEmail = info.email;
            chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: data });
          });
          return info.email;
        }
      }
    } catch {
      // Non-blocking
    }
    return undefined;
  }

  /**
   * Starts OAuth login flow using chrome.identity.launchWebAuthFlow.
   */
  async login(customClientId?: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const settings = await getSettings();
    const clientId = customClientId || settings.googleClientId;

    if (!clientId) {
      return {
        success: false,
        error: 'Google Cloud Client ID is missing. Please configure it in extension Settings.'
      };
    }

    // Save clientId if provided
    if (customClientId && customClientId !== settings.googleClientId) {
      await saveSettings({ googleClientId: customClientId });
    }

    const redirectUri = this.getRedirectUri();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId.trim());
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', GMAIL_READONLY_SCOPE);
    authUrl.searchParams.set('prompt', 'consent');

    return new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.launchWebAuthFlow) {
        resolve({
          success: false,
          error: 'chrome.identity API is not available in this environment.'
        });
        return;
      }

      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl.toString(),
          interactive: true
        },
        async redirectResponseUrl => {
          if (chrome.runtime.lastError || !redirectResponseUrl) {
            resolve({
              success: false,
              error: chrome.runtime.lastError?.message || 'Authentication flow was cancelled or failed.'
            });
            return;
          }

          try {
            // Extract access token from response URL fragment (e.g. #access_token=...&expires_in=3600)
            const hash = new URL(redirectResponseUrl).hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

            if (!accessToken) {
              const errorParam = params.get('error') || 'No access token received';
              resolve({ success: false, error: `OAuth error: ${errorParam}` });
              return;
            }

            const expiresAt = Date.now() + expiresIn * 1000;
            const userEmail = await this.fetchUserEmail(accessToken);

            const tokenData: StoredTokenData = {
              accessToken,
              expiresAt,
              userEmail
            };

            chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: tokenData }, () => {
              resolve({ success: true, token: accessToken });
            });
          } catch (err: any) {
            resolve({
              success: false,
              error: `Failed to parse OAuth response: ${err.message || err}`
            });
          }
        }
      );
    });
  }

  /**
   * Clears saved token on logout.
   */
  async logout(): Promise<void> {
    return new Promise(resolve => {
      chrome.storage.local.remove([TOKEN_STORAGE_KEY], () => {
        resolve();
      });
    });
  }
}
