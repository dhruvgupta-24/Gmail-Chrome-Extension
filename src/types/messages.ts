import { AIProviderSettings, ChatMessage } from './ai';

export interface OAuthStatus {
  isAuthenticated: boolean;
  userEmail?: string;
  clientId?: string;
  errorMessage?: string;
}

export interface SystemDiagnostics {
  gmail: {
    isAuthenticated: boolean;
    userEmail?: string;
    clientId?: string;
    lastSyncTime?: string;
    indexedEventsCount: number;
    cachedMessagesCount: number;
  };
  ai: {
    activeProvider: string;
    isAvailable: boolean;
    message: string;
    currentModel: string;
    availableModels: string[];
    errorDetails?: string;
  };
  extension: {
    extensionId: string;
    redirectUri: string;
    isContentScriptLoaded: boolean;
  };
}

export type ExtensionRequest =
  // Auth
  | { type: 'AUTH_GET_STATUS' }
  | { type: 'AUTH_START_LOGIN'; interactive?: boolean; customClientId?: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AUTH_SET_CLIENT_ID'; clientId: string }

  // Gmail & Search
  | { type: 'GMAIL_SEARCH'; query: string; maxResults?: number }
  | { type: 'GMAIL_FETCH_THREAD'; threadId: string }
  | { type: 'GMAIL_SYNC_BRIEFING'; forceRefresh?: boolean }

  // AI & Chat
  | { type: 'AI_CHAT'; query: string; conversationHistory: ChatMessage[] }
  | { type: 'AI_CHECK_HEALTH' }
  | { type: 'AI_LIST_MODELS' }

  // Events & Storage
  | { type: 'EVENTS_GET_ALL' }
  | { type: 'EVENTS_GET_BRIEFING' }
  | { type: 'EVENTS_CLEAR_ALL' }

  // Diagnostics & System
  | { type: 'SYSTEM_GET_DIAGNOSTICS' }

  // Settings
  | { type: 'SETTINGS_GET' }
  | { type: 'SETTINGS_SAVE'; settings: Partial<AIProviderSettings> & { googleClientId?: string } };

export type ExtensionResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; errorDetails?: string };
