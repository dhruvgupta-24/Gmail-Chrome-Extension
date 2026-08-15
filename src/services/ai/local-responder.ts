import { ExtractedEvent, DateRangeQuery } from '../../types/events';
import { parseQueryDateRange } from '../extraction/date-parser';
import { deduplicateEvents } from '../../storage/local-search';

/**
 * Formats ISO date "YYYY-MM-DD" to human readable "Aug 15" or "Aug 15, 2026".
 */
function formatHeadingDate(dateStr?: string): string {
  if (!dateStr) return 'Unspecified Date';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Formats a single or multi-day event range label (e.g. "Aug 15" or "Aug 15–19").
 */
function formatEventDateRange(startDate?: string, endDate?: string): string {
  if (!startDate && !endDate) return 'Date not specified';
  if (startDate && (!endDate || endDate === startDate)) {
    return formatHeadingDate(startDate);
  }
  return `${formatHeadingDate(startDate)}–${formatHeadingDate(endDate)}`;
}

/**
 * Generates an instantaneous, grounded response directly from local extracted events
 * when local query intent matches perfectly or when local LLM is starting/idle.
 */
export function generateLocalDeterministicResponse(
  query: string,
  events: ExtractedEvent[],
  nowDate: Date = new Date(),
  detectedRange?: DateRangeQuery
): string {
  const lower = query.toLowerCase();
  const dateRange = detectedRange || parseQueryDateRange(query, nowDate);
  const dedupedEvents = deduplicateEvents(events);

  // 1. Explicit Date Range Query (e.g. "tell me what all do i have from 15th august to 20th august?")
  if (dateRange.isDateQuery && dateRange.startDate && dateRange.endDate) {
    const rangeHeader = `# Your schedule: ${dateRange.label || `${formatHeadingDate(dateRange.startDate)}–${formatHeadingDate(dateRange.endDate)}`}`;

    if (dedupedEvents.length === 0) {
      return `${rangeHeader}\n\nNo scheduled tests, assessments, deadlines, or academic events found for ${dateRange.label || 'this period'}.`;
    }

    let res = `${rangeHeader}\n\n`;

    // Group events by day or multi-day window
    const groups = new Map<string, ExtractedEvent[]>();
    for (const ev of dedupedEvents) {
      const heading = formatEventDateRange(ev.startDate || ev.date, ev.endDate);
      if (!groups.has(heading)) groups.set(heading, []);
      groups.get(heading)!.push(ev);
    }

    groups.forEach((evList, heading) => {
      res += `## ${heading}\n`;
      evList.forEach(ev => {
        const orgStr = ev.company || ev.organization ? ` (${ev.company || ev.organization})` : '';
        res += `- **${ev.title}**${orgStr}\n`;
        if (ev.time) res += `  - **Time**: ${ev.time}\n`;
        if (ev.deadline && ev.deadline !== ev.date) res += `  - **Deadline**: ${ev.deadline}\n`;
        if (ev.actionDescription) res += `  - **Action Required**: ${ev.actionDescription}\n`;
        if (ev.links.length > 0) {
          const primaryLink = ev.links[0];
          res += `  - **Link**: [${primaryLink.label}](${primaryLink.url})\n`;
        }
      });
      res += '\n';
    });

    return res.trim();
  }

  // 2. Empty check for non-date queries
  if (dedupedEvents.length === 0) {
    return 'I searched your indexed mailbox and found no relevant upcoming deadlines, tests, or action items matching this request. You can click **Sync** in the top bar to fetch any newly arrived emails.';
  }

  // 3. Due Today Query
  if (lower.includes('today') || lower.includes('due today')) {
    const todayEvents = dedupedEvents.filter(e => e.status === 'today');
    if (todayEvents.length === 0) {
      return 'You have no urgent obligations or tests due **today**. Everything appears up to date!';
    }
    let res = `### Obligations Due Today (${todayEvents.length})\n\n`;
    todayEvents.forEach((ev, i) => {
      res += `${i + 1}. **${ev.title}**\n`;
      if (ev.time) res += `   • **Time**: ${ev.time}\n`;
      if (ev.company || ev.organization) res += `   • **Organization**: ${ev.company || ev.organization}\n`;
      if (ev.actionDescription) res += `   • **Action Required**: ${ev.actionDescription}\n`;
      if (ev.links.length > 0) res += `   • **Link**: [${ev.links[0].label}](${ev.links[0].url})\n`;
      res += '\n';
    });
    return res.trim();
  }

  // 4. Due Tomorrow Query
  if (lower.includes('tomorrow') || lower.includes('due tomorrow')) {
    const tomorrowEvents = dedupedEvents.filter(e => e.status === 'tomorrow');
    if (tomorrowEvents.length === 0) {
      return 'You have no scheduled items or deadlines due **tomorrow**.';
    }
    let res = `### Scheduled for Tomorrow (${tomorrowEvents.length})\n\n`;
    tomorrowEvents.forEach((ev, i) => {
      res += `${i + 1}. **${ev.title}**\n`;
      if (ev.time) res += `   • **Time**: ${ev.time}\n`;
      if (ev.company || ev.organization) res += `   • **Organization**: ${ev.company || ev.organization}\n`;
      if (ev.actionDescription) res += `   • **Action**: ${ev.actionDescription}\n`;
      if (ev.links.length > 0) res += `   • **Link**: [${ev.links[0].label}](${ev.links[0].url})\n`;
      res += '\n';
    });
    return res.trim();
  }

  // 5. Tests & Assessments Query
  if (lower.includes('test') || lower.includes('quiz') || lower.includes('exam') || lower.includes('assessment')) {
    let res = `### Upcoming Tests & Assessments (${dedupedEvents.length})\n\n`;
    dedupedEvents.forEach((ev, i) => {
      const dateLabel = formatEventDateRange(ev.startDate || ev.date, ev.endDate);
      res += `${i + 1}. **${ev.title}**\n`;
      res += `   • **Date**: ${dateLabel}${ev.time ? ` at ${ev.time}` : ''}\n`;
      if (ev.company || ev.organization) res += `   • **Organization**: ${ev.company || ev.organization}\n`;
      if (ev.actionDescription) res += `   • **Action**: ${ev.actionDescription}\n`;
      if (ev.links.length > 0) res += `   • **Test Link**: [${ev.links[0].label}](${ev.links[0].url})\n`;
      res += '\n';
    });
    return res.trim();
  }

  // 6. General listing
  let res = `### Relevant Items Found (${dedupedEvents.length})\n\n`;
  dedupedEvents.slice(0, 6).forEach((ev, i) => {
    const dateLabel = formatEventDateRange(ev.startDate || ev.date, ev.endDate);
    res += `${i + 1}. **${ev.title}** (${dateLabel})\n`;
    if (ev.actionDescription) res += `   • ${ev.actionDescription}\n`;
    if (ev.links.length > 0) res += `   • Direct Link: [${ev.links[0].label}](${ev.links[0].url})\n`;
    res += '\n';
  });
  return res.trim();
}
