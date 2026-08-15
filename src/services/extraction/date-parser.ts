import { EventStatus, ExtractedEvent, DateRangeQuery } from '../../types/events';

export interface ParsedDateResult {
  date?: string; // YYYY-MM-DD (primary/start date)
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  allDates?: string[]; // All unique extracted dates in ISO YYYY-MM-DD
  time?: string; // e.g. "11:59 PM", "10:00 AM"
  deadline?: string; // Normalized string description
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

const DAY_OF_WEEK_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};

/**
 * Formats a Date to YYYY-MM-DD string.
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
 * Determines EventStatus based on comparing the event's date range with the user's current date (now).
 */
export function calculateEventStatus(
  targetDateStr?: string,
  nowDate: Date = new Date(),
  endDateStr?: string
): EventStatus {
  if (!targetDateStr) return 'unknown';

  try {
    const startDate = parseISODate(targetDateStr);
    if (!startDate) return 'unknown';

    const endDate = endDateStr ? parseISODate(endDateStr) || startDate : startDate;

    const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sTime = startDate.getTime();
    const eTime = endDate.getTime();
    const todayTime = today.getTime();
    const tomorrowTime = tomorrow.getTime();

    // If today falls within the active window [sTime, eTime]
    if (todayTime >= sTime && todayTime <= eTime) return 'today';
    if (tomorrowTime >= sTime && tomorrowTime <= eTime) return 'tomorrow';
    if (sTime > tomorrowTime) return 'upcoming';
    if (eTime < todayTime) return 'past';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Extracts standard time strings (e.g. "11:59 PM", "10:00 AM", "17:30") from text.
 */
export function extractTimeFromText(text: string): string | undefined {
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

/**
 * Extracts all mentioned event dates, start/end windows, and deadlines from email content,
 * using the email's sent/received timestamp as the relative base reference.
 */
export function parseDateFromEmailText(
  text: string,
  emailTimestamp: number | Date = Date.now(),
  currentNow: Date = new Date()
): ParsedDateResult {
  const refDate = new Date(emailTimestamp);
  const time = extractTimeFromText(text);
  const lower = text.toLowerCase();
  const foundDates: string[] = [];

  // Helper to safely add an ISO date string
  const addDate = (d: Date) => {
    const s = toDateString(d);
    if (!foundDates.includes(s)) foundDates.push(s);
    return s;
  };

  // Helper to resolve month name
  const parseMonth = (mStr: string): number | undefined => {
    return MONTH_MAP[mStr.toLowerCase().substring(0, 3)];
  };

  // 1. Pattern: Multi-date list e.g. "12th, 24th & 25th August 2026" or "12th, 24th and 25th August"
  const multiDayListRegex = /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*|\s+and\s+|\s*&\s*)(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*|\s+and\s+|\s*&\s*)?(\d{1,2})?(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const multiListMatch = text.match(multiDayListRegex);
  if (multiListMatch) {
    const d1 = parseInt(multiListMatch[1], 10);
    const d2 = parseInt(multiListMatch[2], 10);
    const d3 = multiListMatch[3] ? parseInt(multiListMatch[3], 10) : undefined;
    const m = parseMonth(multiListMatch[4]);
    const y = multiListMatch[5] ? parseInt(multiListMatch[5], 10) : refDate.getFullYear();

    if (m !== undefined) {
      if (d1 >= 1 && d1 <= 31) addDate(new Date(y, m, d1));
      if (d2 >= 1 && d2 <= 31) addDate(new Date(y, m, d2));
      if (d3 && d3 >= 1 && d3 <= 31) addDate(new Date(y, m, d3));
    }
  }

  // 2. Pattern: Date Range e.g. "15 to 19 August", "from 15th August to 19th August 2026", "15th-19th August"
  const dateRangeRegex = /\b(?:from\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|-|until|through)\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const rangeMatch = text.match(dateRangeRegex);
  if (rangeMatch) {
    const dStart = parseInt(rangeMatch[1], 10);
    const dEnd = parseInt(rangeMatch[2], 10);
    const m = parseMonth(rangeMatch[3]);
    const y = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : refDate.getFullYear();

    if (m !== undefined && dStart >= 1 && dStart <= 31 && dEnd >= 1 && dEnd <= 31) {
      addDate(new Date(y, m, dStart));
      addDate(new Date(y, m, dEnd));
    }
  }

  // 3. Pattern: "15-Aug-2026 to 19-Aug-2026" or "15/08/2026 to 19/08/2026"
  const formattedRangeRegex = /\b(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{2,4})\s*(?:to|-|until)\s*(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{2,4})\b/i;
  const fRangeMatch = text.match(formattedRangeRegex);
  if (fRangeMatch) {
    const parsePart = (dayStr: string, monStr: string, yrStr: string) => {
      let y = parseInt(yrStr, 10);
      if (y < 100) y += 2000;
      let m = isNaN(Number(monStr)) ? parseMonth(monStr) : parseInt(monStr, 10) - 1;
      const d = parseInt(dayStr, 10);
      if (m !== undefined && d >= 1 && d <= 31) {
        return new Date(y, m, d);
      }
      return null;
    };
    const sDate = parsePart(fRangeMatch[1], fRangeMatch[2], fRangeMatch[3]);
    const eDate = parsePart(fRangeMatch[4], fRangeMatch[5], fRangeMatch[6]);
    if (sDate) addDate(sDate);
    if (eDate) addDate(eDate);
  }

  // 4. Pattern: Standard Single Date e.g. "15th August 2026", "August 15, 2026", "15 Aug"
  const singleDateRegex1 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = singleDateRegex1.exec(text)) !== null) {
    const day = parseInt(match[1], 10);
    const m = parseMonth(match[2]);
    const y = match[3] ? parseInt(match[3], 10) : refDate.getFullYear();
    if (m !== undefined && day >= 1 && day <= 31) {
      addDate(new Date(y, m, day));
    }
  }

  // Pattern: "August 15th, 2026" or "Aug 15"
  const singleDateRegex2 = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/gi;
  while ((match = singleDateRegex2.exec(text)) !== null) {
    const m = parseMonth(match[1]);
    const day = parseInt(match[2], 10);
    const y = match[3] ? parseInt(match[3], 10) : refDate.getFullYear();
    if (m !== undefined && day >= 1 && day <= 31) {
      addDate(new Date(y, m, day));
    }
  }

  // 5. Pattern: "15-Aug-2026" or "15-08-2026" or "2026-08-15"
  const isoRegex = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((match = isoRegex.exec(text)) !== null) {
    addDate(new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10)));
  }

  const slashRegex = /\b(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{4})\b/gi;
  while ((match = slashRegex.exec(text)) !== null) {
    let day = parseInt(match[1], 10);
    const monPart = match[2];
    const year = parseInt(match[3], 10);
    let m = isNaN(Number(monPart)) ? parseMonth(monPart) : parseInt(monPart, 10) - 1;
    if (m !== undefined && day >= 1 && day <= 31) {
      addDate(new Date(year, m, day));
    }
  }

  // 6. Pattern: "interview on 17th" or "test on 24th"
  const dayOfMonthOnlyRegex = /\b(?:on\s+|by\s+|dated\s+)(\d{1,2})(?:st|nd|rd|th)\b/gi;
  while ((match = dayOfMonthOnlyRegex.exec(text)) !== null) {
    const day = parseInt(match[1], 10);
    if (day >= 1 && day <= 31) {
      // Resolve using the email's received month & year
      addDate(new Date(refDate.getFullYear(), refDate.getMonth(), day));
    }
  }

  // 7. Relative Dates: "today", "tomorrow", "day after tomorrow", "next Monday"
  if (foundDates.length === 0) {
    if (/\b(today|tonight)\b/i.test(lower)) {
      addDate(new Date(refDate));
    } else if (/\b(tomorrow)\b/i.test(lower)) {
      const d = new Date(refDate);
      d.setDate(d.getDate() + 1);
      addDate(d);
    } else if (/\bday after tomorrow\b/i.test(lower)) {
      const d = new Date(refDate);
      d.setDate(d.getDate() + 2);
      addDate(d);
    } else {
      const weekdayRegex = /\b(?:this\s+|next\s+|on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
      const wm = lower.match(weekdayRegex);
      if (wm) {
        const targetDayIndex = DAY_OF_WEEK_MAP[wm[1]];
        if (targetDayIndex !== undefined) {
          const resolvedDate = new Date(refDate);
          let diff = targetDayIndex - refDate.getDay();
          if (diff <= 0) diff += 7;
          resolvedDate.setDate(resolvedDate.getDate() + diff);
          addDate(resolvedDate);
        }
      }
    }
  }

  // Sort collected dates chronologically
  foundDates.sort();

  if (foundDates.length > 0) {
    const startDate = foundDates[0];
    const endDate = foundDates[foundDates.length - 1];
    const primaryDate = startDate;
    const deadline = time ? `${primaryDate} at ${time}` : primaryDate;

    return {
      date: primaryDate,
      startDate,
      endDate: endDate !== startDate ? endDate : undefined,
      allDates: foundDates,
      time,
      deadline,
      status: calculateEventStatus(startDate, currentNow, endDate)
    };
  }

  return {
    time,
    status: 'unknown'
  };
}

/**
 * Parses a user natural language query to determine if it is asking for a specific date or date range.
 * Examples:
 * - "tell me what all do i have from 15th august to 20th august?" -> { isDateQuery: true, startDate: '2026-08-15', endDate: '2026-08-20', label: 'Aug 15–20, 2026' }
 * - "what do i have between 15 aug and 20 aug?"
 * - "what is scheduled on 17th august?" -> { isDateQuery: true, startDate: '2026-08-17', endDate: '2026-08-17', isSingleDay: true }
 * - "what do i have today / tomorrow?"
 */
export function parseQueryDateRange(query: string, referenceDate: Date = new Date()): DateRangeQuery {
  const text = query.trim();
  const lower = text.toLowerCase();
  const refYear = referenceDate.getFullYear();

  const parseMonth = (mStr: string): number | undefined => {
    return MONTH_MAP[mStr.toLowerCase().substring(0, 3)];
  };

  // 1. "from 15th august to 20th august" or "between 15 aug and 20 aug" or "15 to 20 august" or "15th-20th august"
  const rangePattern1 = /\b(?:from|between)?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)?\s*(?:to|and|-|until)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
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

  // 2. "from 15-Aug-2026 to 20-Aug-2026" or "15/08/2026 - 20/08/2026"
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

  // 3. Single specific date query e.g. "on 17th august" or "17th august" or "august 17"
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

  // 4. "today"
  if (/\b(today|due today|what do i have today)\b/i.test(lower)) {
    const todayStr = toDateString(referenceDate);
    return {
      isDateQuery: true,
      startDate: todayStr,
      endDate: todayStr,
      label: 'Today',
      isSingleDay: true
    };
  }

  // 5. "tomorrow"
  if (/\b(tomorrow|due tomorrow|what do i have tomorrow)\b/i.test(lower)) {
    const tom = new Date(referenceDate);
    tom.setDate(tom.getDate() + 1);
    const tomStr = toDateString(tom);
    return {
      isDateQuery: true,
      startDate: tomStr,
      endDate: tomStr,
      label: 'Tomorrow',
      isSingleDay: true
    };
  }

  // 6. "this week" (next 7 days)
  if (/\b(this week|upcoming week)\b/i.test(lower)) {
    const sDate = new Date(referenceDate);
    const eDate = new Date(referenceDate);
    eDate.setDate(eDate.getDate() + 7);
    return {
      isDateQuery: true,
      startDate: toDateString(sDate),
      endDate: toDateString(eDate),
      label: 'This Week'
    };
  }

  return { isDateQuery: false };
}

/**
 * Deterministically checks if an event's active window overlaps with a query date range.
 * 
 * Mathematical Overlap Condition:
 * eventStart <= queryEnd AND eventEnd >= queryStart
 * 
 * Or if any specific date in event.allDates falls within [queryStart, queryEnd].
 */
export function isEventInRange(event: ExtractedEvent, queryStart: string, queryEnd: string): boolean {
  const eventStart = event.startDate || event.date;
  if (!eventStart) return false;

  const eventEnd = event.endDate || event.startDate || event.date || eventStart;

  // 1. Check all specific dates if extracted
  if (event.allDates && event.allDates.length > 0) {
    const hasMatch = event.allDates.some(d => d >= queryStart && d <= queryEnd);
    if (hasMatch) return true;
  }

  // 2. Standard interval overlap
  return eventStart <= queryEnd && eventEnd >= queryStart;
}
