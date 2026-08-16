import { ExtractedEvent, DateRangeQuery } from '../../types/events';
import { parseQueryDateRange, toDateString, parseISODate } from '../extraction/date-parser';
import { deduplicateEvents } from '../../storage/local-search';
import { QueryConstraints, parseQueryConstraints } from '../retrieval/intent';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

/**
 * Formats ISO date "YYYY-MM-DD" to human readable "August 15" or "Aug 15".
 */
export function formatMonthDay(dateStr?: string): string {
  if (!dateStr) return 'Unspecified Date';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    return `${MONTH_NAMES[m - 1]} ${d}`;
  } catch {
    return dateStr;
  }
}

/**
 * Formats ISO date to "Saturday, August 15".
 */
export function formatWeekdayMonthDay(dateStr: string): string {
  const d = parseISODate(dateStr);
  if (!d) return dateStr;
  const dayName = WEEKDAY_NAMES[d.getDay()];
  const monthName = MONTH_NAMES[d.getMonth()];
  return `${dayName}, ${monthName} ${d.getDate()}`;
}

/**
 * Filters out social media links (Instagram, Facebook, etc.) and returns the best action link.
 */
function getBestActionLink(links: ExtractedEvent['links']): { label: string; url: string } | null {
  if (!links || links.length === 0) return null;
  const valid = links.filter(l => {
    const u = l.url.toLowerCase();
    const lbl = l.label.toLowerCase();
    return !['instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'youtube.com', 'linkedin.com/company'].some(s => u.includes(s)) &&
           !['instagram', 'facebook', 'twitter', 'youtube', 'linkedin', 'unsubscribe', 'website'].includes(lbl);
  });
  return valid.length > 0 ? valid[0] : null;
}

/**
 * Generates a natural, intelligent summary line for an event.
 */
function summarizeEventNaturally(ev: ExtractedEvent, context: 'today' | 'tomorrow' | 'upcoming'): string {
  const org = ev.company || ev.organization;
  const orgStr = org ? ` (${org})` : '';
  const bestLink = getBestActionLink(ev.links);
  const linkStr = bestLink ? ` [${bestLink.label}](${bestLink.url})` : '';

  // 0. Process Stage Match (e.g. Infoedge Technical Assessment today at 4:00 PM)
  if (ev.stages && ev.stages.length > 0) {
    const stageToday = ev.stages.find(s => s.type === 'assessment' || s.type === 'coding_round' || s.type === 'test' || s.type === 'ppt' || s.type === 'interview');
    if (context === 'today' && stageToday) {
      const stageTime = stageToday.time ? ` at ${stageToday.time}` : (ev.time ? ` at ${ev.time}` : '');
      const actionDesc = ev.actionDescription ? ` ${ev.actionDescription}` : '';
      const prefix = ev.company && !stageToday.name.toLowerCase().includes(ev.company.toLowerCase()) ? `${ev.company} ` : '';
      return `**${prefix}${stageToday.name}**${orgStr} — Scheduled for today${stageTime}.${actionDesc}${linkStr}`;
    }
  }

  // 1. Continuous window assessment (e.g. AIMCAT Aug 15–19)
  if (ev.isContinuousRange && ev.startDate && ev.endDate) {
    if (context === 'today') {
      return `**${ev.title}**${orgStr} — Test window is open. You can take the test anytime until ${formatMonthDay(ev.endDate)}.${linkStr}`;
    }
    if (context === 'tomorrow') {
      return `**${ev.title}**${orgStr} — Test window remains open until ${formatMonthDay(ev.endDate)}.${linkStr}`;
    }
    return `**${ev.title}**${orgStr} — Test window: ${formatMonthDay(ev.startDate)} to ${formatMonthDay(ev.endDate)}.${linkStr}`;
  }

  // 2. Point-in-time deadline (e.g. Registration deadline Aug 20)
  if (ev.isDeadline || ev.deadline) {
    const dlDate = (ev.deadline || ev.date || '').split(' ')[0];
    if (context === 'today') {
      return `**${ev.title}**${orgStr} — Deadline is today${ev.time ? ` by ${ev.time}` : ''}.${ev.actionDescription ? ` ${ev.actionDescription}` : ''}${linkStr}`;
    }
    if (context === 'tomorrow') {
      return `**${ev.title}**${orgStr} — Deadline is tomorrow${ev.time ? ` by ${ev.time}` : ''}.${ev.actionDescription ? ` ${ev.actionDescription}` : ''}${linkStr}`;
    }
    return `**${ev.title}**${orgStr} — Registration / submission deadline is ${formatMonthDay(dlDate)}${ev.time ? ` at ${ev.time}` : ''}.${linkStr}`;
  }

  // 3. Specific point assessment / coding round / interview
  if (ev.type === 'interview') {
    const timeStr = ev.time ? ` at ${ev.time}` : '';
    if (context === 'today') return `**${ev.title}**${orgStr} — Interview scheduled for today${timeStr}.${linkStr}`;
    if (context === 'tomorrow') return `**${ev.title}**${orgStr} — Interview scheduled for tomorrow${timeStr}.${linkStr}`;
    return `**${ev.title}**${orgStr} — Interview on ${formatMonthDay(ev.date)}${timeStr}.${linkStr}`;
  }

  if (ev.type === 'test' || ev.type === 'assessment' || ev.type === 'coding_round' || ev.type === 'exam' || ev.type === 'quiz') {
    const timeStr = ev.time ? ` at ${ev.time}` : '';
    if (context === 'today') return `**${ev.title}**${orgStr} — Online assessment scheduled for today${timeStr}.${linkStr}`;
    if (context === 'tomorrow') return `**${ev.title}**${orgStr} — Online assessment scheduled for tomorrow${timeStr}.${linkStr}`;
    return `**${ev.title}**${orgStr} — Scheduled for ${formatMonthDay(ev.date)}${timeStr}.${linkStr}`;
  }

  // 4. Default / General Event
  if (context === 'today') {
    return `**${ev.title}**${orgStr} — Scheduled for today${ev.time ? ` at ${ev.time}` : ''}.${ev.actionDescription ? ` ${ev.actionDescription}` : ''}${linkStr}`;
  }
  if (context === 'tomorrow') {
    return `**${ev.title}**${orgStr} — Scheduled for tomorrow${ev.time ? ` at ${ev.time}` : ''}.${ev.actionDescription ? ` ${ev.actionDescription}` : ''}${linkStr}`;
  }
  return `**${ev.title}**${orgStr} — Scheduled for ${formatMonthDay(ev.date)}${ev.time ? ` at ${ev.time}` : ''}.${linkStr}`;
}

/**
 * Formats a clean, direct answer for an entity-specific query (e.g. "do i have infoedge test today?").
 */
function formatEntitySpecificResponse(
  constraints: QueryConstraints,
  events: ExtractedEvent[],
  _nowDate: Date,
  matchedOnRequestedDate?: boolean
): string {
  const entityDisplay = constraints.rawEntity
    ? constraints.rawEntity.charAt(0).toUpperCase() + constraints.rawEntity.slice(1)
    : (constraints.entityQuery || 'the requested');

  const eventTypeDisplay = constraints.eventType && constraints.eventType !== 'any'
    ? constraints.eventType
    : 'event';

  // Scenario 1: No matching event for this entity at all
  if (events.length === 0) {
    if (constraints.questionType === 'existence') {
      const timeContext = constraints.dateRange?.label ? ` ${constraints.dateRange.label.toLowerCase()}` : '';
      return `No. I couldn't find any **${entityDisplay}** ${eventTypeDisplay} in your indexed emails${timeContext}.`;
    }
    return `I couldn't find any **${entityDisplay}** ${eventTypeDisplay} or schedule in your indexed emails.`;
  }

  const primaryEvent = events[0];
  const bestLink = getBestActionLink(primaryEvent.links);
  const linkStr = bestLink ? ` [${bestLink.label}](${bestLink.url})` : '';

  // Check if query is targeting a specific process stage (e.g. PPT, Assessment, Interview)
  const matchedStage = (primaryEvent.stages || []).find(s => {
    if (constraints.eventType === 'test') return ['assessment', 'coding_round', 'test'].includes(s.type);
    if (constraints.eventType === 'ppt') return s.type === 'ppt';
    if (constraints.eventType === 'interview') return s.type === 'interview';
    if (constraints.eventType === 'deadline') return s.type === 'registration' || s.type === 'deadline';
    return false;
  });

  const rawStageTitle = matchedStage?.name || primaryEvent.title;
  const stageTitle = rawStageTitle.toLowerCase().includes(entityDisplay.toLowerCase())
    ? rawStageTitle
    : `${entityDisplay} ${rawStageTitle}`;
  const targetDateStr = matchedStage?.date || primaryEvent.date || primaryEvent.startDate;
  const timeStr = matchedStage?.time ? ` at ${matchedStage.time}` : (primaryEvent.time ? ` at ${primaryEvent.time}` : '');
  const dateFormatted = targetDateStr ? formatMonthDay(targetDateStr) : '';

  // Build operational action details (e.g. "The test will be active between 4 pm - 5:30 pm, and the link is expected to be shared by 3:50PM.")
  let actionDetails = '';
  if (primaryEvent.actionDescription && !primaryEvent.actionDescription.startsWith('Action required before')) {
    actionDetails = ` ${primaryEvent.actionDescription}`;
  }

  // Multi-date discrete string
  let multiDateStr = '';
  if (primaryEvent.allDates && primaryEvent.allDates.length > 1) {
    const formattedDates = primaryEvent.allDates.map(d => formatMonthDay(d));
    multiDateStr = ` (${formattedDates.join(', ')})`;
  }

  // Handle stage with TBD status (e.g. "do i have an infoedge interview?")
  if (matchedStage && matchedStage.status === 'tbd') {
    return `The **${entityDisplay}** ${matchedStage.name.toLowerCase()} is yet to be decided (TBD).`;
  }

  // Scenario 2: Existence question with requested date (e.g. "do i have infoedge test today?")
  if (constraints.questionType === 'existence' && constraints.dateRange) {
    const requestedLabel = constraints.dateRange.label || 'today';

    if (matchedOnRequestedDate === true) {
      // YES MATCH
      if (primaryEvent.isContinuousRange && primaryEvent.endDate) {
        return `Yes. The **${stageTitle}** test window is open today and remains active until ${formatMonthDay(primaryEvent.endDate)}.${actionDetails}${linkStr}`;
      }
      if (primaryEvent.isDeadline) {
        return `Yes. The deadline for **${stageTitle}** is today${timeStr}.${actionDetails}${linkStr}`;
      }
      return `Yes. You have the **${stageTitle}** ${requestedLabel.toLowerCase()}${timeStr}.${actionDetails}${linkStr}`;
    } else {
      // NO MATCH ON REQUESTED DATE, but upcoming event exists
      const upcomingDateFormatted = targetDateStr ? formatMonthDay(targetDateStr) : '';
      if (primaryEvent.isContinuousRange && primaryEvent.startDate && primaryEvent.endDate) {
        return `No. You don't have a ${entityDisplay} ${eventTypeDisplay} ${requestedLabel.toLowerCase()}. The **${stageTitle}** test window runs from ${formatMonthDay(primaryEvent.startDate)} to ${formatMonthDay(primaryEvent.endDate)}.${actionDetails}${linkStr}`;
      }
      if (primaryEvent.isDeadline) {
        return `No. You don't have a ${entityDisplay} deadline ${requestedLabel.toLowerCase()}. The deadline for **${stageTitle}** is ${upcomingDateFormatted}${timeStr}.${actionDetails}${linkStr}`;
      }
      return `No. You don't have an ${entityDisplay} ${eventTypeDisplay} scheduled for ${requestedLabel.toLowerCase()}. Your next **${stageTitle}** is scheduled for ${upcomingDateFormatted}${timeStr}${multiDateStr}.${actionDetails}${linkStr}`;
    }
  }

  // Scenario 3: Time query (e.g. "when is my idfc test?", "when is the infoedge test?", "when was the infoedge ppt?")
  if (constraints.questionType === 'time_query') {
    if (primaryEvent.isContinuousRange && primaryEvent.startDate && primaryEvent.endDate) {
      return `The test window for **${stageTitle}** is open from ${formatMonthDay(primaryEvent.startDate)} to ${formatMonthDay(primaryEvent.endDate)}.${actionDetails}${linkStr}`;
    }
    if (primaryEvent.isDeadline) {
      return `The registration/submission deadline for **${stageTitle}** is ${dateFormatted}${timeStr}.${actionDetails}${linkStr}`;
    }
    if (primaryEvent.allDates && primaryEvent.allDates.length > 1 && !matchedStage) {
      const dates = primaryEvent.allDates.map(d => formatMonthDay(d)).join(', ');
      return `The **${stageTitle}** is scheduled across: ${dates}${timeStr}.${actionDetails}${linkStr}`;
    }
    return `Your **${stageTitle}** is scheduled for ${dateFormatted}${timeStr}.${actionDetails}${linkStr}`;
  }

  // Scenario 4: Link query (e.g. "where is the idfc link?")
  if (constraints.questionType === 'link_query') {
    if (bestLink) {
      return `Here is the link for **${stageTitle}**: [${bestLink.label}](${bestLink.url}).`;
    }
    return `No direct test link was found in the email for **${stageTitle}**. ${actionDetails || 'Please check the original email.'}`;
  }

  // Fallback: Default Entity summary
  return `### ${stageTitle}\n- **Organization:** ${primaryEvent.company || primaryEvent.organization || entityDisplay}\n- **Schedule:** ${dateFormatted || 'Unspecified'}${timeStr}${multiDateStr}\n${actionDetails ? `- **Details:** ${actionDetails}\n` : ''}${bestLink ? `- **Link:** [${bestLink.label}](${bestLink.url})\n` : ''}`.trim();
}

/**
 * Generates an instantaneous, natural, Shortwave-style response from local extracted events.
 */
export function generateLocalDeterministicResponse(
  query: string,
  events: ExtractedEvent[],
  nowDate: Date = new Date(),
  detectedRange?: DateRangeQuery,
  allIndexedEvents?: ExtractedEvent[],
  constraintsInput?: QueryConstraints,
  matchedOnRequestedDate?: boolean
): string {
  const lower = query.toLowerCase();
  const constraints = constraintsInput || parseQueryConstraints(query, nowDate);
  const dedupedEvents = deduplicateEvents(events);

  // 1. HIGHEST PRIORITY: Entity-Specific Queries (e.g. "do i have idfc test today?")
  if (constraints.isEntitySpecific) {
    return formatEntitySpecificResponse(constraints, dedupedEvents, nowDate, matchedOnRequestedDate);
  }

  // 2. "Today and Tomorrow" Query (e.g. "what all do i have today and tomorrow?")
  const dateRange = detectedRange || constraints.dateRange || parseQueryDateRange(query, nowDate);
  if (dateRange.isDateQuery && dateRange.isTodayAndTomorrow) {
    const todayStr = toDateString(nowDate);
    const tomDate = new Date(nowDate);
    tomDate.setDate(tomDate.getDate() + 1);
    const tomStr = toDateString(tomDate);

    // Today items
    const todayActive = dedupedEvents.filter(e =>
      (e.isContinuousRange && e.startDate && e.endDate && todayStr >= e.startDate && todayStr <= e.endDate) ||
      (e.allDates && e.allDates.includes(todayStr)) ||
      (e.stages && e.stages.some(s => s.date === todayStr)) ||
      (e.date === todayStr) ||
      (e.deadline && e.deadline.startsWith(todayStr)) ||
      e.status === 'today'
    );

    // Tomorrow items starting or happening specifically tomorrow
    const tomNewEvents = dedupedEvents.filter(e =>
      (!e.isContinuousRange && (e.date === tomStr || (e.deadline && e.deadline.startsWith(tomStr)) || (e.allDates && e.allDates.includes(tomStr)) || (e.stages && e.stages.some(s => s.date === tomStr)))) ||
      (e.isContinuousRange && e.startDate === tomStr)
    );

    // Continuous windows that are active today AND continue tomorrow
    const continuingWindows = dedupedEvents.filter(e =>
      e.isContinuousRange &&
      e.startDate && e.endDate &&
      e.startDate <= todayStr &&
      e.endDate >= tomStr
    );

    let res = '';

    // --- TODAY SECTION ---
    res += `### Today (${formatWeekdayMonthDay(todayStr)})\n\n`;
    if (todayActive.length === 0) {
      res += `- Nothing specifically scheduled for today.\n\n`;
    } else {
      todayActive.forEach(ev => {
        res += `- ${summarizeEventNaturally(ev, 'today')}\n`;
      });
      res += '\n';
    }

    // --- TOMORROW SECTION ---
    res += `### Tomorrow (${formatWeekdayMonthDay(tomStr)})\n\n`;
    if (tomNewEvents.length > 0) {
      tomNewEvents.forEach(ev => {
        res += `- ${summarizeEventNaturally(ev, 'tomorrow')}\n`;
      });
      if (continuingWindows.length > 0) {
        const winTitles = continuingWindows.map(w => `**${w.title}**`).join(', ');
        res += `- (The ${winTitles} test window will also remain open.)\n`;
      }
    } else if (continuingWindows.length > 0) {
      const win = continuingWindows[0];
      res += `- Nothing new is scheduled for tomorrow, but the **${win.title}** test window will still remain open.\n`;
    } else {
      res += `- Nothing specifically scheduled for tomorrow.\n`;
    }

    // --- COMING UP SOON SECTION ---
    const upcomingPool = allIndexedEvents || dedupedEvents;
    const futureLimit = new Date(nowDate);
    futureLimit.setDate(futureLimit.getDate() + 7);
    const futureLimitStr = toDateString(futureLimit);

    const comingSoon = deduplicateEvents(upcomingPool).filter(e => {
      const d = e.startDate || e.date || (e.deadline ? e.deadline.split(' ')[0] : '');
      return d > tomStr && d <= futureLimitStr && !todayActive.some(t => t.id === e.id);
    });

    if (comingSoon.length > 0) {
      res += `\n### Coming Up Soon\n\n`;
      comingSoon.slice(0, 3).forEach(ev => {
        res += `- ${summarizeEventNaturally(ev, 'upcoming')}\n`;
      });
    }

    return res.trim();
  }

  // 3. Specific Single-Day / Date Range Query (Broad/Non-entity)
  if (dateRange.isDateQuery && dateRange.startDate && dateRange.endDate) {
    if (dateRange.label === 'Today') {
      if (dedupedEvents.length === 0) {
        return 'You have no urgent obligations or tests due **today**. Everything is up to date!';
      }
      let res = `### Obligations Due Today (${dedupedEvents.length})\n\n`;
      dedupedEvents.forEach(ev => {
        res += `- ${summarizeEventNaturally(ev, 'today')}\n`;
      });
      return res.trim();
    }

    if (dateRange.label === 'Tomorrow') {
      if (dedupedEvents.length === 0) {
        return 'You have no scheduled items or deadlines due **tomorrow**.';
      }
      let res = `### Scheduled for Tomorrow (${dedupedEvents.length})\n\n`;
      dedupedEvents.forEach(ev => {
        res += `- ${summarizeEventNaturally(ev, 'tomorrow')}\n`;
      });
      return res.trim();
    }

    if (dedupedEvents.length === 0) {
      return `No scheduled tests, assessments, deadlines, or academic events found for **${dateRange.label || 'the requested period'}**.`;
    }

    let res = `### Schedule for ${dateRange.label || `${formatMonthDay(dateRange.startDate)}–${formatMonthDay(dateRange.endDate)}`}\n\n`;

    dedupedEvents.forEach(ev => {
      res += `- ${summarizeEventNaturally(ev, 'upcoming')}\n`;
    });

    return res.trim();
  }

  // 4. Tests & Assessments Generic Query
  if (lower.includes('test') || lower.includes('quiz') || lower.includes('exam') || lower.includes('assessment')) {
    if (dedupedEvents.length === 0) {
      return 'No upcoming tests or assessments found in your indexed emails.';
    }
    let res = `### Upcoming Tests & Assessments (${dedupedEvents.length})\n\n`;
    dedupedEvents.forEach(ev => {
      res += `- ${summarizeEventNaturally(ev, 'upcoming')}\n`;
    });
    return res.trim();
  }

  // 5. General listing
  if (dedupedEvents.length === 0) {
    return 'I searched your indexed mailbox and found no relevant upcoming deadlines or tests matching this request.';
  }

  let res = `### Summary of Relevant Items (${dedupedEvents.length})\n\n`;
  dedupedEvents.slice(0, 5).forEach(ev => {
    res += `- ${summarizeEventNaturally(ev, 'upcoming')}\n`;
  });
  return res.trim();
}
