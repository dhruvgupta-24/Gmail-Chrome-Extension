import { getDatabase } from './database';
import { ExtractedEvent } from '../types/events';
import { calculateEventStatus } from '../services/extraction/date-parser';
import { mergeEvents, extractEventFromEmail, CURRENT_SCHEMA_VERSION } from '../services/extraction/event-extractor';
import { deduplicateEvents } from './local-search';

export interface BriefingData {
  today: ExtractedEvent[];
  tomorrow: ExtractedEvent[];
  upcoming: ExtractedEvent[];
  actionRequired: ExtractedEvent[];
  totalCount: number;
}

/**
 * Saves a list of events into IndexedDB, merging with any existing events with the same ID or same subject/thread.
 */
export async function saveEvents(events: ExtractedEvent[]): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction('events', 'readwrite');
  const store = tx.objectStore('events');

  for (const event of events) {
    const existing = await store.get(event.id);
    if (existing) {
      const merged = mergeEvents(existing, event);
      await store.put(merged);
    } else {
      await store.put(event);
    }
  }

  await tx.done;
}

/**
 * Re-indexes all events from locally cached raw Gmail messages to purge any legacy contaminated date ranges.
 */
export async function reindexAllEvents(nowDate: Date = new Date()): Promise<ExtractedEvent[]> {
  const db = await getDatabase();
  const allMessages = await db.getAll('cached_messages');

  // Clear legacy events table
  const clearTx = db.transaction('events', 'readwrite');
  await clearTx.objectStore('events').clear();
  await clearTx.done;

  if (allMessages.length === 0) {
    return [];
  }

  const cleanEvents: ExtractedEvent[] = [];
  for (const msg of allMessages) {
    const ev = extractEventFromEmail(msg, nowDate);
    if (ev) {
      cleanEvents.push(ev);
    }
  }

  const deduped = deduplicateEvents(cleanEvents);
  await saveEvents(deduped);
  return deduped;
}

/**
 * Retrieves all events from IndexedDB, refreshing their dynamic status based on the current local date,
 * invalidating legacy schema events if found, and deduplicating thread replies and forward copies.
 */
export async function getAllEvents(nowDate: Date = new Date()): Promise<ExtractedEvent[]> {
  const db = await getDatabase();
  const all = await db.getAll('events');

  // Auto-migration check: If any event is from schema version 1 (or missing schemaVersion), trigger re-index
  const hasLegacyEvents = all.some(e => !e.schemaVersion || e.schemaVersion < CURRENT_SCHEMA_VERSION);
  if (hasLegacyEvents) {
    console.log('[Events Store] Legacy schema events detected, re-indexing from cached messages...');
    return await reindexAllEvents(nowDate);
  }

  // Refresh status relative to now
  const refreshed = all.map(event => {
    const currentStatus = calculateEventStatus(
      event.date,
      nowDate,
      event.endDate,
      event.isContinuousRange,
      event.allDates
    );
    return {
      ...event,
      status: currentStatus !== 'unknown' ? currentStatus : event.status
    };
  });

  return deduplicateEvents(refreshed);
}

/**
 * Retrieves structured briefing organized by Today, Tomorrow, and Upcoming.
 */
export async function getBriefingEvents(nowDate: Date = new Date()): Promise<BriefingData> {
  const all = await getAllEvents(nowDate);

  const todayEvents: ExtractedEvent[] = [];
  const tomorrowEvents: ExtractedEvent[] = [];
  const upcomingEvents: ExtractedEvent[] = [];
  const actionRequiredEvents: ExtractedEvent[] = [];

  for (const ev of all) {
    if (ev.status === 'today') {
      todayEvents.push(ev);
    } else if (ev.status === 'tomorrow') {
      tomorrowEvents.push(ev);
    } else if (ev.status === 'upcoming') {
      upcomingEvents.push(ev);
    }

    if (ev.actionRequired && ev.status !== 'past') {
      actionRequiredEvents.push(ev);
    }
  }

  // Sort chronologically:
  // 1. Events with date & time first
  // 2. Urgent / Action-required items elevated
  const sortComparator = (a: ExtractedEvent, b: ExtractedEvent) => {
    if (a.actionRequired && !b.actionRequired) return -1;
    if (!a.actionRequired && b.actionRequired) return 1;

    const dateA = a.startDate || a.date;
    const dateB = b.startDate || b.date;
    if (dateA && dateB) {
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      if (a.time && b.time) return a.time.localeCompare(b.time);
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  };

  todayEvents.sort(sortComparator);
  tomorrowEvents.sort(sortComparator);
  upcomingEvents.sort(sortComparator);
  actionRequiredEvents.sort(sortComparator);

  return {
    today: todayEvents,
    tomorrow: tomorrowEvents,
    upcoming: upcomingEvents,
    actionRequired: actionRequiredEvents,
    totalCount: todayEvents.length + tomorrowEvents.length + upcomingEvents.length
  };
}

/**
 * Clears all stored events from IndexedDB.
 */
export async function clearAllEvents(): Promise<void> {
  const db = await getDatabase();
  await db.clear('events');
}
