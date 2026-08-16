import { IntentResult, ChatMessage } from '../../types/ai';
import { DateRangeQuery } from '../../types/events';
import { parseQueryDateRange } from '../extraction/date-parser';
import { GMAIL_SEARCH_CATEGORIES } from '../../shared/constants';

export type QuestionType =
  | 'existence'        // "do i have...", "is there...", "is my...", "any test today..."
  | 'time_query'       // "when is...", "what time is...", "at what time...", "dates of..."
  | 'link_query'       // "what is the link...", "where is the link..."
  | 'action_query'     // "what do i need to do...", "what is required..."
  | 'process_query'    // "tell me all details about interview process", "explain hiring process"
  | 'general_summary'; // "what do i have today", "show today's schedule", "due today"

export interface QueryConstraints {
  originalQuery: string;
  resolvedQuery?: string;   // Context-enriched query if conversational reference was resolved
  entityQuery?: string;     // Canonical entity e.g. "idfc", "infoedge", "sigmoid", "bain", "drreddy"
  rawEntity?: string;       // Original extracted token e.g. "Bain & Company", "IDFC First Bank"
  eventType?: 'test' | 'interview' | 'ppt' | 'deadline' | 'internship' | 'placement' | 'any';
  dateRange?: DateRangeQuery;
  questionType: QuestionType;
  isEntitySpecific: boolean;
  activeStageType?: 'ppt' | 'assessment' | 'interview' | 'registration';
  isConversationalFollowUp?: boolean;
}

export interface ConversationContextState {
  activeEntity?: string;            // Canonical e.g. "bain"
  activeEntityDisplayName?: string; // Display name e.g. "Bain & Company"
  activeEventId?: string;
  activeEventType?: string;
  activeStageType?: 'ppt' | 'assessment' | 'interview' | 'registration';
  recentIntent?: string;
}

// Known entity alias mapping to normalize search terms
const KNOWN_ENTITIES: Record<string, string[]> = {
  idfc: ['idfc', 'idfc first bank', 'idfc bank'],
  infoedge: ['infoedge', 'info edge', 'infoedge india', 'infoedge india ltd', 'infoedge india limited', 'naukri'],
  sigmoid: ['sigmoid', 'sigmoid analytics'],
  tcs: ['tcs', 'tcs nqt', 'tata consultancy services'],
  cognizant: ['cognizant', 'cognizant ace'],
  drreddy: ['dr reddy', 'dr reddys', 'dr. reddy', 'destination dr reddy', 'dr. reddy\'s'],
  bnpparibas: ['bnp paribas', 'bnp', 'bnpparibas', 'innoversite', 'innoversité'],
  aimcat: ['aimcat', 'time', 'time4education'],
  unstop: ['unstop'],
  goldmansachs: ['goldman sachs', 'goldman'],
  amazon: ['amazon', 'aws'],
  google: ['google'],
  microsoft: ['microsoft'],
  adobe: ['adobe'],
  salesforce: ['salesforce'],
  flipkart: ['flipkart'],
  uber: ['uber'],
  infosys: ['infosys', 'infy'],
  wipro: ['wipro'],
  accenture: ['accenture'],
  deloitte: ['deloitte'],
  pwc: ['pwc'],
  ey: ['ey', 'ernst & young'],
  kpmg: ['kpmg'],
  bain: ['bain', 'bain & company', 'bain and company', 'bain & co', 'bain & co.'],
  mckinsey: ['mckinsey', 'mckinsey & company'],
  bcg: ['bcg', 'boston consulting group'],
  qualcomm: ['qualcomm'],
  cisco: ['cisco'],
  oracle: ['oracle'],
  intel: ['intel'],
  nvidia: ['nvidia'],
  apple: ['apple'],
  samsung: ['samsung']
};

/**
 * Normalizes an entity name into a canonical search string.
 */
export function normalizeEntityName(name: string): string {
  const rawClean = name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const stripped = rawClean.replace(/(?:indialtd|limited|ltd|corp|corporation|inc|llc|india|andcompany|company|co)$/g, '').trim();

  for (const [canonical, aliases] of Object.entries(KNOWN_ENTITIES)) {
    if (
      rawClean === canonical ||
      stripped === canonical ||
      aliases.some(a => {
        const aClean = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        const aStripped = aClean.replace(/(?:indialtd|limited|ltd|corp|corporation|inc|llc|india|andcompany|company|co)$/g, '');
        return rawClean === aClean || stripped === aStripped || rawClean === aStripped || stripped === aClean;
      })
    ) {
      return canonical;
    }
  }
  return stripped || rawClean;
}

/**
 * Extracts the active conversation entity and state from preceding chat turns.
 */
export function extractConversationState(history: ChatMessage[] = []): ConversationContextState {
  const state: ConversationContextState = {};
  if (!history || history.length === 0) return state;

  // Search backwards from the most recent messages
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];

    // 1. Check if the message had associated ExtractedEvents
    if (msg.events && msg.events.length > 0) {
      const topEvent = msg.events[0];
      const org = topEvent.company || topEvent.organization;
      if (org && !state.activeEntity) {
        state.activeEntity = normalizeEntityName(org);
        state.activeEntityDisplayName = org;
        state.activeEventId = topEvent.id;
        state.activeEventType = topEvent.type;
      }
    }

    // 2. Check text content for known entities if not yet captured
    if (!state.activeEntity && msg.content) {
      const lower = msg.content.toLowerCase();
      for (const [canonical, aliases] of Object.entries(KNOWN_ENTITIES)) {
        for (const alias of aliases) {
          const reg = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (reg.test(lower)) {
            state.activeEntity = canonical;
            state.activeEntityDisplayName = alias.charAt(0).toUpperCase() + alias.slice(1);
            break;
          }
        }
        if (state.activeEntity) break;
      }
    }

    // Stop searching once we have found the active entity
    if (state.activeEntity) {
      break;
    }
  }

  return state;
}

/**
 * Extracts structured constraints (entity, event type, date range, question type) from user query,
 * resolving conversational pronouns, ellipsis, and context when applicable.
 */
export function parseQueryConstraints(
  query: string,
  nowDate: Date = new Date(),
  conversationHistory: ChatMessage[] = []
): QueryConstraints {
  const lower = query.trim().toLowerCase();

  // 1. Question Type Detection
  let questionType: QuestionType = 'general_summary';
  if (
    /^(?:do\s+i\s+have|is\s+(?:there|my|the)|are\s+there|have\s+i\s+got|is\s+any|any)\b/i.test(lower) ||
    /\b(?:scheduled|active|happening)\s+today\b/i.test(lower) ||
    /\b(?:scheduled|active|happening)\s+tomorrow\b/i.test(lower)
  ) {
    questionType = 'existence';
  } else if (/\b(?:process|hiring\s+process|selection\s+process|all\s+details|interview\s+process|recruitment\s+process)\b/i.test(lower)) {
    questionType = 'process_query';
  } else if (/^(?:when\s+is|what\s+time|at\s+what\s+time|when\s+does|when\s+will|dates?\s+of)\b/i.test(lower) || /\bdates?\s+of\b/i.test(lower)) {
    questionType = 'time_query';
  } else if (/\b(?:where|what|give|share|get)\b.*\b(?:link|url|portal)\b/i.test(lower) || /\b(?:link\s+for|portal\s+link|test\s+link|meeting\s+link)\b/i.test(lower)) {
    questionType = 'link_query';
  } else if (/\b(?:what\s+action|what\s+do\s+i\s+need\s+to\s+do|how\s+to\s+register|how\s+to\s+apply)\b/i.test(lower)) {
    questionType = 'action_query';
  }

  // 2. Event Type Detection
  let eventType: QueryConstraints['eventType'] = 'any';
  let activeStageType: QueryConstraints['activeStageType'] = undefined;

  if (/\b(interview|technical\s+round|hr\s+round|personal\s+interview|discussion)\b/i.test(lower)) {
    eventType = 'interview';
    activeStageType = 'interview';
  } else if (/\b(ppt|pre[- ]placement\s+talk|presentation)\b/i.test(lower)) {
    eventType = 'ppt';
    activeStageType = 'ppt';
  } else if (/\b(test|exam|assessment|oa\b|quiz|coding\s+round|online\s+test|hackerrank|aptitude)\b/i.test(lower)) {
    eventType = 'test';
    activeStageType = 'assessment';
  } else if (/\b(deadline|registration|apply|submission|register|last\s+date|nomination)\b/i.test(lower)) {
    eventType = 'deadline';
    activeStageType = 'registration';
  } else if (/\b(internship|summer\s+intern)\b/i.test(lower)) {
    eventType = 'internship';
  } else if (/\b(placement|campus\s+drive|recruitment)\b/i.test(lower)) {
    eventType = 'placement';
  }

  // 3. Date Range Detection
  const dateRange = parseQueryDateRange(query, nowDate);

  // 4. Entity Extraction from Current Query
  let entityQuery: string | undefined;
  let rawEntity: string | undefined;

  // Check known entities dictionary first
  for (const [canonical, aliases] of Object.entries(KNOWN_ENTITIES)) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`\\b${escaped}\\b`, 'i');
      if (reg.test(lower)) {
        entityQuery = canonical;
        rawEntity = alias;
        break;
      }
    }
    if (entityQuery) break;
  }

  // Dynamic entity extraction if not in known dictionary
  if (!entityQuery) {
    const patterns = [
      /(?:do\s+i\s+have|is\s+there\s+any|is\s+my|is\s+the|any)\s+([a-z0-9\s&.'-]+?)\s+(?:test|exam|assessment|oa|interview|ppt|deadline|round|session|drive|link)/i,
      /when\s+is\s+(?:my\s+|the\s+)?([a-z0-9\s&.'-]+?)\s+(?:test|exam|assessment|oa|interview|ppt|deadline|registration|round|drive)/i,
      /(?:details\s+(?:of|about)|schedule\s+for|info\s+on|dates\s+of)\s+([a-z0-9\s&.'-]+?)(?:\s+(?:test|exam|assessment|oa|interview|ppt|deadline|process)|$)/i
    ];

    for (const pat of patterns) {
      const match = lower.match(pat);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const stopWords = ['a', 'an', 'the', 'my', 'any', 'scheduled', 'upcoming', 'new', 'due', 'its', 'this', 'that', 'all', 'interview'];
        if (!stopWords.includes(candidate) && candidate.length >= 2) {
          entityQuery = normalizeEntityName(candidate);
          rawEntity = candidate;
          break;
        }
      }
    }
  }

  // 5. Conversational Reference & Context Resolution
  let isConversationalFollowUp = false;
  let resolvedQuery: string | undefined = undefined;

  // Check if current query is a conversational follow-up/ellipsis requiring context resolution
  // Conditions:
  // - No explicit new entity found in current message
  // - NOT a purely global query like "what do i have tomorrow?", "what's due today?"
  // - Matches follow-up phrases or pronouns ("tell me about interview", "what about its date?", "what happens after that?", "give me details", "when is it?", "where is the link?")
  const isGlobalQuery = /^(what\s+do\s+i\s+have\s+(?:due\s+)?(?:today|tomorrow|this\s+week)|show\s+(?:all\s+)?(?:upcoming|today|tomorrow)|today'?s\s+briefing|due\s+(?:today|tomorrow))$/i.test(lower.trim());

  if (!entityQuery && !isGlobalQuery && conversationHistory.length > 0) {
    const convState = extractConversationState(conversationHistory);
    if (convState.activeEntity && convState.activeEntityDisplayName) {
      const isFollowUpPattern =
        /^(tell\s+me\s+about|what\s+about|how\s+about|give\s+details\s+about|when\s+is|what\s+time\s+is|where\s+is)\s+(the\s+|its\s+|that\s+)?(interview|test|assessment|ppt|deadline|registration|process|link|date)/i.test(lower) ||
        /\b(interview|assessment|ppt|its\s+date|after\s+that|next\s+step|the\s+link)\b/i.test(lower) ||
        /^(interview|test|ppt|assessment|link|date|dates)$/i.test(lower);

      if (isFollowUpPattern) {
        entityQuery = convState.activeEntity;
        rawEntity = convState.activeEntityDisplayName;
        isConversationalFollowUp = true;
        resolvedQuery = `${convState.activeEntityDisplayName} ${query}`;
      }
    }
  }

  const isEntitySpecific = Boolean(entityQuery);

  return {
    originalQuery: query,
    resolvedQuery,
    entityQuery,
    rawEntity,
    eventType,
    dateRange: dateRange.isDateQuery ? dateRange : undefined,
    questionType,
    isEntitySpecific,
    activeStageType,
    isConversationalFollowUp
  };
}

/**
 * Classifies the intent of a user query and determines the target Gmail search strategy.
 */
export function analyzeIntent(
  query: string,
  now: Date = new Date(),
  conversationHistory: ChatMessage[] = []
): IntentResult {
  const constraints = parseQueryConstraints(query, now, conversationHistory);
  const lower = query.trim().toLowerCase();

  // Helper to format YYYY/MM/DD for Gmail search queries
  const formatGmailDate = (d: Date) => {
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentFilter = `after:${formatGmailDate(thirtyDaysAgo)}`;

  // 1. Entity Specific Search (e.g. "bain", "idfc", "infoedge", "sigmoid")
  if (constraints.isEntitySpecific && constraints.rawEntity) {
    const targetKeywords = [constraints.rawEntity];
    if (constraints.eventType && constraints.eventType !== 'any') {
      targetKeywords.push(constraints.eventType);
    }

    return {
      queryType: 'specific_search',
      keywords: targetKeywords,
      gmailQuery: `(${constraints.rawEntity}) ${recentFilter} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`,
      intentExplanation: `Searching specifically for "${constraints.rawEntity}" emails and events.`
    };
  }

  // 2. Due Today / Briefing Today
  if (
    lower.includes('today') ||
    lower.includes("today's briefing") ||
    lower.includes('due today') ||
    lower.includes('what do i have today')
  ) {
    return {
      queryType: 'due_today',
      keywords: ['today', 'due', 'test', 'deadline', 'submission', 'assessment', 'interview'],
      gmailQuery: `(${GMAIL_SEARCH_CATEGORIES.ACADEMIC} OR ${GMAIL_SEARCH_CATEGORIES.CAREER} OR ${GMAIL_SEARCH_CATEGORIES.URGENT}) ${recentFilter} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`,
      intentExplanation: 'Searching for academic tasks, deadlines, assessments, and notices relevant for today.'
    };
  }

  // 3. Due Tomorrow
  if (
    lower.includes('tomorrow') ||
    lower.includes('due tomorrow') ||
    lower.includes('what do i have due tomorrow')
  ) {
    return {
      queryType: 'due_tomorrow',
      keywords: ['tomorrow', 'due', 'test', 'deadline', 'submission', 'assessment', 'interview'],
      gmailQuery: `(${GMAIL_SEARCH_CATEGORIES.ACADEMIC} OR ${GMAIL_SEARCH_CATEGORIES.CAREER} OR ${GMAIL_SEARCH_CATEGORIES.URGENT}) ${recentFilter} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`,
      intentExplanation: 'Searching for tasks, deadlines, tests, and assessments scheduled for tomorrow.'
    };
  }

  // 4. Upcoming Tests / Assessments / Coding rounds
  if (
    lower.includes('test') ||
    lower.includes('quiz') ||
    lower.includes('exam') ||
    lower.includes('assessment') ||
    lower.includes('coding round') ||
    lower.includes('hackerrank')
  ) {
    return {
      queryType: 'upcoming_tests',
      keywords: ['test', 'exam', 'quiz', 'assessment', 'coding round', 'hackerrank', 'mettl'],
      gmailQuery: `subject:(exam OR test OR quiz OR assessment OR "coding round" OR "online test" OR hackerrank OR mettl OR wheebox OR unstop) ${recentFilter} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`,
      intentExplanation: 'Searching for upcoming tests, quizzes, online assessments, and coding rounds.'
    };
  }

  // 5. Action Required / Registrations / Submissions / Deadlines
  if (
    lower.includes('action required') ||
    lower.includes('action') ||
    lower.includes('deadline') ||
    lower.includes('submit') ||
    lower.includes('register') ||
    lower.includes('registration')
  ) {
    return {
      queryType: 'action_required',
      keywords: ['action required', 'deadline', 'register', 'submit', 'form', 'apply'],
      gmailQuery: `subject:("action required" OR deadline OR registration OR register OR submission OR submit OR "last date" OR urgent OR form) ${recentFilter} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`,
      intentExplanation: 'Searching for emails requiring immediate action, submission, or registration.'
    };
  }

  // 6. Generic search or topic-specific query
  const cleanTokens = lower
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => !['what', 'do', 'i', 'have', 'the', 'a', 'an', 'is', 'are', 'in', 'my', 'email', 'emails', 'mailbox', 'find', 'show', 'give', 'me', 'all'].includes(w));

  const keywordQuery = cleanTokens.length > 0 ? cleanTokens.join(' OR ') : 'important';

  return {
    queryType: 'general_qa',
    keywords: cleanTokens,
    gmailQuery: `(${keywordQuery}) ${recentFilter} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`,
    intentExplanation: `Searching mailbox for "${cleanTokens.join(' ')}"`
  };
}
