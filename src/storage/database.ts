import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ExtractedEvent } from '../types/events';
import { ParsedEmailMessage } from '../types/gmail';
import { ChatMessage } from '../types/ai';

interface GmailAssistantDB extends DBSchema {
  events: {
    key: string;
    value: ExtractedEvent;
    indexes: {
      'by-status': string;
      'by-date': string;
      'by-type': string;
      'by-action': number;
      'by-updated': string;
    };
  };
  cached_messages: {
    key: string;
    value: ParsedEmailMessage;
    indexes: {
      'by-thread': string;
      'by-timestamp': number;
    };
  };
  chat_history: {
    key: string;
    value: ChatMessage;
    indexes: {
      'by-timestamp': number;
    };
  };
}

const DB_NAME = 'gmail_ai_assistant_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GmailAssistantDB>> | null = null;

export function getDatabase(): Promise<IDBPDatabase<GmailAssistantDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GmailAssistantDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 1. Events Store
        if (!db.objectStoreNames.contains('events')) {
          const eventStore = db.createObjectStore('events', { keyPath: 'id' });
          eventStore.createIndex('by-status', 'status');
          eventStore.createIndex('by-date', 'date');
          eventStore.createIndex('by-type', 'type');
          eventStore.createIndex('by-action', 'actionRequired');
          eventStore.createIndex('by-updated', 'updatedAt');
        }

        // 2. Cached Messages Store
        if (!db.objectStoreNames.contains('cached_messages')) {
          const msgStore = db.createObjectStore('cached_messages', { keyPath: 'id' });
          msgStore.createIndex('by-thread', 'threadId');
          msgStore.createIndex('by-timestamp', 'timestamp');
        }

        // 3. Chat History Store
        if (!db.objectStoreNames.contains('chat_history')) {
          const chatStore = db.createObjectStore('chat_history', { keyPath: 'id' });
          chatStore.createIndex('by-timestamp', 'timestamp');
        }
      }
    });
  }
  return dbPromise;
}
