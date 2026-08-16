import { EventStatus, ExtractedEvent, DateRangeQuery, ProcessStage } from '../../types/events';

export interface ParsedDateResult {
  date?: string; // YYYY-MM-DD (primary/representative event date)
  startDate?: string; // YYYY-MM-DD (Explicit start date if continuous window)
  endDate?: string; // YYYY-MM-DD (Explicit end date if continuous window)
  isContinuousRange?: boolean; // True ONLY if explicit continuous window
  isDeadline?: boolean; // True if it represents a point-in-time deadline
  allDates?: string[]; // Discrete dates in ISO YYYY-MM-DD
  time?: string; // e.g. "11:59 PM", "10:00 AM", "23:59 HRS"
  deadline?: string; // Point-in-time deadline string with time if available
  status: EventStatus;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];


/**
 * Formats a Date to YYYY-MM-DD string in local time.
 */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD string into a local Date object.
 */
export function parseISODate(dateStr: string): Date | null {
  try {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      return null;
    }
    return new Date(parts[0], parts[1] - 1, parts[2]);
  } catch {
    return null;
  }
}

/**
 * Determines EventStatus based on comparing the event's actual date/range/deadline with the user's reference date.
 */
export function calculateEventStatus(
  targetDateStr?: string,
  nowDate: Date = new Date(),
  endDateStr?: string,
  isContinuousRange?: boolean,
  allDates?: string[],
  stages?: ProcessStage[]
): EventStatus {
  const todayStr = toDateString(nowDate);
  const tomorrowDate = new Date(nowDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = toDateString(tomorrowDate);

  // 1. Check process stages
  if (stages && stages.length > 0) {
    if (stages.some(s => s.date === todayStr)) return 'today';
    if (stages.some(s => s.date === tomorrowStr)) return 'tomorrow';
  }

  // 2. Check discrete dates list
  if (allDates && allDates.length > 0) {
    if (allDates.includes(todayStr)) return 'today';
    if (allDates.includes(tomorrowStr)) return 'tomorrow';

    const futureDates = allDates.filter(d => d > tomorrowStr);
    if (futureDates.length > 0) return 'upcoming';

    const pastDates = allDates.filter(d => d < todayStr);
    if (pastDates.length === allDates.length) return 'past';
  }

  // 3. Check continuous active range (e.g. Aug 15 to Aug 19)
  if (isContinuousRange && targetDateStr && endDateStr) {
    if (todayStr >= targetDateStr && todayStr <= endDateStr) return 'today';
    if (tomorrowStr >= targetDateStr && tomorrowStr <= endDateStr) return 'tomorrow';
    if (targetDateStr > tomorrowStr) return 'upcoming';
    if (endDateStr < todayStr) return 'past';
  }

  // 4. Check single date / deadline (Point in time)
  if (targetDateStr) {
    if (targetDateStr === todayStr) return 'today';
    if (targetDateStr === tomorrowStr) return 'tomorrow';
    if (targetDateStr > tomorrowStr) return 'upcoming';
    if (targetDateStr < todayStr) return 'past';
  }

  return 'unknown';
}

/**
 * Extracts standard time strings (e.g. "11:59 PM", "10:00 AM", "23:59 HRS") from a local text snippet.
 */
export function extractTimeFromText(text: string): string | undefined {
  if (!text) return undefined;
  const timeRegex = /\b(?:at\s+|by\s+|before\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\d{1,2}:\d{2}(?:\s*(?:hrs|hours))?)\b/i;
  const match = text.match(timeRegex);
  if (match) {
    let t = match[1].trim().toUpperCase();
    if (/^\d{1,2}\s*(?:AM|PM)$/.test(t)) {
      const parts = t.match(/^(\d{1,2})\s*(AM|PM)$/);
      if (parts) t = `${parts[1]}:00 ${parts[2]}`;
    }
    return t;
  }
  return undefined;
}

// Helper to format ISO date
const toISO = (y: number, m: number, d: number) => {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const parseMonth = (mStr: string): number | undefined => {
  if (!mStr) return undefined;
  return MONTH_MAP[mStr.toLowerCase().substring(0, 3)];
};

interface DateCandidate {
  date: string;
  startDate?: string;
  endDate?: string;
  allDates?: string[];
  isContinuousRange?: boolean;
  isDeadline?: boolean;
  time?: string;
  score: number;
  sourceContext: string;
  isSubject: boolean;
}

/**
 * Strips quoted replies, forwarded headers, and disclaimers to get the primary email content.
 */
function cleanEmailBody(body: string): { primary: string; quoted: string } {
  if (!body) return { primary: '', quoted: '' };

  const splitPatterns = [
    /\n\s*On\s+.+?wrote:\s*\n/i,
    /\n\s*-----Original Message-----\s*\n/i,
    /\n\s*From:\s+.+?\nSent:\s+/i,
    /\n\s*_{10,}\s*\n/,
    /\n\s*This email and any files transmitted with it are confidential/i
  ];

  let minSplitIdx = body.length;
  for (const pat of splitPatterns) {
    const match = body.match(pat);
    if (match && match.index !== undefined && match.index < minSplitIdx) {
      minSplitIdx = match.index;
    }
  }

  const primary = body.substring(0, minSplitIdx);
  const quoted = body.substring(minSplitIdx);
  return { primary, quoted };
}

/**
 * Finds all date candidates in a section of text with context-aware semantic scoring.
 */
function extractCandidatesFromSection(
  text: string,
  isSubject: boolean,
  isQuoted: boolean,
  refYear: number
): DateCandidate[] {
  const candidates: DateCandidate[] = [];
  if (!text) return candidates;

  // 1. Explicit Deadline Phrases (+100 score)
  // e.g. "Registration Deadline - 20th Aug 2026", "Deadline: Aug 20, 2026", "Last date to apply is 20-Aug-2026"
  const deadlineRegexes = [
    /\b(?:registration\s+deadline|deadline\s*[-:]|last\s+date\s+(?:to\s+(?:register|apply)|for\s+(?:registration|submission))|registration\s+closes|apply\s+before|submit\s+by|closing\s+date|due\s+date)\s*(?:[-:]|\s+is|\s+on|\s+by|\s+is\s+on|\s+is\s+by)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?(?:\s+(?:at|by|before)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|hours)?))?\b/gi,
    /\b(?:registration\s+deadline|deadline\s*[-:]|last\s+date\s+(?:to\s+(?:register|apply)|for\s+(?:registration|submission))|registration\s+closes|apply\s+before|submit\s+by|closing\s+date|due\s+date)\s*(?:[-:]|\s+is|\s+on|\s+by|\s+is\s+on|\s+is\s+by)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?(?:\s+(?:at|by|before)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|hours)?))?\b/gi,
    /\b(?:registration\s+deadline|deadline\s*[-:]|last\s+date|apply\s+before|submit\s+by)\s*(?:[-:]|\s+is|\s+on|\s+by|\s+is\s+on|\s+is\s+by)?\s*(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{2,4})(?:\s+(?:at|by|before)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|hours)?))?\b/gi
  ];

  for (const regex of deadlineRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      let d: number, m: number | undefined, y: number, timeStr: string | undefined;

      if (isNaN(Number(match[1])) && match[2]) {
        // Month first
        m = parseMonth(match[1]);
        d = parseInt(match[2], 10);
        y = match[3] ? parseInt(match[3], 10) : refYear;
        timeStr = match[4];
      } else if (match[1] && match[2] && isNaN(Number(match[2]))) {
        // Day first
        d = parseInt(match[1], 10);
        m = parseMonth(match[2]);
        y = match[3] ? parseInt(match[3], 10) : refYear;
        timeStr = match[4];
      } else {
        // Formatted 20-Aug-2026
        d = parseInt(match[1], 10);
        m = isNaN(Number(match[2])) ? parseMonth(match[2]) : parseInt(match[2], 10) - 1;
        let yPart = parseInt(match[3], 10);
        if (yPart < 100) yPart += 2000;
        y = yPart;
        timeStr = match[4];
      }

      if (m !== undefined && d >= 1 && d <= 31) {
        const iso = toISO(y, m, d);
        // Extract local time ONLY within local context window
        const localContext = text.substring(Math.max(0, match.index - 50), Math.min(text.length, match.index + match[0].length + 50));
        const localTime = timeStr ? extractTimeFromText(timeStr) : extractTimeFromText(localContext);

        let score = 100;
        if (isSubject) score += 50; // Subject deadline gets highest priority (+150 total)
        if (isQuoted) score -= 60;

        candidates.push({
          date: iso,
          isDeadline: true,
          isContinuousRange: false,
          allDates: [iso],
          time: localTime,
          score,
          sourceContext: match[0],
          isSubject
        });
      }
    }
  }

  // 2. Continuous Date Range (e.g. "15-Aug-2026 to 19-Aug-2026", "from 15th August to 19th August 2026")
  const continuousRegexes = [
    /\b(?:from\s+)?(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{2,4})\s*(?:to|-|until|through)\s*(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{2,4})\b/gi,
    /\b(?:from\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(?:to|-|until|through)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/gi
  ];

  for (const regex of continuousRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      let sISO: string | null = null;
      let eISO: string | null = null;

      if (match.length >= 7 && match[6]) {
        // Formatted 15-Aug-2026 to 19-Aug-2026
        const d1 = parseInt(match[1], 10);
        const m1 = isNaN(Number(match[2])) ? parseMonth(match[2]) : parseInt(match[2], 10) - 1;
        let y1 = parseInt(match[3], 10);
        if (y1 < 100) y1 += 2000;

        const d2 = parseInt(match[4], 10);
        const m2 = isNaN(Number(match[5])) ? parseMonth(match[5]) : parseInt(match[5], 10) - 1;
        let y2 = parseInt(match[6], 10);
        if (y2 < 100) y2 += 2000;

        if (m1 !== undefined && m2 !== undefined && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
          sISO = toISO(y1, m1, d1);
          eISO = toISO(y2, m2, d2);
        }
      } else {
        // Worded 15th August to 19th August
        const d1 = parseInt(match[1], 10);
        const m1 = parseMonth(match[2]);
        const d2 = parseInt(match[3], 10);
        const m2 = parseMonth(match[4]);
        const y = match[5] ? parseInt(match[5], 10) : refYear;

        if (m1 !== undefined && m2 !== undefined && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
          sISO = toISO(y, m1, d1);
          eISO = toISO(y, m2, d2);
        }
      }

      if (sISO && eISO) {
        const localContext = text.substring(Math.max(0, match.index - 50), Math.min(text.length, match.index + match[0].length + 50));
        const localTime = extractTimeFromText(localContext);

        let score = 85;
        if (isSubject) score += 50;
        if (isQuoted) score -= 60;

        candidates.push({
          date: sISO,
          startDate: sISO,
          endDate: eISO,
          isContinuousRange: true,
          allDates: [sISO, eISO],
          time: localTime,
          score,
          sourceContext: match[0],
          isSubject
        });
      }
    }
  }

  // 3. Discrete Multi-Date Expression (e.g. "12th, 24th & 25th August 2026")
  const multiDayListRegex = /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*|\s+and\s+|\s*&\s*)(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*|\s+and\s+|\s*&\s*)?(\d{1,2})?(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/gi;
  let mMatch: RegExpExecArray | null;
  while ((mMatch = multiDayListRegex.exec(text)) !== null) {
    const d1 = parseInt(mMatch[1], 10);
    const d2 = parseInt(mMatch[2], 10);
    const d3 = mMatch[3] ? parseInt(mMatch[3], 10) : undefined;
    const m = parseMonth(mMatch[4]);
    const y = mMatch[5] ? parseInt(mMatch[5], 10) : refYear;

    if (m !== undefined) {
      const dates: string[] = [];
      if (d1 >= 1 && d1 <= 31) dates.push(toISO(y, m, d1));
      if (d2 >= 1 && d2 <= 31) dates.push(toISO(y, m, d2));
      if (d3 && d3 >= 1 && d3 <= 31) dates.push(toISO(y, m, d3));

      if (dates.length > 0) {
        dates.sort();
        const primaryDate = dates[dates.length - 1];
        const localContext = text.substring(Math.max(0, mMatch.index - 50), Math.min(text.length, mMatch.index + mMatch[0].length + 50));
        const localTime = extractTimeFromText(localContext);

        let score = 75;
        if (isSubject) score += 50;
        if (isQuoted) score -= 60;

        candidates.push({
          date: primaryDate,
          allDates: dates,
          isContinuousRange: false,
          time: localTime,
          score,
          sourceContext: mMatch[0],
          isSubject
        });
      }
    }
  }

  // 4. Standard Single Specific Dates (e.g. "21st August 2026", "Aug 21, 2026", "21-Aug-2026")
  const singleRegexes = [
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/gi,
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/gi,
    /\b(\d{1,2})[-/]([a-z]{3})[-/](\d{2,4})\b/gi
  ];

  for (const regex of singleRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      let d: number, m: number | undefined, y: number;

      if (isNaN(Number(match[1])) && match[2]) {
        m = parseMonth(match[1]);
        d = parseInt(match[2], 10);
        y = match[3] ? parseInt(match[3], 10) : refYear;
      } else if (match[1] && isNaN(Number(match[2]))) {
        d = parseInt(match[1], 10);
        m = parseMonth(match[2]);
        let yPart = match[3] ? parseInt(match[3], 10) : refYear;
        if (yPart < 100) yPart += 2000;
        y = yPart;
      } else {
        continue;
      }

      if (m !== undefined && d >= 1 && d <= 31) {
        const iso = toISO(y, m, d);
        const localContext = text.substring(Math.max(0, match.index - 60), Math.min(text.length, match.index + match[0].length + 60));
        const localTime = extractTimeFromText(localContext);

        // Contextual semantic scoring for single date
        let score = 50;
        const lowerCtx = localContext.toLowerCase();

        if (/\b(assessment|test|exam|interview|coding\s+round|slot)\b/i.test(lowerCtx)) {
          score += 25; // Scheduled test/assessment (+75)
        } else if (/\b(scheduled\s+on|held\s+on|taking\s+place\s+on)\b/i.test(lowerCtx)) {
          score += 15; // Scheduled event (+65)
        } else if (/\b(live\s+from|registration\s+open|opened\s+on|starts\s+on)\b/i.test(lowerCtx)) {
          score += 5; // Registration opening date (lower priority)
        }

        if (isSubject) score += 50;
        if (isQuoted) score -= 60;

        candidates.push({
          date: iso,
          allDates: [iso],
          isContinuousRange: false,
          time: localTime,
          score,
          sourceContext: match[0],
          isSubject
        });
      }
    }
  }

  return candidates;
}

/**
 * Context-aware, semantic date extractor for emails.
 */
export function parseDateFromEmailText(
  subjectOrCombinedText: string,
  bodyOrTimestamp?: string | number | Date,
  timestampOrNow?: number | Date,
  optionalNow?: Date
): ParsedDateResult {
  let subject = '';
  let body = '';
  let emailTimestamp: number = Date.now();
  let currentNow: Date = new Date();

  // Handle signature variations
  if (typeof bodyOrTimestamp === 'string') {
    subject = subjectOrCombinedText;
    body = bodyOrTimestamp;
    if (typeof timestampOrNow === 'number' || timestampOrNow instanceof Date) {
      emailTimestamp = new Date(timestampOrNow).getTime();
    }
    if (optionalNow instanceof Date) {
      currentNow = optionalNow;
    }
  } else {
    // Single text passed in (e.g. combined text)
    const split = subjectOrCombinedText.split('\n\n');
    subject = split[0] || '';
    body = split.slice(1).join('\n\n');
    if (typeof bodyOrTimestamp === 'number' || bodyOrTimestamp instanceof Date) {
      emailTimestamp = new Date(bodyOrTimestamp).getTime();
    }
    if (timestampOrNow instanceof Date) {
      currentNow = timestampOrNow;
    }
  }

  const refDate = new Date(emailTimestamp);
  const refYear = refDate.getFullYear() || currentNow.getFullYear();

  const { primary: primaryBody, quoted: quotedBody } = cleanEmailBody(body);

  // Extract candidate dates from Subject, Primary Body, and Quoted Body
  const subjectCandidates = extractCandidatesFromSection(subject, true, false, refYear);
  const bodyCandidates = extractCandidatesFromSection(primaryBody, false, false, refYear);
  const quotedCandidates = extractCandidatesFromSection(quotedBody, false, true, refYear);

  const allCandidates = [...subjectCandidates, ...bodyCandidates, ...quotedCandidates];

  if (allCandidates.length === 0) {
    // Fallback relative checks
    const lower = `${subject} ${primaryBody}`.toLowerCase();
    if (/\b(today|tonight)\b/i.test(lower)) {
      const t = toDateString(refDate);
      return {
        date: t,
        allDates: [t],
        deadline: t,
        status: calculateEventStatus(t, currentNow)
      };
    }
    if (/\b(tomorrow)\b/i.test(lower)) {
      const d = new Date(refDate);
      d.setDate(d.getDate() + 1);
      const tom = toDateString(d);
      return {
        date: tom,
        allDates: [tom],
        deadline: tom,
        status: calculateEventStatus(tom, currentNow)
      };
    }
    return { status: 'unknown' };
  }

  // Sort candidates by score descending
  allCandidates.sort((a, b) => b.score - a.score);

  const winner = allCandidates[0];

  // If winner is a continuous window
  if (winner.isContinuousRange && winner.startDate && winner.endDate) {
    return {
      startDate: winner.startDate,
      endDate: winner.endDate,
      date: winner.startDate,
      isContinuousRange: true,
      allDates: [winner.startDate, winner.endDate],
      time: winner.time,
      deadline: winner.time ? `${winner.endDate} at ${winner.time}` : winner.endDate,
      status: calculateEventStatus(winner.startDate, currentNow, winner.endDate, true)
    };
  }

  // If winner is an explicit deadline
  if (winner.isDeadline) {
    return {
      date: winner.date,
      deadline: winner.time ? `${winner.date} at ${winner.time}` : winner.date,
      isDeadline: true,
      isContinuousRange: false,
      allDates: [winner.date],
      time: winner.time,
      status: calculateEventStatus(winner.date, currentNow)
    };
  }

  // If winner has discrete dates list
  if (winner.allDates && winner.allDates.length > 1) {
    return {
      date: winner.date,
      allDates: winner.allDates,
      isContinuousRange: false,
      time: winner.time,
      deadline: winner.time ? `${winner.date} at ${winner.time}` : winner.date,
      status: calculateEventStatus(winner.date, currentNow, undefined, false, winner.allDates)
    };
  }

  // Standard single scheduled date
  return {
    date: winner.date,
    allDates: [winner.date],
    isContinuousRange: false,
    time: winner.time,
    deadline: winner.time ? `${winner.date} at ${winner.time}` : winner.date,
    status: calculateEventStatus(winner.date, currentNow)
  };
}

/**
 * Parses user natural language query to determine target date range.
 */
export function parseQueryDateRange(query: string, referenceDate: Date = new Date()): DateRangeQuery {
  const text = query.trim();
  const lower = text.toLowerCase();
  const refYear = referenceDate.getFullYear();

  const todayStr = toDateString(referenceDate);
  const tomorrowDate = new Date(referenceDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = toDateString(tomorrowDate);

  // 1. "today and tomorrow", "today & tomorrow", "today, tomorrow", "today or tomorrow"
  const isTodayAndTomorrow = /\b(today\s*(?:and|&|\+|or|,|\/)\s*tomorrow|today's\s*(?:and|&)\s*tomorrow's|today\s+and\s+tomorrow|both\s+today\s+and\s+tomorrow)\b/i.test(lower);
  if (isTodayAndTomorrow) {
    const mStart = MONTH_NAMES[referenceDate.getMonth()];
    const dStart = referenceDate.getDate();
    const mEnd = MONTH_NAMES[tomorrowDate.getMonth()];
    const dEnd = tomorrowDate.getDate();
    const label = mStart === mEnd ? `${mStart} ${dStart}–${dEnd}, ${referenceDate.getFullYear()}` : `${mStart} ${dStart} – ${mEnd} ${dEnd}, ${referenceDate.getFullYear()}`;

    return {
      isDateQuery: true,
      startDate: todayStr,
      endDate: tomorrowStr,
      label,
      isTodayAndTomorrow: true
    };
  }

  // 2. Explicit range: "from 15th august to 20th august" or "between 15 aug and 20 aug" or "15 to 20 august"
  const rangePattern1 = /\b(?:from|between)?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(?:to|and|-|until)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const m1 = text.match(rangePattern1);
  if (m1) {
    const dStart = parseInt(m1[1], 10);
    const mStartStr = m1[2] || m1[4];
    const dEnd = parseInt(m1[3], 10);
    const mEndStr = m1[4];
    const y = m1[5] ? parseInt(m1[5], 10) : refYear;

    const mStart = parseMonth(mStartStr);
    const mEnd = parseMonth(mEndStr);

    if (mStart !== undefined && mEnd !== undefined && dStart >= 1 && dStart <= 31 && dEnd >= 1 && dEnd <= 31) {
      const sDate = new Date(y, mStart, dStart);
      const eDate = new Date(y, mEnd, dEnd);
      return {
        isDateQuery: true,
        startDate: toDateString(sDate),
        endDate: toDateString(eDate),
        label: `${MONTH_NAMES[mStart]} ${dStart}–${mStart !== mEnd ? MONTH_NAMES[mEnd] + ' ' : ''}${dEnd}, ${y}`
      };
    }
  }

  // 3. "from 15-Aug-2026 to 20-Aug-2026"
  const rangePattern2 = /\b(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{2,4})\s*(?:to|-|and|until)\s*(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{2,4})\b/i;
  const m2 = text.match(rangePattern2);
  if (m2) {
    const parseD = (dStr: string, mStr: string, yStr: string) => {
      let y = parseInt(yStr, 10);
      if (y < 100) y += 2000;
      let m = isNaN(Number(mStr)) ? parseMonth(mStr) : parseInt(mStr, 10) - 1;
      const d = parseInt(dStr, 10);
      return m !== undefined && d >= 1 && d <= 31 ? new Date(y, m, d) : null;
    };
    const sDate = parseD(m2[1], m2[2], m2[3]);
    const eDate = parseD(m2[4], m2[5], m2[6]);
    if (sDate && eDate) {
      return {
        isDateQuery: true,
        startDate: toDateString(sDate),
        endDate: toDateString(eDate),
        label: `${sDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${eDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      };
    }
  }

  // 4. Single specific date query e.g. "on 17th august"
  const singleDatePattern = /\b(?:on\s+|for\s+|dated\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const mSingle = text.match(singleDatePattern);
  if (mSingle && !lower.includes('today') && !lower.includes('tomorrow')) {
    const d = parseInt(mSingle[1], 10);
    const m = parseMonth(mSingle[2]);
    const y = mSingle[3] ? parseInt(mSingle[3], 10) : refYear;
    if (m !== undefined && d >= 1 && d <= 31) {
      const target = new Date(y, m, d);
      const iso = toDateString(target);
      return {
        isDateQuery: true,
        startDate: iso,
        endDate: iso,
        label: `${MONTH_NAMES[m]} ${d}, ${y}`,
        isSingleDay: true
      };
    }
  }

  // 5. "today" (exclusive)
  if (/\b(today|due today|what do i have today|today's schedule)\b/i.test(lower) && !lower.includes('tomorrow')) {
    return {
      isDateQuery: true,
      startDate: todayStr,
      endDate: todayStr,
      label: 'Today',
      isSingleDay: true
    };
  }

  // 6. "tomorrow" (exclusive)
  if (/\b(tomorrow|due tomorrow|what do i have tomorrow|tomorrow's schedule)\b/i.test(lower) && !lower.includes('today')) {
    return {
      isDateQuery: true,
      startDate: tomorrowStr,
      endDate: tomorrowStr,
      label: 'Tomorrow',
      isSingleDay: true
    };
  }

  // 7. "this week" (next 7 days)
  if (/\b(this week|upcoming week)\b/i.test(lower)) {
    const eDate = new Date(referenceDate);
    eDate.setDate(eDate.getDate() + 7);
    return {
      isDateQuery: true,
      startDate: todayStr,
      endDate: toDateString(eDate),
      label: 'This Week'
    };
  }

  return { isDateQuery: false };
}

/**
 * Deterministically checks if an event's actual date / continuous window / deadline overlaps query date range.
 */
export function isEventInRange(event: ExtractedEvent, queryStart: string, queryEnd: string): boolean {
  // 1. Process stages (e.g. PPT on Aug 14, Assessment on Aug 16)
  if (event.stages && event.stages.length > 0) {
    if (event.stages.some(s => s.date && s.date >= queryStart && s.date <= queryEnd)) {
      return true;
    }
  }

  // 2. Continuous active range (e.g. Aug 15 to Aug 19)
  if (event.isContinuousRange && event.startDate && event.endDate) {
    return event.startDate <= queryEnd && event.endDate >= queryStart;
  }

  // 3. Discrete dates list (e.g. 12th, 24th, 25th August)
  if (event.allDates && event.allDates.length > 0) {
    return event.allDates.some(d => d >= queryStart && d <= queryEnd);
  }

  // 4. Single point-in-time date or deadline
  const singleDate = event.date || event.deadline;
  if (singleDate) {
    const dOnly = singleDate.split(' ')[0]; // Strip time if present
    return dOnly >= queryStart && dOnly <= queryEnd;
  }

  return false;
}
