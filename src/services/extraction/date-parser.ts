import { EventStatus } from '../../types/events';

export interface ParsedDateResult {
  date?: string; // YYYY-MM-DD
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
 * Normalizes a Date object to YYYY-MM-DD string in local time.
 */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Determines EventStatus ('today' | 'tomorrow' | 'upcoming' | 'past' | 'unknown')
 * based on comparing the event's target date with the user's current date (now).
 */
export function calculateEventStatus(targetDateStr?: string, nowDate: Date = new Date()): EventStatus {
  if (!targetDateStr) return 'unknown';

  try {
    const [tYear, tMonth, tDay] = targetDateStr.split('-').map(Number);
    if (!tYear || !tMonth || !tDay) return 'unknown';

    const targetDate = new Date(tYear, tMonth - 1, tDay);
    const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const targetTime = targetDate.getTime();
    const todayTime = today.getTime();
    const tomorrowTime = tomorrow.getTime();

    if (targetTime === todayTime) return 'today';
    if (targetTime === tomorrowTime) return 'tomorrow';
    if (targetTime > tomorrowTime) return 'upcoming';
    if (targetTime < todayTime) return 'past';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Extracts standard time strings (e.g. "11:59 PM", "10:00 AM", "17:30") from text.
 */
export function extractTimeFromText(text: string): string | undefined {
  // Matches "11:59 PM", "11:59pm", "10:00 AM", "10am", "10:00 hrs", "23:59"
  const timeRegex = /\b(?:at\s+|by\s+|before\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\d{1,2}:\d{2}(?:\s*(?:hrs|hours))?)\b/i;
  const match = text.match(timeRegex);
  if (match) {
    let t = match[1].trim().toUpperCase();
    // Normalize format e.g. "10AM" -> "10:00 AM"
    if (/^\d{1,2}\s*(?:AM|PM)$/.test(t)) {
      const parts = t.match(/^(\d{1,2})\s*(AM|PM)$/);
      if (parts) t = `${parts[1]}:00 ${parts[2]}`;
    }
    return t;
  }
  return undefined;
}

/**
 * Extracts and resolves dates from text, using the email's sent/received timestamp as the relative base reference.
 * 
 * @param text The body / subject of the email
 * @param emailTimestamp The timestamp when the email was sent/received (epoch ms or Date)
 * @param currentNow Optional override for current test time
 */
export function parseDateFromEmailText(
  text: string,
  emailTimestamp: number | Date = Date.now(),
  currentNow: Date = new Date()
): ParsedDateResult {
  const refDate = new Date(emailTimestamp);
  const time = extractTimeFromText(text);

  // 1. Check relative date keywords (today, tomorrow, day after tomorrow, yesterday)
  const lower = text.toLowerCase();

  // Pattern: "due today", "scheduled today", "happening today"
  if (/\b(today|tonight)\b/i.test(lower)) {
    const resolvedDate = new Date(refDate);
    const dateStr = toDateString(resolvedDate);
    return {
      date: dateStr,
      time,
      deadline: time ? `${dateStr} at ${time}` : dateStr,
      status: calculateEventStatus(dateStr, currentNow)
    };
  }

  // Pattern: "tomorrow" in email sent on refDate -> refDate + 1 day
  if (/\b(tomorrow)\b/i.test(lower)) {
    const resolvedDate = new Date(refDate);
    resolvedDate.setDate(resolvedDate.getDate() + 1);
    const dateStr = toDateString(resolvedDate);
    return {
      date: dateStr,
      time,
      deadline: time ? `${dateStr} at ${time}` : dateStr,
      status: calculateEventStatus(dateStr, currentNow)
    };
  }

  // Pattern: "day after tomorrow" -> refDate + 2 days
  if (/\bday after tomorrow\b/i.test(lower)) {
    const resolvedDate = new Date(refDate);
    resolvedDate.setDate(resolvedDate.getDate() + 2);
    const dateStr = toDateString(resolvedDate);
    return {
      date: dateStr,
      time,
      deadline: time ? `${dateStr} at ${time}` : dateStr,
      status: calculateEventStatus(dateStr, currentNow)
    };
  }

  // 2. Pattern: "next Monday", "this Friday", "on Wednesday"
  const weekdayRegex = /\b(?:this\s+|next\s+|on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const weekdayMatch = lower.match(weekdayRegex);
  if (weekdayMatch) {
    const targetDayName = weekdayMatch[1];
    const targetDayIndex = DAY_OF_WEEK_MAP[targetDayName];
    if (targetDayIndex !== undefined) {
      const resolvedDate = new Date(refDate);
      const currentDayIndex = refDate.getDay();
      let diff = targetDayIndex - currentDayIndex;
      if (diff <= 0) diff += 7; // Target the upcoming instance of that day

      resolvedDate.setDate(resolvedDate.getDate() + diff);
      const dateStr = toDateString(resolvedDate);
      return {
        date: dateStr,
        time,
        deadline: time ? `${dateStr} at ${time}` : dateStr,
        status: calculateEventStatus(dateStr, currentNow)
      };
    }
  }

  // 3. Pattern: "August 15, 2026" or "15th August 2026" or "Aug 15"
  const monthNameRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/i;
  const monthNameMatch = text.match(monthNameRegex);
  if (monthNameMatch) {
    const day = parseInt(monthNameMatch[1], 10);
    const monthStr = monthNameMatch[2].toLowerCase();
    const month = MONTH_MAP[monthStr];
    const year = monthNameMatch[3] ? parseInt(monthNameMatch[3], 10) : refDate.getFullYear();

    if (month !== undefined && day >= 1 && day <= 31) {
      const resolvedDate = new Date(year, month, day);
      const dateStr = toDateString(resolvedDate);
      return {
        date: dateStr,
        time,
        deadline: time ? `${dateStr} at ${time}` : dateStr,
        status: calculateEventStatus(dateStr, currentNow)
      };
    }
  }

  // Alternative pattern: "August 15th, 2026" or "Aug 15"
  const monthFirstRegex = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i;
  const monthFirstMatch = text.match(monthFirstRegex);
  if (monthFirstMatch) {
    const monthStr = monthFirstMatch[1].toLowerCase();
    const month = MONTH_MAP[monthStr];
    const day = parseInt(monthFirstMatch[2], 10);
    const year = monthFirstMatch[3] ? parseInt(monthFirstMatch[3], 10) : refDate.getFullYear();

    if (month !== undefined && day >= 1 && day <= 31) {
      const resolvedDate = new Date(year, month, day);
      const dateStr = toDateString(resolvedDate);
      return {
        date: dateStr,
        time,
        deadline: time ? `${dateStr} at ${time}` : dateStr,
        status: calculateEventStatus(dateStr, currentNow)
      };
    }
  }

  // 4. Pattern: ISO "2026-08-15" or "15/08/2026" or "15-08-2026"
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const dateStr = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    return {
      date: dateStr,
      time,
      deadline: time ? `${dateStr} at ${time}` : dateStr,
      status: calculateEventStatus(dateStr, currentNow)
    };
  }

  const slashMatch = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (slashMatch) {
    // Treat as DD/MM/YYYY or MM/DD/YYYY depending on values
    let day = parseInt(slashMatch[1], 10);
    let month = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);

    if (day > 12 && month <= 12) {
      // Definitely DD/MM/YYYY
    } else if (month > 12 && day <= 12) {
      // MM/DD/YYYY flipped
      const temp = day;
      day = month;
      month = temp;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const resolvedDate = new Date(year, month - 1, day);
      const dateStr = toDateString(resolvedDate);
      return {
        date: dateStr,
        time,
        deadline: time ? `${dateStr} at ${time}` : dateStr,
        status: calculateEventStatus(dateStr, currentNow)
      };
    }
  }

  // Default fallback: return time if found or unknown
  return {
    time,
    status: 'unknown'
  };
}
