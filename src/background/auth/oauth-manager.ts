import { OAuthStatus } from '../../types/messages';
import { getSettings, saveSettings } from '../../storage/settings-store';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'email',
  'profile'
].join(' ');

const TOKEN_STORAGE_KEY = 'gmail_oauth_token_data';

export interface StoredTokenData {
  accessToken: string;
  expiresAt: number; // epoch ms
  userEmail?: string;
  savedAt: number;
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
   * Gets the canonical redirect URL for chrome.identity.launchWebAuthFlow.
   * e.g. https://<extension-id>.chromiumapp.org/
   */
  getRedirectUri(): string {
    if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getRedirectURL) {
      return chrome.identity.getRedirectURL();
    }
    return 'https://kgiefmfefelicbibbnagkanocmhgnjgo.chromiumapp.org/';
  }

  /**
   * Retrieves the currently stored token if valid.
   */
  async getValidToken(): Promise<string | null> {
    return new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn('[OAuth] chrome.storage.local is not available');
        resolve(null);
        return;
      }

      chrome.storage.local.get([TOKEN_STORAGE_KEY], result => {
        const data: StoredTokenData | undefined = result[TOKEN_STORAGE_KEY];
        if (!data || !data.accessToken) {
          resolve(null);
          return;
        }

        // Check token expiration (with 60-second grace window)
        const now = Date.now();
        if (typeof data.expiresAt === 'number' && data.expiresAt > 0 && now >= data.expiresAt - 60000) {
          console.warn('[OAuth] Stored access token has expired (now:', new Date(now).toISOString(), 'expiresAt:', new Date(data.expiresAt).toISOString(), ')');
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
        errorMessage: settings.googleClientId
          ? 'Authentication required. Please sign in.'
          : 'Google Client ID not configured.'
      };
    }

    return new Promise(resolve => {
      chrome.storage.local.get([TOKEN_STORAGE_KEY], async result => {
        const data: StoredTokenData = result[TOKEN_STORAGE_KEY];
        let userEmail = data?.userEmail;

        if (!userEmail) {
          userEmail = await this.fetchUserEmail(token);
          if (userEmail && data) {
            data.userEmail = userEmail;
            chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: data });
          }
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
   * Fetches the user email using Gmail API profile endpoint (primary)
   * or Google OAuth UserInfo endpoint (fallback).
   */
  private async fetchUserEmail(token: string): Promise<string | undefined> {
    // 1. Primary: Gmail API Profile endpoint (shares same gmail.readonly scope)
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });
      if (res.ok) {
        const profile = await res.json();
        if (profile.emailAddress) {
          return profile.emailAddress;
        }
      }
    } catch (err) {
      console.warn('[OAuth] Gmail profile fetch error:', err);
    }

    // 2. Fallback: Google UserInfo endpoint
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });
      if (res.ok) {
        const info = await res.json();
        if (info.email) {
          return info.email;
        }
      }
    } catch (err) {
      console.warn('[OAuth] UserInfo fetch error:', err);
    }

    return undefined;
  }

  /**
   * Starts OAuth login flow using chrome.identity.launchWebAuthFlow.
   */
  async login(customClientId?: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const settings = await getSettings();
    const clientId = customClientId || settings.googleClientId;

    if (!clientId || !clientId.trim()) {
      const errMsg = 'Google Cloud Client ID is missing. Please enter your Web Application Client ID in extension Settings.';
      console.error('[OAuth Error]', errMsg);
      return { success: false, error: errMsg };
    }

    const trimmedClientId = clientId.trim();
    if (customClientId && customClientId !== settings.googleClientId) {
      await saveSettings({ googleClientId: trimmedClientId });
    }

    const redirectUri = this.getRedirectUri();
    const maskedClientId = trimmedClientId.length > 16
      ? `${trimmedClientId.substring(0, 8)}...${trimmedClientId.substring(trimmedClientId.length - 8)}`
      : trimmedClientId;

    console.log('[OAuth] Starting sign-in flow with Client ID:', maskedClientId);
    console.log('[OAuth] Redirect URI:', redirectUri);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', trimmedClientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', GMAIL_SCOPES);
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');

    return new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.launchWebAuthFlow) {
        const err = 'chrome.identity.launchWebAuthFlow API is not available.';
        console.error('[OAuth Error]', err);
        resolve({ success: false, error: err });
        return;
      }

      console.log('[OAuth] Launching WebAuthFlow interactive dialog...');

      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl.toString(),
          interactive: true
        },
        async redirectResponseUrl => {
          if (chrome.runtime.lastError || !redirectResponseUrl) {
            const errorMsg = chrome.runtime.lastError?.message || 'Authentication window was closed or cancelled.';
            console.warn('[OAuth] Flow cancelled or failed:', errorMsg);
            resolve({ success: false, error: errorMsg });
            return;
          }

          console.log('[OAuth] Redirect response received from Google');

          try {
            const urlObj = new URL(redirectResponseUrl);

            // Parse parameters from both hash fragment (#access_token=...) and query string (?error=...)
            const hashString = urlObj.hash.startsWith('#') ? urlObj.hash.substring(1) : urlObj.hash;
            const hashParams = new URLSearchParams(hashString);
            const searchParams = new URLSearchParams(urlObj.search);

            const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
            const expiresInStr = hashParams.get('expires_in') || searchParams.get('expires_in');
            const errorParam = hashParams.get('error') || searchParams.get('error');
            const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');

            if (errorParam) {
              const fullError = errorDesc ? `${errorParam}: ${errorDesc}` : errorParam;
              console.error('[OAuth Error] Google returned authorization error:', fullError);
              resolve({ success: false, error: `Google OAuth error: ${fullError}` });
              return;
            }

            if (!accessToken) {
              console.error('[OAuth Error] No access_token found in response URL:', redirectResponseUrl.split('#')[0]);
              resolve({
                success: false,
                error: 'No access token received in Google response. Ensure your OAuth client type is Web Application.'
              });
              return;
            }

            const expiresIn = parseInt(expiresInStr || '3600', 10);
            const safeExpiresIn = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
            const expiresAt = Date.now() + safeExpiresIn * 1000;

            console.log(`[OAuth] Access token successfully extracted (valid for ${safeExpiresIn}s)`);

            // Fetch user profile email
            console.log('[OAuth] Fetching account email...');
            const userEmail = await this.fetchUserEmail(accessToken);
            if (userEmail) {
              console.log('[OAuth] Authenticated user email:', userEmail);
            }

            const tokenData: StoredTokenData = {
              accessToken,
              expiresAt,
              userEmail,
              savedAt: Date.now()
            };

            // Store token persistently in chrome.storage.local
            chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: tokenData }, () => {
              if (chrome.runtime.lastError) {
                console.error('[OAuth Error] Failed to persist token:', chrome.runtime.lastError.message);
                resolve({ success: false, error: chrome.runtime.lastError.message });
                return;
              }

              console.log('[OAuth] Token data stored successfully. Authentication state: AUTHENTICATED');
              resolve({ success: true, token: accessToken });
            });
          } catch (err: any) {
            const parseErr = `Failed to process Google OAuth response: ${err.message || err}`;
            console.error('[OAuth Error]', parseErr);
            resolve({ success: false, error: parseErr });
          }
        }
      );
    });
  }

  /**
   * Clears saved token on logout.
   */
  async logout(): Promise<void> {
    console.log('[OAuth] Logging out and clearing stored token');
    return new Promise(resolve => {
      chrome.storage.local.remove([TOKEN_STORAGE_KEY], () => {
        console.log('[OAuth] Token cleared. Authentication state: UNAUTHENTICATED');
        resolve();
      });
    });
  }
}
