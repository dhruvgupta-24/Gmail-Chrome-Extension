import { getDatabase } from './database';
import { ExtractedEvent, DateRangeQuery } from '../types/events';
import { calculateEventStatus, parseQueryDateRange, isEventInRange } from '../services/extraction/date-parser';
import { ParsedEmailMessage } from '../types/gmail';
import { mergeEvents, normalizeTitleForDeduplication } from '../services/extraction/event-extractor';

export interface LocalSearchResult {
  events: ExtractedEvent[];
  cachedMessages: ParsedEmailMessage[];
  source: 'local_index';
  isDateQuery?: boolean;
  dateRange?: DateRangeQuery;
}

/**
 * Deduplicates events across threads, forwarded copies, and multiple announcement messages.
 * Matches by threadId, normalized title + organization, or normalized title + date.
 */
export function deduplicateEvents(events: ExtractedEvent[]): ExtractedEvent[] {
  const byKey = new Map<string, ExtractedEvent>();

  for (const ev of events) {
    const normTitle = normalizeTitleForDeduplication(ev.title);
    const org = (ev.company || ev.organization || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const dateKey = ev.date || ev.startDate || 'any';

    // 1. Thread Key
    const threadKey = ev.threadId ? `th_${ev.threadId}` : '';

    // 2. Semantic Content Key (Organization + Normalized Title)
    const contentKey = `content_${org}_${normTitle}`;

    // Check if an event already exists with this threadKey or contentKey
    let matchedKey: string | null = null;
    if (threadKey && byKey.has(threadKey)) {
      matchedKey = threadKey;
    } else if (byKey.has(contentKey)) {
      matchedKey = contentKey;
    } else {
      // Check for partial title overlap if titles are long
      for (const [k, existing] of byKey.entries()) {
        const existingNorm = normalizeTitleForDeduplication(existing.title);
        const existingOrg = (existing.company || existing.organization || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        if (
          (org && existingOrg && org === existingOrg && (normTitle.includes(existingNorm) || existingNorm.includes(normTitle))) ||
          (normTitle.length > 15 && normTitle === existingNorm)
        ) {
          matchedKey = k;
          break;
        }
      }
    }

    if (matchedKey) {
      const existing = byKey.get(matchedKey)!;
      const merged = mergeEvents(existing, ev);
      byKey.set(matchedKey, merged);
    } else {
      const keyToUse = threadKey || contentKey || `ev_${normTitle}_${dateKey}`;
      byKey.set(keyToUse, ev);
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

  // 2. First Priority: Check if query asks for a specific date or date range (e.g. "today and tomorrow")
  const dateRange = parseQueryDateRange(query, nowDate);

  if (dateRange.isDateQuery && dateRange.startDate && dateRange.endDate) {
    // Strictly filter events whose actual event dates / window / deadline overlap the requested range
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
    matchedEvents = activeEvents.filter(e => e.status === 'today');
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
    // General keyword search
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

  const dedupedEvents = deduplicateEvents(matchedEvents);

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
