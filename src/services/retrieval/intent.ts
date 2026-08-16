import { IntentResult } from '../../types/ai';
import { DateRangeQuery } from '../../types/events';
import { parseQueryDateRange } from '../extraction/date-parser';
import { GMAIL_SEARCH_CATEGORIES } from '../../shared/constants';

export type QuestionType =
  | 'existence'        // "do i have...", "is there...", "is my...", "any test today..."
  | 'time_query'       // "when is...", "what time is...", "at what time..."
  | 'link_query'       // "what is the link...", "where is the link..."
  | 'action_query'     // "what do i need to do...", "what is required..."
  | 'general_summary'; // "what do i have today", "show today's schedule", "due today"

export interface QueryConstraints {
  originalQuery: string;
  entityQuery?: string;     // e.g. "idfc", "infoedge", "sigmoid", "tcs", "bnp paribas", "dr reddy", "cognizant"
  rawEntity?: string;       // Original extracted token
  eventType?: 'test' | 'interview' | 'ppt' | 'deadline' | 'internship' | 'placement' | 'any';
  dateRange?: DateRangeQuery;
  questionType: QuestionType;
  isEntitySpecific: boolean;
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
  bain: ['bain', 'bain & company'],
  mckinsey: ['mckinsey']
};

/**
 * Normalizes an entity name into a canonical search string.
 */
export function normalizeEntityName(name: string): string {
  const rawClean = name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const stripped = rawClean.replace(/(?:indialtd|limited|ltd|corp|corporation|inc|llc|india)$/g, '').trim();

  for (const [canonical, aliases] of Object.entries(KNOWN_ENTITIES)) {
    if (
      rawClean === canonical ||
      stripped === canonical ||
      aliases.some(a => {
        const aClean = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        const aStripped = aClean.replace(/(?:indialtd|limited|ltd|corp|corporation|inc|llc|india)$/g, '');
        return rawClean === aClean || stripped === aStripped || rawClean === aStripped || stripped === aClean;
      })
    ) {
      return canonical;
    }
  }
  return stripped || rawClean;
}

/**
 * Extracts structured constraints (entity, event type, date range, question type) from user query.
 */
export function parseQueryConstraints(query: string, nowDate: Date = new Date()): QueryConstraints {
  const lower = query.trim().toLowerCase();

  // 1. Question Type Detection
  let questionType: QuestionType = 'general_summary';
  if (
    /^(?:do\s+i\s+have|is\s+(?:there|my|the)|are\s+there|have\s+i\s+got|is\s+any|any)\b/i.test(lower) ||
    /\b(?:scheduled|active|happening)\s+today\b/i.test(lower) ||
    /\b(?:scheduled|active|happening)\s+tomorrow\b/i.test(lower)
  ) {
    questionType = 'existence';
  } else if (/^(?:when\s+is|what\s+time|at\s+what\s+time|when\s+does|when\s+will|date\s+of)\b/i.test(lower)) {
    questionType = 'time_query';
  } else if (/\b(?:what\s+is\s+the\s+link|where\s+is\s+the\s+link|give\s+me\s+link|portal\s+link|test\s+link|meeting\s+link)\b/i.test(lower)) {
    questionType = 'link_query';
  } else if (/\b(?:what\s+action|what\s+do\s+i\s+need\s+to\s+do|how\s+to\s+register|how\s+to\s+apply)\b/i.test(lower)) {
    questionType = 'action_query';
  }

  // 2. Event Type Detection
  let eventType: QueryConstraints['eventType'] = 'any';
  if (/\b(test|exam|assessment|oa\b|quiz|coding\s+round|online\s+test|hackerrank|aptitude)\b/i.test(lower)) {
    eventType = 'test';
  } else if (/\b(interview|technical\s+round|hr\s+round|discussion)\b/i.test(lower)) {
    eventType = 'interview';
  } else if (/\b(ppt|pre[- ]placement\s+talk|presentation)\b/i.test(lower)) {
    eventType = 'ppt';
  } else if (/\b(deadline|registration|apply|submission|register|last\s+date)\b/i.test(lower)) {
    eventType = 'deadline';
  } else if (/\b(internship|summer\s+intern)\b/i.test(lower)) {
    eventType = 'internship';
  } else if (/\b(placement|campus\s+drive|recruitment)\b/i.test(lower)) {
    eventType = 'placement';
  }

  // 3. Date Range Detection
  const dateRange = parseQueryDateRange(query, nowDate);

  // 4. Entity Extraction
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
    // Patterns like: "do i have <ENTITY> test today", "when is my <ENTITY> interview", "is <ENTITY> assessment today"
    const patterns = [
      /(?:do\s+i\s+have|is\s+there\s+any|is\s+my|is\s+the|any)\s+([a-z0-9\s&.'-]+?)\s+(?:test|exam|assessment|oa|interview|ppt|deadline|round|session|drive|link)/i,
      /when\s+is\s+(?:my\s+|the\s+)?([a-z0-9\s&.'-]+?)\s+(?:test|exam|assessment|oa|interview|ppt|deadline|registration|round|drive)/i,
      /(?:details\s+of|schedule\s+for|info\s+on)\s+([a-z0-9\s&.'-]+?)\s+(?:test|exam|assessment|oa|interview|ppt|deadline)/i
    ];

    for (const pat of patterns) {
      const match = lower.match(pat);
      if (match && match[1]) {
        const candidate = match[1].trim();
        // Exclude common stop words
        const stopWords = ['a', 'an', 'the', 'my', 'any', 'scheduled', 'upcoming', 'new', 'due'];
        if (!stopWords.includes(candidate) && candidate.length >= 2) {
          entityQuery = normalizeEntityName(candidate);
          rawEntity = candidate;
          break;
        }
      }
    }
  }

  const isEntitySpecific = Boolean(entityQuery);

  return {
    originalQuery: query,
    entityQuery,
    rawEntity,
    eventType,
    dateRange: dateRange.isDateQuery ? dateRange : undefined,
    questionType,
    isEntitySpecific
  };
}

/**
 * Classifies the intent of a user query and determines the target Gmail search strategy.
 */
export function analyzeIntent(query: string, now: Date = new Date()): IntentResult {
  const constraints = parseQueryConstraints(query, now);
  const lower = query.trim().toLowerCase();

  // Helper to format YYYY/MM/DD for Gmail search queries
  const formatGmailDate = (d: Date) => {
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentFilter = `after:${formatGmailDate(thirtyDaysAgo)}`;

  // 1. Entity Specific Search (e.g. "idfc", "infoedge", "sigmoid")
  if (constraints.isEntitySpecific && constraints.rawEntity) {
    return {
      queryType: 'specific_search',
      keywords: [constraints.rawEntity, constraints.eventType || 'test'],
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

  // 6. Placements / Internships / Interviews
  if (
    lower.includes('placement') ||
    lower.includes('internship') ||
    lower.includes('job') ||
    lower.includes('interview') ||
    lower.includes('shortlist')
  ) {
    return {
      queryType: 'specific_search',
      keywords: ['placement', 'internship', 'interview', 'shortlist', 'hiring', 'drive'],
      gmailQuery: `subject:(placement OR internship OR interview OR shortlist OR hiring OR "job application" OR "campus drive" OR "selection process") ${recentFilter} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`,
      intentExplanation: 'Searching for placement, internship, and interview opportunities.'
    };
  }

  // 7. Generic search or topic-specific query
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
