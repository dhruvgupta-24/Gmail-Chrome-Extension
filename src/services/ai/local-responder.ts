import { ExtractedEvent } from '../../types/events';
import { formatHumanDate } from '../../shared/utils';

/**
 * Generates an instantaneous, grounded response directly from local extracted events
 * when local query intent matches perfectly or when local LLM is starting/idle.
 */
export function generateLocalDeterministicResponse(
  query: string,
  events: ExtractedEvent[]
): string {
  const lower = query.toLowerCase();

  if (events.length === 0) {
    return 'I searched your indexed mailbox and found no relevant upcoming deadlines, tests, or action items matching this request. You can click **Sync** in the top bar to fetch any newly arrived emails.';
  }

  // 1. Due Today Query
  if (lower.includes('today') || lower.includes('due today')) {
    const todayEvents = events.filter(e => e.status === 'today');
    if (todayEvents.length === 0) {
      return 'You have no urgent obligations or tests due **today**. Everything appears up to date!';
    }
    let res = `### Obligations Due Today (${todayEvents.length})\n\n`;
    todayEvents.forEach((ev, i) => {
      res += `${i + 1}. **${ev.title}**\n`;
      if (ev.time) res += `   • **Time**: ${ev.time}\n`;
      if (ev.organization) res += `   • **Organization**: ${ev.organization}\n`;
      if (ev.actionDescription) res += `   • **Action Required**: ${ev.actionDescription}\n`;
      if (ev.links.length > 0) res += `   • **Link**: [${ev.links[0].label}](${ev.links[0].url})\n`;
      res += '\n';
    });
    return res.trim();
  }

  // 2. Due Tomorrow Query
  if (lower.includes('tomorrow') || lower.includes('due tomorrow')) {
    const tomorrowEvents = events.filter(e => e.status === 'tomorrow');
    if (tomorrowEvents.length === 0) {
      return 'You have no scheduled items or deadlines due **tomorrow**.';
    }
    let res = `### Scheduled for Tomorrow (${tomorrowEvents.length})\n\n`;
    tomorrowEvents.forEach((ev, i) => {
      res += `${i + 1}. **${ev.title}**\n`;
      if (ev.time) res += `   • **Time**: ${ev.time}\n`;
      if (ev.organization) res += `   • **Organization**: ${ev.organization}\n`;
      if (ev.actionDescription) res += `   • **Action**: ${ev.actionDescription}\n`;
      if (ev.links.length > 0) res += `   • **Link**: [${ev.links[0].label}](${ev.links[0].url})\n`;
      res += '\n';
    });
    return res.trim();
  }

  // 3. Tests & Assessments Query
  if (lower.includes('test') || lower.includes('quiz') || lower.includes('exam') || lower.includes('assessment')) {
    let res = `### Upcoming Tests & Assessments (${events.length})\n\n`;
    events.forEach((ev, i) => {
      res += `${i + 1}. **${ev.title}**\n`;
      res += `   • **Date**: ${formatHumanDate(ev.date, ev.time)}\n`;
      if (ev.organization) res += `   • **Organization**: ${ev.organization}\n`;
      if (ev.links.length > 0) res += `   • **Test Link**: [${ev.links[0].label}](${ev.links[0].url})\n`;
      res += '\n';
    });
    return res.trim();
  }

  // 4. General listing
  let res = `Found **${events.length}** relevant item${events.length > 1 ? 's' : ''} in your indexed mailbox:\n\n`;
  events.slice(0, 6).forEach((ev, i) => {
    res += `${i + 1}. **${ev.title}** (${formatHumanDate(ev.date, ev.time)})\n`;
    if (ev.actionDescription) res += `   • ${ev.actionDescription}\n`;
    if (ev.links.length > 0) res += `   • Direct Link: [${ev.links[0].label}](${ev.links[0].url})\n`;
    res += '\n';
  });
  return res.trim();
}
