import { EventStatus, ExtractedEvent, DateRangeQuery } from '../../types/events';

export interface ParsedDateResult {
  date?: string; // YYYY-MM-DD (primary/representative event date)
  startDate?: string; // YYYY-MM-DD (Explicit start date if continuous window)
  endDate?: string; // YYYY-MM-DD (Explicit end date if continuous window)
  isContinuousRange?: boolean; // True ONLY if explicit continuous window
  isDeadline?: boolean; // True if it represents a point-in-time deadline
  allDates?: string[]; // Discrete dates in ISO YYYY-MM-DD
  time?: string; // e.g. "11:59 PM", "10:00 AM"
  deadline?: string; // Point-in-time deadline string
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
 * 
 * CRITICAL RULE: An event is ONLY 'today' if:
 * 1. Its single date or deadline is TODAY, OR
 * 2. It has an explicit continuous window that encompasses TODAY, OR
 * 3. Its discrete dates array includes TODAY.
 */
export function calculateEventStatus(
  targetDateStr?: string,
  nowDate: Date = new Date(),
  endDateStr?: string,
  isContinuousRange?: boolean,
  allDates?: string[]
): EventStatus {
  const todayStr = toDateString(nowDate);
  const tomorrowDate = new Date(nowDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = toDateString(tomorrowDate);

  // 1. Check discrete dates list
  if (allDates && allDates.length > 0) {
    if (allDates.includes(todayStr)) return 'today';
    if (allDates.includes(tomorrowStr)) return 'tomorrow';

    const futureDates = allDates.filter(d => d > tomorrowStr);
    if (futureDates.length > 0) return 'upcoming';

    const pastDates = allDates.filter(d => d < todayStr);
    if (pastDates.length === allDates.length) return 'past';
  }

  // 2. Check continuous active range (e.g. Aug 15 to Aug 19)
  if (isContinuousRange && targetDateStr && endDateStr) {
    if (todayStr >= targetDateStr && todayStr <= endDateStr) return 'today';
    if (tomorrowStr >= targetDateStr && tomorrowStr <= endDateStr) return 'tomorrow';
    if (targetDateStr > tomorrowStr) return 'upcoming';
    if (endDateStr < todayStr) return 'past';
  }

  // 3. Check single date / deadline (Point in time)
  if (targetDateStr) {
    if (targetDateStr === todayStr) return 'today';
    if (targetDateStr === tomorrowStr) return 'tomorrow';
    if (targetDateStr > tomorrowStr) return 'upcoming';
    if (targetDateStr < todayStr) return 'past';
  }

  return 'unknown';
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
 * Extracts actual event dates from email content.
 * 
 * IMPORTANT RULES:
 * 1. NEVER use email sent/received date as an event start/end date.
 * 2. Point-in-time deadlines (e.g. "Registration Deadline - 20th Aug 2026") are marked isDeadline: true and do NOT create an interval.
 * 3. Discrete multi-date expressions (e.g. "12th, 24th & 25th August 2026") store all individual dates in allDates.
 * 4. Continuous windows (e.g. "15-Aug-2026 to 19-Aug-2026" or "from 15th August to 19th August") are marked isContinuousRange: true.
 */
export function parseDateFromEmailText(
  text: string,
  emailTimestamp: number | Date = Date.now(),
  currentNow: Date = new Date()
): ParsedDateResult {
  const refDate = new Date(emailTimestamp);
  const time = extractTimeFromText(text);
  const lower = text.toLowerCase();

  const parseMonth = (mStr: string): number | undefined => {
    return MONTH_MAP[mStr.toLowerCase().substring(0, 3)];
  };

  // Helper to format ISO date
  const toISO = (y: number, m: number, d: number) => {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  // --- A. Explicit Continuous Date Range (e.g. "15-Aug-2026 to 19-Aug-2026", "from 15th August to 19th August 2026") ---
  const formattedRangeRegex = /\b(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{2,4})\s*(?:to|-|until|through)\s*(\d{1,2})[-/]([a-z]{3}|\d{1,2})[-/](\d{2,4})\b/i;
  const fRangeMatch = text.match(formattedRangeRegex);
  if (fRangeMatch) {
    const parsePart = (dayStr: string, monStr: string, yrStr: string) => {
      let y = parseInt(yrStr, 10);
      if (y < 100) y += 2000;
      let m = isNaN(Number(monStr)) ? parseMonth(monStr) : parseInt(monStr, 10) - 1;
      const d = parseInt(dayStr, 10);
      if (m !== undefined && d >= 1 && d <= 31) return { y, m, d };
      return null;
    };
    const s = parsePart(fRangeMatch[1], fRangeMatch[2], fRangeMatch[3]);
    const e = parsePart(fRangeMatch[4], fRangeMatch[5], fRangeMatch[6]);
    if (s && e) {
      const sISO = toISO(s.y, s.m, s.d);
      const eISO = toISO(e.y, e.m, e.d);
      return {
        startDate: sISO,
        endDate: eISO,
        date: sISO,
        time,
        isContinuousRange: true,
        allDates: [sISO, eISO],
        deadline: time ? `${eISO} at ${time}` : eISO,
        status: calculateEventStatus(sISO, currentNow, eISO, true)
      };
    }
  }

  const wordedRangeRegex = /\b(?:from\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)?\s*(?:to|-|until|through)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const wRangeMatch = text.match(wordedRangeRegex);
  if (wRangeMatch && !text.includes('&') && !text.includes(',')) {
    const dStart = parseInt(wRangeMatch[1], 10);
    const mStartStr = wRangeMatch[2] || wRangeMatch[4];
    const dEnd = parseInt(wRangeMatch[3], 10);
    const mEndStr = wRangeMatch[4];
    const y = wRangeMatch[5] ? parseInt(wRangeMatch[5], 10) : refDate.getFullYear();

    const mStart = parseMonth(mStartStr);
    const mEnd = parseMonth(mEndStr);

    if (mStart !== undefined && mEnd !== undefined && dStart >= 1 && dStart <= 31 && dEnd >= 1 && dEnd <= 31) {
      const sISO = toISO(y, mStart, dStart);
      const eISO = toISO(y, mEnd, dEnd);
      return {
        startDate: sISO,
        endDate: eISO,
        date: sISO,
        time,
        isContinuousRange: true,
        allDates: [sISO, eISO],
        deadline: time ? `${eISO} at ${time}` : eISO,
        status: calculateEventStatus(sISO, currentNow, eISO, true)
      };
    }
  }

  // --- B. Discrete Multi-Date List (e.g. "12th, 24th & 25th August 2026") ---
  const multiDayListRegex = /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*|\s+and\s+|\s*&\s*)(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*|\s+and\s+|\s*&\s*)?(\d{1,2})?(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const multiListMatch = text.match(multiDayListRegex);
  if (multiListMatch) {
    const d1 = parseInt(multiListMatch[1], 10);
    const d2 = parseInt(multiListMatch[2], 10);
    const d3 = multiListMatch[3] ? parseInt(multiListMatch[3], 10) : undefined;
    const m = parseMonth(multiListMatch[4]);
    const y = multiListMatch[5] ? parseInt(multiListMatch[5], 10) : refDate.getFullYear();

    if (m !== undefined) {
      const dates: string[] = [];
      if (d1 >= 1 && d1 <= 31) dates.push(toISO(y, m, d1));
      if (d2 >= 1 && d2 <= 31) dates.push(toISO(y, m, d2));
      if (d3 && d3 >= 1 && d3 <= 31) dates.push(toISO(y, m, d3));

      if (dates.length > 0) {
        dates.sort();
        // The primary event date is the latest / upcoming one
        const primaryDate = dates[dates.length - 1];
        return {
          date: primaryDate,
          allDates: dates,
          isContinuousRange: false, // NOT continuous!
          time,
          deadline: time ? `${primaryDate} at ${time}` : primaryDate,
          status: calculateEventStatus(primaryDate, currentNow, undefined, false, dates)
        };
      }
    }
  }

  // --- C. Point-in-Time Deadlines (e.g. "Registration Deadline - 20th Aug 2026", "Deadline: Aug 20, 2026") ---
  const deadlineRegex = /\b(?:deadline|last\s+date|submit\s+by|register\s+before|due\s+date|registration\s+closes|closes\s+on)\s*(?:-|:|\s+is|\s+on|\s+by)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const deadlineMatch = text.match(deadlineRegex);
  if (deadlineMatch) {
    const d = parseInt(deadlineMatch[1], 10);
    const m = parseMonth(deadlineMatch[2]);
    const y = deadlineMatch[3] ? parseInt(deadlineMatch[3], 10) : refDate.getFullYear();
    if (m !== undefined && d >= 1 && d <= 31) {
      const dlISO = toISO(y, m, d);
      return {
        date: dlISO,
        deadline: time ? `${dlISO} at ${time}` : dlISO,
        isDeadline: true,
        isContinuousRange: false,
        allDates: [dlISO],
        time,
        status: calculateEventStatus(dlISO, currentNow)
      };
    }
  }

  // --- D. Standard Single Specific Date (e.g. "15th August 2026", "August 15, 2026") ---
  const singleDateRegex1 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const sMatch1 = text.match(singleDateRegex1);
  if (sMatch1) {
    const day = parseInt(sMatch1[1], 10);
    const m = parseMonth(sMatch1[2]);
    const y = sMatch1[3] ? parseInt(sMatch1[3], 10) : refDate.getFullYear();
    if (m !== undefined && day >= 1 && day <= 31) {
      const singleISO = toISO(y, m, day);
      return {
        date: singleISO,
        time,
        allDates: [singleISO],
        deadline: time ? `${singleISO} at ${time}` : singleISO,
        status: calculateEventStatus(singleISO, currentNow)
      };
    }
  }

  const singleDateRegex2 = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i;
  const sMatch2 = text.match(singleDateRegex2);
  if (sMatch2) {
    const m = parseMonth(sMatch2[1]);
    const day = parseInt(sMatch2[2], 10);
    const y = sMatch2[3] ? parseInt(sMatch2[3], 10) : refDate.getFullYear();
    if (m !== undefined && day >= 1 && day <= 31) {
      const singleISO = toISO(y, m, day);
      return {
        date: singleISO,
        time,
        allDates: [singleISO],
        deadline: time ? `${singleISO} at ${time}` : singleISO,
        status: calculateEventStatus(singleISO, currentNow)
      };
    }
  }

  // --- E. Standard Formatted Date (e.g. "15-Aug-2026" or "2026-08-15") ---
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const isoDateStr = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    return {
      date: isoDateStr,
      time,
      allDates: [isoDateStr],
      deadline: time ? `${isoDateStr} at ${time}` : isoDateStr,
      status: calculateEventStatus(isoDateStr, currentNow)
    };
  }

  // --- F. Relative Dates in Email Body (e.g. "today", "tomorrow", "next Monday") ---
  if (/\b(today|tonight)\b/i.test(lower)) {
    const todayStr = toDateString(refDate);
    return {
      date: todayStr,
      time,
      allDates: [todayStr],
      deadline: time ? `${todayStr} at ${time}` : todayStr,
      status: calculateEventStatus(todayStr, currentNow)
    };
  }

  if (/\b(tomorrow)\b/i.test(lower)) {
    const d = new Date(refDate);
    d.setDate(d.getDate() + 1);
    const tomStr = toDateString(d);
    return {
      date: tomStr,
      time,
      allDates: [tomStr],
      deadline: time ? `${tomStr} at ${time}` : tomStr,
      status: calculateEventStatus(tomStr, currentNow)
    };
  }

  if (/\bday after tomorrow\b/i.test(lower)) {
    const d = new Date(refDate);
    d.setDate(d.getDate() + 2);
    const datStr = toDateString(d);
    return {
      date: datStr,
      time,
      allDates: [datStr],
      deadline: time ? `${datStr} at ${time}` : datStr,
      status: calculateEventStatus(datStr, currentNow)
    };
  }

  const weekdayRegex = /\b(?:this\s+|next\s+|on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const wm = lower.match(weekdayRegex);
  if (wm) {
    const targetDayIndex = DAY_OF_WEEK_MAP[wm[1]];
    if (targetDayIndex !== undefined) {
      const resolvedDate = new Date(refDate);
      let diff = targetDayIndex - refDate.getDay();
      if (diff <= 0) diff += 7;
      resolvedDate.setDate(resolvedDate.getDate() + diff);
      const wdStr = toDateString(resolvedDate);
      return {
        date: wdStr,
        time,
        allDates: [wdStr],
        deadline: time ? `${wdStr} at ${time}` : wdStr,
        status: calculateEventStatus(wdStr, currentNow)
      };
    }
  }

  return {
    time,
    status: 'unknown'
  };
}

/**
 * Parses user natural language query to determine target date range.
 * 
 * Explicitly handles:
 * - "today and tomorrow", "today & tomorrow", "today, tomorrow", "today or tomorrow" -> [today, tomorrow]
 * - "today", "due today", "today's schedule" -> [today, today]
 * - "tomorrow", "due tomorrow", "tomorrow's schedule" -> [tomorrow, tomorrow]
 * - "from 15th august to 20th august" -> [2026-08-15, 2026-08-20]
 * - "between 15 aug and 20 aug"
 * - "on 17th august" -> [2026-08-17, 2026-08-17]
 */
export function parseQueryDateRange(query: string, referenceDate: Date = new Date()): DateRangeQuery {
  const text = query.trim();
  const lower = text.toLowerCase();
  const refYear = referenceDate.getFullYear();

  const parseMonth = (mStr: string): number | undefined => {
    return MONTH_MAP[mStr.toLowerCase().substring(0, 3)];
  };

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
  // 1. Continuous active range (e.g. Aug 15 to Aug 19)
  if (event.isContinuousRange && event.startDate && event.endDate) {
    return event.startDate <= queryEnd && event.endDate >= queryStart;
  }

  // 2. Discrete dates list (e.g. 12th, 24th, 25th August)
  if (event.allDates && event.allDates.length > 0) {
    return event.allDates.some(d => d >= queryStart && d <= queryEnd);
  }

  // 3. Single point-in-time date or deadline
  const singleDate = event.date || event.deadline;
  if (singleDate) {
    const dOnly = singleDate.split(' ')[0]; // Strip time if present
    return dOnly >= queryStart && dOnly <= queryEnd;
  }

  return false;
}
