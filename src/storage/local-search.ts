import { getDatabase } from './database';
import { ExtractedEvent, DateRangeQuery } from '../types/events';
import { calculateEventStatus, parseQueryDateRange, isEventInRange } from '../services/extraction/date-parser';
import { ParsedEmailMessage } from '../types/gmail';
import { cleanEventTitle, mergeEvents } from '../services/extraction/event-extractor';

export interface LocalSearchResult {
  events: ExtractedEvent[];
  cachedMessages: ParsedEmailMessage[];
  source: 'local_index';
  isDateQuery?: boolean;
  dateRange?: DateRangeQuery;
}

/**
 * Deduplicates a list of events by threadId or (company + cleanTitle + startDate).
 */
export function deduplicateEvents(events: ExtractedEvent[]): ExtractedEvent[] {
  const byKey = new Map<string, ExtractedEvent>();

  for (const ev of events) {
    const cleanTitle = cleanEventTitle(ev.title).toLowerCase();
    const company = (ev.company || ev.organization || '').toLowerCase();
    const dateKey = ev.startDate || ev.date || 'no-date';

    // Primary key: threadId if available
    let key = ev.threadId ? `thread-${ev.threadId}` : '';
    if (!key) {
      // Secondary key: company + cleanTitle + dateKey
      key = `${company}::${cleanTitle}::${dateKey}`;
    }

    if (byKey.has(key)) {
      const existing = byKey.get(key)!;
      byKey.set(key, mergeEvents(existing, ev));
    } else {
      byKey.set(key, ev);
    }
  }

  return Array.from(byKey.values());
}

/**
 * Searches the local IndexedDB database for events and cached messages matching user query and intent.
 */
export async function searchLocalDatabase(
  query: string,
  nowDate: Date = new Date()
): Promise<LocalSearchResult> {
  const db = await getDatabase();
  const allEvents = await db.getAll('events');
  const allMessages = await db.getAll('cached_messages');

  const lowerQuery = query.toLowerCase().trim();

  // 1. Refresh dynamic status for all events relative to now
  const activeEvents = allEvents.map(event => {
    const currentStatus = calculateEventStatus(event.startDate || event.date, nowDate, event.endDate);
    return {
      ...event,
      status: currentStatus !== 'unknown' ? currentStatus : event.status
    };
  });

  // 2. First Priority: Check if query asks for a specific date or date range
  const dateRange = parseQueryDateRange(query, nowDate);

  if (dateRange.isDateQuery && dateRange.startDate && dateRange.endDate) {
    console.log(`[Local Search] Date-range query detected: ${dateRange.startDate} to ${dateRange.endDate}`);

    // Strictly filter events whose actual event window overlaps the requested range
    const rangeMatchedEvents = activeEvents.filter(ev =>
      isEventInRange(ev, dateRange.startDate!, dateRange.endDate!)
    );

    const dedupedRangeEvents = deduplicateEvents(rangeMatchedEvents);

    // Sort chronologically by start date, then time
    dedupedRangeEvents.sort((a, b) => {
      const dateA = a.startDate || a.date || '';
      const dateB = b.startDate || b.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.time || '').localeCompare(b.time || '');
    });

    // Gather corresponding source messages
    const matchingMessageIds = new Set<string>();
    for (const ev of dedupedRangeEvents) {
      for (const s of ev.sourceMessages) {
        matchingMessageIds.add(s.messageId);
      }
    }

    const matchedMessages = allMessages.filter(m => matchingMessageIds.has(m.id)).slice(0, 6);

    return {
      events: dedupedRangeEvents,
      cachedMessages: matchedMessages,
      source: 'local_index',
      isDateQuery: true,
      dateRange
    };
  }

  // 3. Categorical & Keyword search
  let matchedEvents: ExtractedEvent[] = [];

  const isTodayQuery = lowerQuery.includes('today') || lowerQuery.includes('due today') || lowerQuery.includes('today briefing');
  const isTomorrowQuery = lowerQuery.includes('tomorrow') || lowerQuery.includes('due tomorrow');
  const isTestsQuery = lowerQuery.includes('test') || lowerQuery.includes('exam') || lowerQuery.includes('quiz') || lowerQuery.includes('assessment') || lowerQuery.includes('coding round');
  const isActionQuery = lowerQuery.includes('action') || lowerQuery.includes('deadline') || lowerQuery.includes('register') || lowerQuery.includes('submit');
  const isCareerQuery = lowerQuery.includes('placement') || lowerQuery.includes('internship') || lowerQuery.includes('interview') || lowerQuery.includes('job');

  if (isTodayQuery) {
    matchedEvents = activeEvents.filter(e => e.status === 'today' || (e.actionRequired && e.status !== 'past'));
  } else if (isTomorrowQuery) {
    matchedEvents = activeEvents.filter(e => e.status === 'tomorrow');
  } else if (isTestsQuery) {
    matchedEvents = activeEvents.filter(e =>
      ['test', 'exam', 'quiz', 'assessment', 'coding_round', 'online_test', 'aptitude_test'].includes(e.type) && e.status !== 'past'
    );
  } else if (isActionQuery) {
    matchedEvents = activeEvents.filter(e => e.actionRequired && e.status !== 'past');
  } else if (isCareerQuery) {
    matchedEvents = activeEvents.filter(e =>
      ['placement', 'internship', 'interview', 'coding_round', 'ppt'].includes(e.type) && e.status !== 'past'
    );
  } else {
    // General keyword search across title, organization, company, actionDescription, and type
    const queryTokens = lowerQuery
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(t => !['what', 'do', 'i', 'have', 'the', 'a', 'an', 'is', 'are', 'in', 'my', 'find', 'show', 'give', 'me', 'all', 'any'].includes(t));

    matchedEvents = activeEvents.filter(event => {
      const searchSpace = `${event.title} ${event.company || ''} ${event.organization || ''} ${event.actionDescription || ''} ${event.type} ${event.links.map(l => l.label).join(' ')}`.toLowerCase();
      return queryTokens.some(token => searchSpace.includes(token));
    });

    if (queryTokens.length > 0) {
      matchedEvents.sort((a, b) => {
        const textA = `${a.title} ${a.company || ''} ${a.organization || ''} ${a.actionDescription || ''}`.toLowerCase();
        const textB = `${b.title} ${b.company || ''} ${b.organization || ''} ${b.actionDescription || ''}`.toLowerCase();
        const scoreA = queryTokens.filter(t => textA.includes(t)).length;
        const scoreB = queryTokens.filter(t => textB.includes(t)).length;
        return scoreB - scoreA;
      });
    }
  }

  // Deduplicate before returning
  const dedupedEvents = deduplicateEvents(matchedEvents);

  // Sort chronologically if dates exist
  dedupedEvents.sort((a, b) => {
    if (a.startDate && b.startDate) return a.startDate.localeCompare(b.startDate);
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const queryTokens = lowerQuery
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(t => !['what', 'do', 'i', 'have', 'the', 'a', 'an', 'is', 'are', 'in', 'my', 'find', 'show', 'give', 'me', 'all', 'any'].includes(t));

  const matchedMessages = allMessages.filter(msg => {
    const searchSpace = `${msg.subject} ${msg.sender} ${msg.snippet} ${msg.plainText.substring(0, 500)}`.toLowerCase();
    return queryTokens.some(token => searchSpace.includes(token));
  }).slice(0, 5);

  return {
    events: dedupedEvents,
    cachedMessages: matchedMessages,
    source: 'local_index'
  };
}

/**
 * Saves parsed messages into IndexedDB cached_messages store.
 */
export async function saveCachedMessages(messages: ParsedEmailMessage[]): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction('cached_messages', 'readwrite');
  const store = tx.objectStore('cached_messages');

  for (const msg of messages) {
    await store.put(msg);
  }

  await tx.done;
}
