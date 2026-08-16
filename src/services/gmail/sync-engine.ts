import { GmailClient } from './gmail-client';
import { extractEventFromEmail } from '../extraction/event-extractor';
import { saveEvents, reindexAllEvents } from '../../storage/events-store';
import { saveCachedMessages } from '../../storage/local-search';
import { getSettings, saveSettings } from '../../storage/settings-store';
import { GMAIL_SEARCH_CATEGORIES } from '../../shared/constants';
import { ExtractedEvent } from '../../types/events';

export interface SyncStats {
  newEmailsCount: number;
  extractedEventsCount: number;
  timestamp: number;
}

export class SyncEngine {
  private static instance: SyncEngine;
  private isSyncing = false;

  private constructor() {}

  static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  /**
   * Performs an incremental or full mailbox sync, extracting events and updating local IndexedDB.
   */
  async syncMailbox(options: { forceFull?: boolean; maxResults?: number } = {}): Promise<SyncStats> {
    if (this.isSyncing) {
      return { newEmailsCount: 0, extractedEventsCount: 0, timestamp: Date.now() };
    }

    this.isSyncing = true;
    try {
      const settings = await getSettings();
      const gmail = GmailClient.getInstance();
      const now = new Date();

      // Format date for Gmail query: YYYY/MM/DD
      const formatGmailDate = (d: Date) =>
        `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

      let daysToLookBack = options.forceFull ? 30 : 14;
      if (!options.forceFull && settings.lastSyncTimestamp) {
        const hoursSinceLastSync = (Date.now() - settings.lastSyncTimestamp) / (1000 * 60 * 60);
        if (hoursSinceLastSync < 48) {
          daysToLookBack = 4;
        }
      }

      const lookbackDate = new Date(now);
      lookbackDate.setDate(lookbackDate.getDate() - daysToLookBack);
      const afterFilter = `after:${formatGmailDate(lookbackDate)}`;

      const query = `(${GMAIL_SEARCH_CATEGORIES.ACADEMIC} OR ${GMAIL_SEARCH_CATEGORIES.CAREER} OR ${GMAIL_SEARCH_CATEGORIES.URGENT}) ${afterFilter} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`;

      const maxResults = options.maxResults || (options.forceFull ? 50 : 35);
      const messages = await gmail.searchMessages(query, maxResults);

      if (messages.length > 0) {
        // 1. Cache raw parsed messages in local IndexedDB
        await saveCachedMessages(messages);

        if (options.forceFull) {
          // Full re-index from all cached messages
          const cleanEvents = await reindexAllEvents(now);
          await saveSettings({ lastSyncTimestamp: Date.now() });

          return {
            newEmailsCount: messages.length,
            extractedEventsCount: cleanEvents.length,
            timestamp: Date.now()
          };
        } else {
          // Incremental extraction & merge
          const extractedEvents: ExtractedEvent[] = [];
          for (const msg of messages) {
            const ev = extractEventFromEmail(msg, now);
            if (ev) {
              extractedEvents.push(ev);
            }
          }

          if (extractedEvents.length > 0) {
            await saveEvents(extractedEvents);
          }

          await saveSettings({ lastSyncTimestamp: Date.now() });

          return {
            newEmailsCount: messages.length,
            extractedEventsCount: extractedEvents.length,
            timestamp: Date.now()
          };
        }
      }

      await saveSettings({ lastSyncTimestamp: Date.now() });
      return { newEmailsCount: 0, extractedEventsCount: 0, timestamp: Date.now() };
    } finally {
      this.isSyncing = false;
    }
  }
}
