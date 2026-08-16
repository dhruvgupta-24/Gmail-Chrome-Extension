import { getAllEvents } from './events-store';
import { getDatabase } from './database';
import { ExtractedEvent, DateRangeQuery } from '../types/events';
import { calculateEventStatus, isEventInRange } from '../services/extraction/date-parser';
import { ParsedEmailMessage } from '../types/gmail';
import { mergeEvents, normalizeTitleForDeduplication } from '../services/extraction/event-extractor';
import { parseQueryConstraints, QueryConstraints, normalizeEntityName } from '../services/retrieval/intent';

export interface LocalSearchResult {
  events: ExtractedEvent[];
  cachedMessages: ParsedEmailMessage[];
  source: 'local_index';
  isDateQuery?: boolean;
  dateRange?: DateRangeQuery;
  constraints?: QueryConstraints;
  isEntitySpecific?: boolean;
  matchedOnRequestedDate?: boolean;
}

/**
 * Generic platform or aggregator keywords that should never be used on their own as proof of event identity.
 */
const GENERIC_PLATFORMS = new Set(['', 'general', 'unstop', 'hackerrank', 'hackerearth', 'mettl', 'wheebox', 'forms', 'googleforms', 'gmail', 'mail', 'placement', 'placements', 'tnp']);

/**
 * Deduplicates events across threads, forwarded copies, and multiple announcement messages.
 * Strict provenance rules:
 * - Same threadId merges.
 * - Same non-generic organization + exact/high-similarity title merges.
 * - Different companies, generic aggregators (e.g. Unstop vs Adobe on Unstop), or different titles remain strictly isolated.
 */
export function deduplicateEvents(events: ExtractedEvent[]): ExtractedEvent[] {
  const byKey = new Map<string, ExtractedEvent>();

  for (const ev of events) {
    const normTitle = normalizeTitleForDeduplication(ev.title);
    const org = (ev.company || ev.organization || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const dateKey = ev.date || ev.startDate || 'any';

    // 1. Thread Key (highest confidence provenance)
    const threadKey = ev.threadId ? `th_${ev.threadId}` : '';

    // 2. Semantic Content Key (Non-generic Organization + Normalized Title)
    const isSpecificOrg = !GENERIC_PLATFORMS.has(org);
    const contentKey = isSpecificOrg ? `content_${org}_${normTitle}` : `content_unique_${ev.id || normTitle}_${dateKey}`;

    let matchedKey: string | null = null;
    if (threadKey && byKey.has(threadKey)) {
      matchedKey = threadKey;
    } else if (isSpecificOrg && byKey.has(contentKey)) {
      matchedKey = contentKey;
    } else {
      // Check for exact matching titles across forwarded copies
      for (const [k, existing] of byKey.entries()) {
        const existingNorm = normalizeTitleForDeduplication(existing.title);
        const existingOrg = (existing.company || existing.organization || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const existingIsSpecific = !GENERIC_PLATFORMS.has(existingOrg);

        // Same specific company AND exact matching clean title AND matching date
        if (
          isSpecificOrg &&
          existingIsSpecific &&
          org === existingOrg &&
          normTitle === existingNorm &&
          (ev.date === existing.date || !ev.date || !existing.date)
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
      const keyToUse = threadKey || contentKey || `ev_${normTitle}_${dateKey}_${Math.random().toString(36).slice(2, 6)}`;
      byKey.set(keyToUse, ev);
    }
  }

  return Array.from(byKey.values());
}

/**
 * Evaluates semantic match between an event and an entity query constraint.
 */
function scoreEventForEntity(event: ExtractedEvent, constraints: QueryConstraints): number {
  if (!constraints.entityQuery) return 0;

  const targetEntity = constraints.entityQuery;
  const rawEntity = constraints.rawEntity || targetEntity;

  const orgNorm = normalizeEntityName(event.organization || event.company || '');
  const titleNorm = normalizeTitleForDeduplication(event.title);
  const fullText = `${event.title} ${event.company || ''} ${event.organization || ''} ${event.sourceMessages.map(m => m.subject).join(' ')}`.toLowerCase();

  let score = 0;

  // 1. Exact canonical org match
  if (orgNorm === targetEntity || (event.company && event.company.toLowerCase().includes(rawEntity))) {
    score += 100;
  }

  // 2. Title contains entity
  if (fullText.includes(rawEntity) || titleNorm.includes(targetEntity)) {
    score += 80;
  }

  // 3. If no entity keyword matches anywhere in the event, return 0 (strict non-match)
  if (score === 0) {
    return 0;
  }

  // 4. Event type matching boost
  if (constraints.eventType && constraints.eventType !== 'any') {
    const isTestType = ['test', 'assessment', 'coding_round', 'quiz', 'exam'].includes(event.type);
    const hasTestKeywords = /\b(assessment|test|oa|exam|coding\s+round|online\s+test)\b/i.test(fullText);

    // Check if stages match the requested event type
    const stageMatch = (event.stages || []).some(s => {
      if (constraints.eventType === 'test') return ['assessment', 'coding_round', 'test'].includes(s.type);
      if (constraints.eventType === 'ppt') return s.type === 'ppt';
      if (constraints.eventType === 'interview') return s.type === 'interview';
      if (constraints.eventType === 'deadline') return s.type === 'registration' || s.type === 'deadline';
      return false;
    });

    if (constraints.eventType === 'test' && (isTestType || hasTestKeywords || stageMatch)) {
      score += 40;
    } else if (constraints.eventType === 'interview' && (event.type === 'interview' || stageMatch)) {
      score += 40;
    } else if (constraints.eventType === 'ppt' && (event.type === 'ppt' || fullText.includes('ppt') || stageMatch)) {
      score += 40;
    } else if (constraints.eventType === 'deadline' && (event.isDeadline || event.type === 'registration' || stageMatch)) {
      score += 40;
    }
  }

  return score;
}

/**
 * Searches the local database for events and cached messages matching user query and constraints.
 */
export async function searchLocalDatabase(
  query: string,
  nowDate: Date = new Date()
): Promise<LocalSearchResult> {
  const db = await getDatabase();
  // Using getAllEvents guarantees auto-migration & re-indexing from cached messages when schema changes
  const allEvents = await getAllEvents(nowDate);
  const allMessages = await db.getAll('cached_messages');

  const lowerQuery = query.toLowerCase().trim();
  const constraints = parseQueryConstraints(query, nowDate);

  // 1. Refresh dynamic status for all events relative to now
  const activeEvents = allEvents.map(event => {
    const currentStatus = calculateEventStatus(
      event.date,
      nowDate,
      event.endDate,
      event.isContinuousRange,
      event.allDates,
      event.stages
    );
    return {
      ...event,
      status: currentStatus !== 'unknown' ? currentStatus : event.status
    };
  });

  // 2. HIGHEST PRIORITY: Entity-Aware Search (e.g. "do i have idfc test today?", "when is infoedge test?")
  if (constraints.isEntitySpecific && constraints.entityQuery) {
    // Score all events against the target entity
    const scoredEvents: { event: ExtractedEvent; score: number }[] = [];

    for (const ev of activeEvents) {
      const score = scoreEventForEntity(ev, constraints);
      if (score > 0) {
        scoredEvents.push({ event: ev, score });
      }
    }

    // Sort by relevance score descending
    scoredEvents.sort((a, b) => b.score - a.score);

    const dedupedEntityEvents = deduplicateEvents(scoredEvents.map(s => s.event));

    if (dedupedEntityEvents.length > 0) {
      let finalEvents = dedupedEntityEvents;
      let matchedOnRequestedDate: boolean | undefined = undefined;

      // If a specific date range was requested (e.g. "today" / "tomorrow" / "Aug 16")
      if (constraints.dateRange && constraints.dateRange.startDate && constraints.dateRange.endDate) {
        const queryStart = constraints.dateRange.startDate;
        const queryEnd = constraints.dateRange.endDate;

        // Check if any event or event stage for this entity overlaps the requested date
        const dateMatched = dedupedEntityEvents.filter(ev => {
          // Check standard event date range
          if (isEventInRange(ev, queryStart, queryEnd)) return true;

          // Check multi-stage process stages
          if (ev.stages && ev.stages.length > 0) {
            return ev.stages.some(s => {
              if (constraints.eventType && constraints.eventType !== 'any') {
                const stageTypeMatches =
                  (constraints.eventType === 'test' && ['assessment', 'coding_round', 'test'].includes(s.type)) ||
                  (constraints.eventType === 'ppt' && s.type === 'ppt') ||
                  (constraints.eventType === 'interview' && s.type === 'interview') ||
                  (constraints.eventType === 'deadline' && (s.type === 'registration' || s.type === 'deadline'));
                if (!stageTypeMatches) return false;
              }
              return s.date && s.date >= queryStart && s.date <= queryEnd;
            });
          }

          return false;
        });

        if (dateMatched.length > 0) {
          matchedOnRequestedDate = true;
          finalEvents = dateMatched;
        } else {
          matchedOnRequestedDate = false;
          // Keep all upcoming events for this entity so the responder can state when the next one is
          const upcomingOrAll = dedupedEntityEvents.filter(e => e.status !== 'past');
          finalEvents = upcomingOrAll.length > 0 ? upcomingOrAll : dedupedEntityEvents;
        }
      }

      // Sort chronological
      finalEvents.sort((a, b) => {
        const dateA = a.startDate || a.date || '';
        const dateB = b.startDate || b.date || '';
        return dateA.localeCompare(dateB);
      });

      // Find matching messages for this entity
      const entityRaw = constraints.rawEntity || constraints.entityQuery;
      const matchedMessages = allMessages.filter(m => {
        const searchSpace = `${m.subject} ${m.sender} ${m.plainText}`.toLowerCase();
        return searchSpace.includes(entityRaw);
      }).slice(0, 5);

      return {
        events: finalEvents,
        cachedMessages: matchedMessages,
        source: 'local_index',
        constraints,
        isEntitySpecific: true,
        isDateQuery: Boolean(constraints.dateRange),
        dateRange: constraints.dateRange,
        matchedOnRequestedDate
      };
    } else {
      // Entity was specified but no matching events were found in indexed database
      return {
        events: [],
        cachedMessages: [],
        source: 'local_index',
        constraints,
        isEntitySpecific: true,
        isDateQuery: Boolean(constraints.dateRange),
        dateRange: constraints.dateRange,
        matchedOnRequestedDate: false
      };
    }
  }

  // 3. Date-Range Query (when NO specific entity was requested, e.g. "what do i have today and tomorrow?")
  const dateRange = constraints.dateRange;
  if (dateRange && dateRange.isDateQuery && dateRange.startDate && dateRange.endDate) {
    const rangeMatchedEvents = activeEvents.filter(ev =>
      isEventInRange(ev, dateRange.startDate!, dateRange.endDate!)
    );

    const dedupedRangeEvents = deduplicateEvents(rangeMatchedEvents);

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
      dateRange,
      constraints
    };
  }

  // 4. Categorical & Keyword search
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
    source: 'local_index',
    constraints
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
