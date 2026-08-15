import { ExtractedEvent, EventType, ActionLink } from '../../types/events';
import { ParsedEmailMessage } from '../../types/gmail';
import { parseDateFromEmailText } from './date-parser';
import { extractActionLinks } from '../gmail/links';

/**
 * Strips email reply/forward prefixes, tags, and extraneous whitespace to produce a clean event title.
 */
export function cleanEventTitle(subject: string): string {
  if (!subject) return 'Untitled Event';
  let prev = '';
  let clean = subject.trim();

  while (prev !== clean) {
    prev = clean;
    clean = clean
      .replace(/^(\s*(re|fwd|fw|aw|vs|wg)\s*:\s*)+/i, '')
      .replace(/^\[(external|urgent|action\s+required|important|reminder)\]\s*/i, '')
      .trim();
  }

  return clean || subject;
}

/**
 * Classifies the EventType based on email subject and content keywords.
 */
export function detectEventType(subject: string, body: string): EventType {
  const combined = `${subject} ${body}`.toLowerCase();

  if (/\b(coding\s+round|oa\b|online\s+assessment|hackerrank|codeforces|leetcode|mettl|wheebox)\b/i.test(combined)) {
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
  if (/\b(assessment|test|eval|evaluation|online\s+test|aptitude\s+test)\b/i.test(combined)) {
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
 * Detects if action is urgently required from the recipient.
 */
export function detectActionRequired(subject: string, body: string): { actionRequired: boolean; actionDescription?: string } {
  const combined = `${subject} ${body}`.toLowerCase();

  const actionPhrases = [
    { pattern: /register\s+before|deadline\s+to\s+register|registration\s+closing/i, desc: 'Complete registration before the deadline.' },
    { pattern: /submit\s+your\s+assignment|submission\s+due|upload\s+your/i, desc: 'Submit required coursework or project.' },
    { pattern: /start\s+your\s+test|assessment\s+link\s+active|take\s+the\s+assessment|complete\s+the\s+assessment/i, desc: 'Complete the online test/assessment.' },
    { pattern: /join\s+the\s+interview|interview\s+scheduled|attend\s+the\s+meeting/i, desc: 'Attend scheduled interview or meeting.' },
    { pattern: /action\s+required|mandatory\s+attendance|urgent\s+action/i, desc: 'Immediate action required as per email.' },
    { pattern: /fill\s+the\s+form|fill\s+out\s+this\s+google\s+form/i, desc: 'Fill out the required form.' },
    { pattern: /confirm\s+your\s+attendance|confirm\s+slot/i, desc: 'Confirm your participation slot.' }
  ];

  for (const { pattern, desc } of actionPhrases) {
    if (pattern.test(combined)) {
      return { actionRequired: true, actionDescription: desc };
    }
  }

  if (/\b(due\s+today|due\s+tomorrow|urgent|mandatory|action\s+required)\b/i.test(combined)) {
    return { actionRequired: true, actionDescription: 'Action required before specified deadline.' };
  }

  return { actionRequired: false };
}

/**
 * Extracts organization or company from sender and subject.
 */
export function extractOrganization(senderName: string, subject: string, body: string = ''): string {
  // 1. Check for common company names in subject / sender (e.g. "Sigmoid Analytics", "Cognizant", "Google", "Amazon")
  const textToScan = `${senderName} ${subject} ${body.substring(0, 300)}`;
  const companyMatch = textToScan.match(/\b(Sigmoid(?:\s+Analytics)?|Cognizant|Amazon|Google|Microsoft|Bain(?:\s+&\s+Company)?|Goldman\s+Sachs|McKinsey|Flipkart|Uber|Adobe|Salesforce|TCS|Infosys|Wipro|Accenture|Deloitte|PwC|EY|KPMG)\b/i);
  if (companyMatch) {
    return companyMatch[1].trim();
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
  const combinedText = `${email.subject}\n\n${email.plainText}`;
  const dateResult = parseDateFromEmailText(combinedText, email.timestamp, currentNow);
  const type = detectEventType(email.subject, email.plainText);
  const { actionRequired, actionDescription } = detectActionRequired(email.subject, email.plainText);
  const links = extractActionLinks(email.htmlContent || email.plainText);
  const organization = extractOrganization(email.senderName, email.subject, email.plainText);
  const cleanTitle = cleanEventTitle(email.subject);

  // If it has neither a detected date nor action required nor academic/career event type, it might not be a high-signal event
  if (type === 'other' && !actionRequired && dateResult.status === 'unknown') {
    return null;
  }

  // Use threadId as primary event ID to consolidate email replies automatically
  const eventId = email.threadId ? `thread-${email.threadId}` : `event-${email.id}`;

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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Merges multiple events (e.g. from same thread or identical subject/date)
 * preserving newer updates and consolidating all source references and unique links.
 */
export function mergeEvents(existing: ExtractedEvent, incoming: ExtractedEvent): ExtractedEvent {
  // Merge source messages avoiding duplicate messageId
  const sourceMap = new Map<string, typeof existing.sourceMessages[0]>();
  [...existing.sourceMessages, ...incoming.sourceMessages].forEach(m => sourceMap.set(m.messageId, m));

  // Merge links avoiding duplicate URLs
  const linkMap = new Map<string, ActionLink>();
  [...existing.links, ...incoming.links].forEach(l => linkMap.set(l.url, l));

  // Merge allDates set
  const datesSet = new Set<string>();
  (existing.allDates || []).forEach(d => datesSet.add(d));
  (incoming.allDates || []).forEach(d => datesSet.add(d));
  if (existing.startDate) datesSet.add(existing.startDate);
  if (incoming.startDate) datesSet.add(incoming.startDate);
  if (existing.endDate) datesSet.add(existing.endDate);
  if (incoming.endDate) datesSet.add(incoming.endDate);
  const allDates = Array.from(datesSet).sort();

  const isIncomingNewer = new Date(incoming.updatedAt).getTime() >= new Date(existing.updatedAt).getTime();
  const primary = isIncomingNewer ? incoming : existing;
  const secondary = isIncomingNewer ? existing : incoming;

  const startDate = (allDates.length > 0 ? allDates[0] : primary.startDate || secondary.startDate) || undefined;
  const endDate = (allDates.length > 1 ? allDates[allDates.length - 1] : primary.endDate || secondary.endDate) || undefined;

  return {
    ...primary,
    title: cleanEventTitle(primary.title || secondary.title),
    company: primary.company || secondary.company || primary.organization || secondary.organization,
    startDate,
    endDate,
    date: startDate,
    time: primary.time || secondary.time,
    deadline: primary.deadline || secondary.deadline,
    allDates: allDates.length > 0 ? allDates : undefined,
    actionRequired: primary.actionRequired || secondary.actionRequired,
    actionDescription: primary.actionDescription || secondary.actionDescription,
    organization: primary.organization || secondary.organization,
    links: Array.from(linkMap.values()),
    sourceMessages: Array.from(sourceMap.values()),
    status: primary.status !== 'unknown' ? primary.status : secondary.status,
    updatedAt: new Date().toISOString()
  };
}
