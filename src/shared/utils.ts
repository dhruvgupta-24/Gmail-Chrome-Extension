import { ExtractedEvent } from '../types/events';

/**
 * Utility functions for date formatting, ID generation, text sanitization, URL normalization, and Gmail navigation.
 */

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Returns today's date in YYYY-MM-DD format in local timezone.
 */
export function getTodayDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats an ISO date string or Date object into human-readable date.
 * e.g., "Aug 15, 2026" or "Today, 11:59 PM" or "Aug 15–19, 2026"
 */
export function formatHumanDate(
  dateStr?: string,
  timeStr?: string,
  endDateStr?: string,
  isContinuousRange?: boolean
): string {
  if (!dateStr) return timeStr ? `At ${timeStr}` : 'Date not specified';

  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return dateStr;

    const formattedStartDate = `${MONTH_NAMES[month - 1]} ${day}`;

    // If explicit continuous range (e.g. Aug 15–19, 2026)
    if (isContinuousRange && endDateStr && endDateStr !== dateStr) {
      const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);
      if (eYear && eMonth && eDay) {
        if (month === eMonth) {
          return `${MONTH_NAMES[month - 1]} ${day} to ${MONTH_NAMES[month - 1]} ${eDay}, ${year}${timeStr ? ` at ${timeStr}` : ''}`;
        }
        return `${formattedStartDate} to ${MONTH_NAMES[eMonth - 1]} ${eDay}, ${eYear}${timeStr ? ` at ${timeStr}` : ''}`;
      }
    }

    const targetDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetMidnight = new Date(targetDate);
    targetMidnight.setHours(0, 0, 0, 0);

    const diffDays = Math.round((targetMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const formattedFullDate = `${MONTH_NAMES[month - 1]} ${day}, ${year}`;

    let relativeLabel = '';
    if (diffDays === 0) relativeLabel = 'Today';
    else if (diffDays === 1) relativeLabel = 'Tomorrow';
    else if (diffDays === -1) relativeLabel = 'Yesterday';
    else if (diffDays > 1 && diffDays < 7) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      relativeLabel = days[targetDate.getDay()];
    }

    if (relativeLabel) {
      return timeStr ? `${relativeLabel} (${formattedFullDate}) at ${timeStr}` : `${relativeLabel} (${formattedFullDate})`;
    }

    return timeStr ? `${formattedFullDate} at ${timeStr}` : formattedFullDate;
  } catch {
    return dateStr;
  }
}

/**
 * Returns a complete semantic description of the event's date/schedule for cards.
 */
export function formatEventSemanticDate(event: ExtractedEvent, referenceDate: Date = new Date()): string {
  const formatIsoDateClean = (iso: string) => {
    const parts = iso.split('-').map(Number);
    if (!parts[0] || !parts[1] || !parts[2]) return iso;
    return `${MONTH_NAMES[parts[1] - 1]} ${parts[2]}, ${parts[0]}`;
  };

  const todayStr = getTodayDateString(referenceDate);

  // 1. Process stages (e.g. PPT on Aug 14, Technical Assessment on Aug 16 at 4:00 PM)
  if (event.stages && event.stages.length > 0) {
    const activeTodayStage = event.stages.find(s => s.date === todayStr);
    if (activeTodayStage) {
      return `Today: ${activeTodayStage.name}${activeTodayStage.time ? ` at ${activeTodayStage.time}` : ''}`;
    }
    const upcomingStage = event.stages.find(s => s.date && s.date >= todayStr);
    if (upcomingStage && upcomingStage.date) {
      return `${upcomingStage.name}: ${formatIsoDateClean(upcomingStage.date)}${upcomingStage.time ? ` at ${upcomingStage.time}` : ''}`;
    }
  }

  // 2. Continuous active range (e.g. AIMCAT Aug 15 to Aug 19)
  if (event.isContinuousRange && event.startDate && event.endDate) {
    const isTest = event.type === 'assessment' || event.type === 'coding_round' || /test|assessment|aimcat|exam/i.test(event.title);
    const windowName = isTest ? 'Test window' : (event.type === 'registration' ? 'Registration window' : 'Window');

    if (todayStr >= event.startDate && todayStr <= event.endDate) {
      return `${windowName} active until ${formatIsoDateClean(event.endDate)}`;
    }
    if (todayStr < event.startDate) {
      return `${windowName} opens ${formatIsoDateClean(event.startDate)} (until ${formatIsoDateClean(event.endDate)})`;
    }
    return `${windowName} ended on ${formatIsoDateClean(event.endDate)}`;
  }

  // 3. Point-in-time deadline
  if (event.isDeadline || event.deadline) {
    const rawDate = (event.deadline || event.date || '').split(' ')[0];
    const dateStr = formatIsoDateClean(rawDate);
    const timeStr = event.time ? ` at ${event.time}` : '';
    const isReg = event.type === 'registration' || event.title.toLowerCase().includes('register');
    return `${isReg ? 'Registration Deadline' : 'Deadline'}: ${dateStr}${timeStr}`;
  }

  // 4. Discrete multi-dates list
  if (event.allDates && event.allDates.length > 1) {
    const formatted = event.allDates.map(d => {
      const parts = d.split('-').map(Number);
      return parts[1] && parts[2] ? `${MONTH_NAMES[parts[1] - 1]} ${parts[2]}` : d;
    }).join(', ');
    return `Dates: ${formatted}`;
  }

  // 5. Single scheduled event
  const singleDate = event.date || event.startDate;
  if (singleDate) {
    const dateFormatted = formatIsoDateClean(singleDate);
    const timeStr = event.time ? ` at ${event.time}` : '';
    return `Scheduled for ${dateFormatted}${timeStr}`;
  }

  return 'Date not specified';
}

/**
 * Escapes HTML to prevent XSS.
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates direct Gmail deep-link for a message or thread.
 */
export function getGmailLink(messageId: string, threadId?: string): string {
  const idToOpen = threadId || messageId;
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(idToOpen)}`;
}

/**
 * Opens a Gmail message or thread in the CURRENT tab without opening new tabs.
 * Leverages Gmail SPA hash routing to seamlessly navigate to the exact email.
 */
export function openGmailMessageInCurrentTab(messageId: string, threadId?: string): void {
  const targetId = threadId || messageId;
  if (!targetId) return;

  const targetHash = `#all/${encodeURIComponent(targetId)}`;

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'mail.google.com') {
      window.location.hash = targetHash;
    } else {
      window.location.href = `https://mail.google.com/mail/u/0/${targetHash}`;
    }
  }
}

/**
 * Cleans and trims plain text strings.
 */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}
