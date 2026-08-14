import { getDatabase } from './database';
import { ExtractedEvent } from '../types/events';
import { calculateEventStatus } from '../services/extraction/date-parser';
import { ParsedEmailMessage } from '../types/gmail';

export interface LocalSearchResult {
  events: ExtractedEvent[];
  cachedMessages: ParsedEmailMessage[];
  source: 'local_index';
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
  const queryTokens = lowerQuery
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(t => !['what', 'do', 'i', 'have', 'the', 'a', 'an', 'is', 'are', 'in', 'my', 'find', 'show', 'give', 'me', 'all', 'any'].includes(t));

  // 1. Refresh dynamic status for all events relative to now
  const activeEvents = allEvents.map(event => {
    const currentStatus = calculateEventStatus(event.date, nowDate);
    return {
      ...event,
      status: currentStatus !== 'unknown' ? currentStatus : event.status
    };
  });

  // 2. Filter events matching intent or query tokens
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
      ['test', 'exam', 'quiz', 'assessment', 'coding_round'].includes(e.type) && e.status !== 'past'
    );
  } else if (isActionQuery) {
    matchedEvents = activeEvents.filter(e => e.actionRequired && e.status !== 'past');
  } else if (isCareerQuery) {
    matchedEvents = activeEvents.filter(e =>
      ['placement', 'internship', 'interview', 'coding_round'].includes(e.type) && e.status !== 'past'
    );
  } else {
    // General keyword search across title, organization, actionDescription, and source messages
    matchedEvents = activeEvents.filter(event => {
      const searchSpace = `${event.title} ${event.organization || ''} ${event.actionDescription || ''} ${event.type} ${event.links.map(l => l.label).join(' ')}`.toLowerCase();
      return queryTokens.some(token => searchSpace.includes(token));
    });
  }

  // If specific tokens exist and query wasn't a standard intent, score/rank by token match count
  if (queryTokens.length > 0 && !isTodayQuery && !isTomorrowQuery) {
    matchedEvents.sort((a, b) => {
      const textA = `${a.title} ${a.organization || ''} ${a.actionDescription || ''}`.toLowerCase();
      const textB = `${b.title} ${b.organization || ''} ${b.actionDescription || ''}`.toLowerCase();
      const scoreA = queryTokens.filter(t => textA.includes(t)).length;
      const scoreB = queryTokens.filter(t => textB.includes(t)).length;
      return scoreB - scoreA;
    });
  }

  // 3. Find matching cached messages
  const matchedMessages = allMessages.filter(msg => {
    const searchSpace = `${msg.subject} ${msg.sender} ${msg.snippet} ${msg.plainText.substring(0, 500)}`.toLowerCase();
    return queryTokens.some(token => searchSpace.includes(token));
  }).slice(0, 5);

  return {
    events: matchedEvents,
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
