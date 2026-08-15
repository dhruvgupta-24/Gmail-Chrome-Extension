/**
 * Utility functions for date formatting, ID generation, text sanitization, and URL normalization.
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

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return dateStr;

    const formattedStartDate = `${monthNames[month - 1]} ${day}`;

    // If explicit continuous range (e.g. Aug 15–19, 2026)
    if (isContinuousRange && endDateStr && endDateStr !== dateStr) {
      const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);
      if (eYear && eMonth && eDay) {
        if (month === eMonth) {
          return `${monthNames[month - 1]} ${day}–${eDay}, ${year}${timeStr ? ` at ${timeStr}` : ''}`;
        }
        return `${formattedStartDate} – ${monthNames[eMonth - 1]} ${eDay}, ${eYear}${timeStr ? ` at ${timeStr}` : ''}`;
      }
    }

    const targetDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetMidnight = new Date(targetDate);
    targetMidnight.setHours(0, 0, 0, 0);

    const diffDays = Math.round((targetMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const formattedFullDate = `${monthNames[month - 1]} ${day}, ${year}`;

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
  return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(idToOpen)}`;
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
