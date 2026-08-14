import { IntentResult } from '../../types/ai';
import { GMAIL_SEARCH_CATEGORIES } from '../../shared/constants';

/**
 * Classifies the intent of a user query and determines the target Gmail search strategy.
 */
export function analyzeIntent(query: string, now: Date = new Date()): IntentResult {
  const lower = query.trim().toLowerCase();

  // Helper to format YYYY/MM/DD for Gmail search queries
  const formatGmailDate = (d: Date) => {
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  // Recent 7 days date string for broad queries
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentFilter = `after:${formatGmailDate(sevenDaysAgo)}`;

  // 1. Due Today / Briefing Today
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

  // 2. Due Tomorrow
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

  // 3. Upcoming Tests / Assessments / Coding rounds
  if (
    lower.includes('test') ||
    lower.includes('quiz') ||
    lower.includes('exam') ||
    lower.includes('assessment') ||
    lower.includes('coding round') ||
    lower.includes('hackerrank')
  ) {
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    return {
      queryType: 'upcoming_tests',
      keywords: ['test', 'exam', 'quiz', 'assessment', 'coding round', 'hackerrank', 'mettl'],
      gmailQuery: `subject:(exam OR test OR quiz OR assessment OR "coding round" OR "online test" OR hackerrank OR mettl OR wheebox OR unstop) after:${formatGmailDate(fourteenDaysAgo)} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`,
      intentExplanation: 'Searching for upcoming tests, quizzes, online assessments, and coding rounds.'
    };
  }

  // 4. Action Required / Registrations / Submissions / Deadlines
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

  // 5. Placements / Internships / Interviews
  if (
    lower.includes('placement') ||
    lower.includes('internship') ||
    lower.includes('job') ||
    lower.includes('interview') ||
    lower.includes('shortlist')
  ) {
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return {
      queryType: 'specific_search',
      keywords: ['placement', 'internship', 'interview', 'shortlist', 'hiring', 'drive'],
      gmailQuery: `subject:(placement OR internship OR interview OR shortlist OR hiring OR "job application" OR "campus drive" OR "selection process") after:${formatGmailDate(thirtyDaysAgo)} ${GMAIL_SEARCH_CATEGORIES.GENERAL_FILTER}`,
      intentExplanation: 'Searching for placement, internship, and interview opportunities.'
    };
  }

  // 6. Generic search or topic-specific query
  // Extract non-stop words for clean Gmail search
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
