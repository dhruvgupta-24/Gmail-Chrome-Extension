import { ExtractedEvent, EventType, ActionLink } from '../../types/events';
import { ParsedEmailMessage } from '../../types/gmail';
import { parseDateFromEmailText } from './date-parser';
import { extractActionLinks } from '../gmail/links';

export const CURRENT_SCHEMA_VERSION = 4;

/**
 * Strips email reply/forward prefixes, tags, and extraneous whitespace to produce a clean display title.
 */
export function cleanEventTitle(subject: string): string {
  if (!subject) return 'Untitled Event';
  let prev = '';
  let clean = subject.trim();

  while (prev !== clean) {
    prev = clean;
    clean = clean
      // Strip leading Re:, Fwd:, FW:, etc.
      .replace(/^(\s*(re|fwd|fw|aw|vs|wg)\s*:\s*)+/i, '')
      // Strip bracketed prefixes e.g. [EXTERNAL], [Urgent]
      .replace(/^\[(external|urgent|action\s+required|important|reminder|placement|campus\s+drive)\]\s*/i, '')
      .replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, '')
      .trim();
  }

  return clean || subject;
}

/**
 * Normalizes title for deduplication matching across forwarded emails, replies, or slight phrasing changes.
 */
export function normalizeTitleForDeduplication(title: string): string {
  return cleanEventTitle(title)
    .toLowerCase()
    .replace(/\b(is\s+live|invites\s+you\s+to\s+take|invitation\s+to\s+take|invitation\s+for|details?|campus\s+details?|hiring\s+process)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classifies the EventType based on email subject and content keywords.
 */
export function detectEventType(subject: string, body: string): EventType {
  const combined = `${subject} ${body}`.toLowerCase();

  if (/\b(coding\s+round|oa\b|online\s+assessment|technical\s+assessment|hackerrank|codeforces|leetcode|mettl|wheebox|test\s+credentials)\b/i.test(combined)) {
    return 'coding_round';
  }
  if (/\b(interview|technical\s+round|hr\s+round|interview\s+schedule|discussion\s+round)\b/i.test(combined)) {
    return 'interview';
  }
  if (/\b(ppt\b|pre[- ]placement\s+talk|presentation)\b/i.test(combined)) {
    return 'ppt';
  }
  if (/\b(quiz|pop\s+quiz)\b/i.test(combined)) {
    return 'quiz';
  }
  if (/\b(midterm|endterm|final\s+exam|semester\s+exam|exam\s+schedule|examination)\b/i.test(combined)) {
    return 'exam';
  }
  if (/\b(assessment|test|eval|evaluation|online\s+test|aptitude\s+test|aimcat|nqt)\b/i.test(combined)) {
    return 'assessment';
  }
  if (/\b(assignment|problem\s+set|homework|lab\s+work|project\s+submission)\b/i.test(combined)) {
    return 'assignment';
  }
  if (/\b(submission|submit\s+by|turn\s+in)\b/i.test(combined)) {
    return 'submission';
  }
  if (/\b(registration|register\s+before|rsvp|fill\s+form|apply\s+now)\b/i.test(combined)) {
    return 'registration';
  }
  if (/\b(internship|summer\s+intern|fall\s+intern|co-op)\b/i.test(combined)) {
    return 'internship';
  }
  if (/\b(placement|campus\s+drive|recruitment|job\s+offer|hiring\s+process|shortlist)\b/i.test(combined)) {
    return 'placement';
  }
  if (/\b(deadline|due\s+date|last\s+date|closing\s+date)\b/i.test(combined)) {
    return 'deadline';
  }

  return 'other';
}

/**
 * Detects if action is required from the recipient and extracts operational details (e.g. active window, link arrival).
 */
export function detectActionRequired(subject: string, body: string): { actionRequired: boolean; actionDescription?: string } {
  const combined = `${subject}\n${body}`;
  const lower = combined.toLowerCase();

  // 1. Check for specific operational timing details in email
  // e.g. "Test will be active between 4 pm - 5:30 pm. Link will be shared by 3:50PM."
  const activeWindowMatch = combined.match(/\b(?:test|assessment)\s+will\s+be\s+active\s+(?:between|from)?\s*([^.\n]+)/i);
  const linkShareMatch = combined.match(/\blink\s+will\s+be\s+shared\s+by\s*([^.\n]+)/i);

  if (activeWindowMatch || linkShareMatch) {
    const parts: string[] = [];
    if (activeWindowMatch) {
      parts.push(`The test will be active ${activeWindowMatch[0].trim()}`);
    }
    if (linkShareMatch) {
      parts.push(`The link will be shared by ${linkShareMatch[1].trim()}`);
    }
    return {
      actionRequired: true,
      actionDescription: `${parts.join(', and ')}.`
    };
  }

  const actionPhrases = [
    { pattern: /register\s+before|deadline\s+to\s+register|registration\s+closing|registration\s+deadline/i, desc: 'Complete registration before the deadline.' },
    { pattern: /submit\s+your\s+assignment|submission\s+due|upload\s+your/i, desc: 'Submit required coursework or project.' },
    { pattern: /start\s+your\s+test|assessment\s+link\s+active|take\s+the\s+assessment|complete\s+the\s+assessment|test\s+credentials/i, desc: 'Complete the online test/assessment.' },
    { pattern: /join\s+the\s+interview|interview\s+scheduled|attend\s+the\s+meeting/i, desc: 'Attend scheduled interview or meeting.' },
    { pattern: /action\s+required|mandatory\s+attendance|urgent\s+action/i, desc: 'Immediate action required as per email.' },
    { pattern: /fill\s+the\s+form|fill\s+out\s+this\s+google\s+form/i, desc: 'Fill out the required form.' },
    { pattern: /confirm\s+your\s+attendance|confirm\s+slot/i, desc: 'Confirm your participation slot.' }
  ];

  for (const { pattern, desc } of actionPhrases) {
    if (pattern.test(lower)) {
      return { actionRequired: true, actionDescription: desc };
    }
  }

  if (/\b(due\s+today|due\s+tomorrow|urgent|mandatory|action\s+required)\b/i.test(lower)) {
    return { actionRequired: true, actionDescription: 'Action required before specified deadline.' };
  }

  return { actionRequired: false };
}

/**
 * Extracts organization or company from sender and subject.
 */
export function extractOrganization(senderName: string, subject: string, body: string = ''): string {
  const textToScan = `${senderName} ${subject} ${body.substring(0, 300)}`;
  const companyMatch = textToScan.match(/\b(Infoedge(?:\s+India(?:\s+Ltd\.?)?)?|Info\s*Edge|Naukri|Sigmoid(?:\s+Analytics)?|Cognizant|Amazon|Google|Microsoft|Bain(?:\s+&\s+Company)?|Goldman\s+Sachs|McKinsey|Flipkart|Uber|Adobe|Salesforce|TCS|Infosys|Wipro|Accenture|Deloitte|PwC|EY|KPMG|IDFC\s+First\s+Bank|Dr\.?\s*Reddy'?s|BNP\s+Paribas|TIME|AIMCAT)\b/i);
  if (companyMatch) {
    let org = companyMatch[1].trim();
    if (/^info\s*edge/i.test(org) || /^naukri/i.test(org)) {
      org = 'Infoedge India Ltd.';
    }
    return org;
  }

  if (senderName && !senderName.includes('@')) {
    return senderName.replace(/^["']|["']$/g, '').trim();
  }

  const bracketMatch = subject.match(/^\[(.*?)\]/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  return senderName || '';
}

/**
 * Deterministically extracts structured event from a parsed Gmail message.
 */
export function extractEventFromEmail(email: ParsedEmailMessage, currentNow: Date = new Date()): ExtractedEvent | null {
  const dateResult = parseDateFromEmailText(email.subject, email.plainText, email.timestamp, currentNow);
  const type = detectEventType(email.subject, email.plainText);
  const { actionRequired, actionDescription } = detectActionRequired(email.subject, email.plainText);
  const links = extractActionLinks(email.htmlContent || email.plainText);
  const organization = extractOrganization(email.senderName, email.subject, email.plainText);
  const cleanTitle = cleanEventTitle(email.subject);

  if (type === 'other' && !actionRequired && dateResult.status === 'unknown') {
    return null;
  }

  // Derive stable deduplication key
  const normTitle = normalizeTitleForDeduplication(cleanTitle);
  const orgKey = (organization || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const eventId = email.threadId
    ? `thread-${email.threadId}`
    : `event-${orgKey}-${normTitle.substring(0, 30).replace(/\s+/g, '-')}`;

  return {
    id: eventId,
    threadId: email.threadId,
    title: cleanTitle,
    company: organization || undefined,
    type,
    startDate: dateResult.startDate,
    endDate: dateResult.endDate,
    date: dateResult.date,
    time: dateResult.time,
    deadline: dateResult.deadline,
    isDeadline: dateResult.isDeadline,
    isContinuousRange: dateResult.isContinuousRange,
    allDates: dateResult.allDates,
    organization,
    actionRequired,
    actionDescription,
    links,
    sourceMessages: [
      {
        messageId: email.id,
        threadId: email.threadId,
        subject: email.subject,
        sender: email.sender,
        receivedAt: email.date,
        snippet: email.snippet
      }
    ],
    confidence: 0.95,
    status: dateResult.status,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Merges multiple emails belonging to the same process or thread
 * preserving timing updates, action descriptions, and discrete dates.
 */
export function mergeEvents(existing: ExtractedEvent, incoming: ExtractedEvent): ExtractedEvent {
  // Merge source messages avoiding duplicate messageId
  const sourceMap = new Map<string, typeof existing.sourceMessages[0]>();
  [...existing.sourceMessages, ...incoming.sourceMessages].forEach(m => sourceMap.set(m.messageId, m));

  // Merge links avoiding duplicate URLs
  const linkMap = new Map<string, ActionLink>();
  [...existing.links, ...incoming.links].forEach(l => linkMap.set(l.url, l));

  // Combine discrete dates if available
  const datesSet = new Set<string>();
  (existing.allDates || []).forEach(d => datesSet.add(d));
  (incoming.allDates || []).forEach(d => datesSet.add(d));
  const allDates = Array.from(datesSet).sort();

  const isIncomingNewer = new Date(incoming.updatedAt).getTime() >= new Date(existing.updatedAt).getTime();
  const primary = isIncomingNewer ? incoming : existing;
  const secondary = isIncomingNewer ? existing : incoming;

  // Preserve continuous range flags accurately
  const isContinuous = primary.isContinuousRange || secondary.isContinuousRange || false;
  const isDeadline = primary.isDeadline || secondary.isDeadline || false;

  // Preserve the most informative action description
  let combinedDesc = primary.actionDescription || secondary.actionDescription;
  if (primary.actionDescription && secondary.actionDescription && primary.actionDescription !== secondary.actionDescription) {
    if (primary.actionDescription.length >= secondary.actionDescription.length) {
      combinedDesc = primary.actionDescription;
    } else {
      combinedDesc = secondary.actionDescription;
    }
  }

  return {
    ...primary,
    title: cleanEventTitle(primary.title.length >= secondary.title.length ? primary.title : secondary.title),
    company: primary.company || secondary.company || primary.organization || secondary.organization,
    startDate: isContinuous ? (primary.startDate || secondary.startDate) : undefined,
    endDate: isContinuous ? (primary.endDate || secondary.endDate) : undefined,
    date: primary.date || secondary.date,
    time: primary.time || secondary.time,
    deadline: primary.deadline || secondary.deadline,
    isContinuousRange: isContinuous,
    isDeadline,
    allDates: allDates.length > 0 ? allDates : undefined,
    actionRequired: primary.actionRequired || secondary.actionRequired,
    actionDescription: combinedDesc,
    organization: primary.organization || secondary.organization,
    links: Array.from(linkMap.values()),
    sourceMessages: Array.from(sourceMap.values()),
    status: primary.status !== 'unknown' ? primary.status : secondary.status,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString()
  };
}
