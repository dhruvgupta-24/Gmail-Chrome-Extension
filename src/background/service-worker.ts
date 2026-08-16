import { ExtensionRequest } from '../types/messages';
import { OAuthManager } from './auth/oauth-manager';
import { GmailClient } from '../services/gmail/gmail-client';
import { SyncEngine } from '../services/gmail/sync-engine';
import { OllamaProvider } from '../services/ai/ollama-provider';
import { GeminiProvider } from '../services/ai/gemini-provider';
import { AIProvider } from '../services/ai/provider';
import { searchLocalDatabase } from '../storage/local-search';
import { generateLocalDeterministicResponse } from '../services/ai/local-responder';
import { analyzeIntent } from '../services/retrieval/intent';
import { extractEventFromEmail, cleanEventTitle, normalizeTitleForDeduplication } from '../services/extraction/event-extractor';
import { getDatabase } from '../storage/database';
import { saveEvents, getBriefingEvents, getAllEvents, clearAllEvents } from '../storage/events-store';
import { getSettings, saveSettings } from '../storage/settings-store';
import { ExtractedEvent } from '../types/events';

console.log('[Gmail AI Assistant] Service Worker initialized (Extract Once -> Query Many).');

// Active AI Provider instantiation
async function getAIProvider(): Promise<AIProvider> {
  const settings = await getSettings();
  if (settings.activeProvider === 'gemini') {
    return new GeminiProvider(settings.gemini);
  }
  return new OllamaProvider(settings.ollama);
}

// Runtime message router
chrome.runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
  handleMessage(message)
    .then(data => sendResponse({ success: true, data }))
    .catch(err => {
      console.error('[Background Error]', message.type, err);
      sendResponse({ success: false, error: err.message || String(err) });
    });

  // Return true to indicate asynchronous response
  return true;
});

async function handleMessage(req: ExtensionRequest): Promise<any> {
  switch (req.type) {
    // --- AUTHENTICATION ---
    case 'AUTH_GET_STATUS': {
      return await OAuthManager.getInstance().getStatus();
    }
    case 'AUTH_START_LOGIN': {
      return await OAuthManager.getInstance().login(req.customClientId);
    }
    case 'AUTH_LOGOUT': {
      await OAuthManager.getInstance().logout();
      return { success: true };
    }
    case 'AUTH_SET_CLIENT_ID': {
      await saveSettings({ googleClientId: req.clientId });
      return { success: true };
    }

    // --- GMAIL SYNC & SEARCH (Extract Once) ---
    case 'GMAIL_SEARCH': {
      const gmail = GmailClient.getInstance();
      return await gmail.searchMessages(req.query, req.maxResults || 15);
    }
    case 'GMAIL_FETCH_THREAD': {
      const gmail = GmailClient.getInstance();
      return await gmail.getThread(req.threadId);
    }
    case 'GMAIL_SYNC_BRIEFING': {
      // Incremental sync through SyncEngine
      await SyncEngine.getInstance().syncMailbox({ forceFull: req.forceRefresh });
      return await getBriefingEvents(new Date());
    }

    // --- AI & CHAT (Query Many from Local Index First) ---
    case 'AI_CHAT': {
      const settings = await getSettings();
      const now = new Date();

      // Step 1: Query Local IndexedDB Index First with conversational context resolution
      const localResult = await searchLocalDatabase(req.query, now, req.conversationHistory || []);

      let contextEmails = localResult.cachedMessages;
      let relevantEvents = localResult.events;

      // Step 2: Fallback to Live Gmail API only if local index has no matches, it's NOT an explicit empty date range, and user is authenticated
      if (!localResult.isDateQuery && relevantEvents.length === 0 && contextEmails.length === 0) {
        try {
          const auth = await OAuthManager.getInstance().getStatus();
          if (auth.isAuthenticated) {
            const intent = analyzeIntent(req.query, now, req.conversationHistory || []);
            const gmail = GmailClient.getInstance();
            const liveEmails = await gmail.searchMessages(intent.gmailQuery, 6);

            if (liveEmails.length > 0) {
              contextEmails = liveEmails;
              const newlyExtracted: ExtractedEvent[] = [];
              for (const em of liveEmails) {
                const ev = extractEventFromEmail(em, now);
                if (ev) newlyExtracted.push(ev);
              }
              if (newlyExtracted.length > 0) {
                await saveEvents(newlyExtracted);
                relevantEvents = newlyExtracted;
              }
            }
          }
        } catch (err: any) {
          console.warn('[Live Search Fallback]', err.message);
        }
      }

      // Step 3: AI Reasoning or Deterministic Fast Synthesizer
      let finalContent = '';
      let usedAI = false;

      try {
        const provider = await getAIProvider();
        const aiResponse = await provider.chat(
          req.query,
          contextEmails,
          req.conversationHistory || [],
          settings.userContextPrompt,
          relevantEvents.slice(0, 10)
        );
        finalContent = aiResponse.content;
        usedAI = true;
      } catch (aiErr: any) {
        console.warn('[AI Provider Warning, falling back to local responder]:', aiErr.message);
        const allIndexedEvents = await getAllEvents(now);
        finalContent = generateLocalDeterministicResponse(
          req.query,
          relevantEvents,
          now,
          localResult.dateRange,
          allIndexedEvents,
          localResult.constraints,
          localResult.matchedOnRequestedDate
        );
      }

      // Step 4: Extract source references with intelligent deduplication (1 per thread/event)
      const threadSourceMap = new Map<string, any>();
      for (const ev of relevantEvents) {
        for (const src of ev.sourceMessages) {
          const key = src.threadId ? `th_${src.threadId}` : normalizeTitleForDeduplication(src.subject);
          const cleanSub = cleanEventTitle(src.subject);
          if (!threadSourceMap.has(key)) {
            threadSourceMap.set(key, {
              messageId: src.messageId,
              threadId: src.threadId,
              subject: cleanSub,
              sender: src.sender,
              receivedAt: src.receivedAt
            });
          }
        }
      }
      for (const em of contextEmails) {
        const key = em.threadId ? `th_${em.threadId}` : normalizeTitleForDeduplication(em.subject);
        const cleanSub = cleanEventTitle(em.subject);
        if (!threadSourceMap.has(key)) {
          threadSourceMap.set(key, {
            messageId: em.id,
            threadId: em.threadId,
            subject: cleanSub,
            sender: em.sender,
            receivedAt: em.date
          });
        }
      }

      return {
        content: finalContent,
        sourceMessages: Array.from(threadSourceMap.values()).slice(0, 5),
        usedAI
      };
    }

    case 'AI_CHECK_HEALTH': {
      const provider = await getAIProvider();
      return await provider.checkHealth();
    }

    case 'AI_LIST_MODELS': {
      const provider = await getAIProvider();
      return await provider.listAvailableModels();
    }

    // --- EVENTS & CACHE ---
    case 'EVENTS_GET_ALL': {
      return await getAllEvents(new Date());
    }
    case 'EVENTS_GET_BRIEFING': {
      return await getBriefingEvents(new Date());
    }
    case 'EVENTS_CLEAR_ALL': {
      await clearAllEvents();
      return { success: true };
    }

    // --- DIAGNOSTICS & SYSTEM ---
    case 'SYSTEM_GET_DIAGNOSTICS': {
      const auth = await OAuthManager.getInstance().getStatus();
      const settings = await getSettings();
      const provider = await getAIProvider();
      const health = await provider.checkHealth();
      const db = await getDatabase();
      const eventCount = await db.count('events');
      const msgCount = await db.count('cached_messages');

      const redirectUri = OAuthManager.getInstance().getRedirectUri();
      const extensionId = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : 'unpacked-local';

      return {
        gmail: {
          isAuthenticated: auth.isAuthenticated,
          userEmail: auth.userEmail,
          clientId: settings.googleClientId,
          lastSyncTime: settings.lastSyncTimestamp ? new Date(settings.lastSyncTimestamp).toLocaleString() : 'Never',
          indexedEventsCount: eventCount,
          cachedMessagesCount: msgCount
        },
        ai: {
          activeProvider: settings.activeProvider,
          isAvailable: health.isAvailable,
          message: health.message,
          currentModel: settings.activeProvider === 'ollama' ? settings.ollama.model : settings.gemini.model,
          availableModels: health.availableModels || [],
          errorDetails: health.errorDetails
        },
        extension: {
          extensionId,
          redirectUri,
          isContentScriptLoaded: true
        }
      };
    }

    // --- SETTINGS ---
    case 'SETTINGS_GET': {
      return await getSettings();
    }
    case 'SETTINGS_SAVE': {
      await saveSettings(req.settings);
      return await getSettings();
    }

    default:
      throw new Error(`Unknown message type: ${(req as any).type}`);
  }
}
