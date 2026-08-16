import { ExtractedEvent, EventType, ProcessStage } from '../../types/events';
import { ParsedEmailMessage } from '../../types/gmail';
import { parseDateFromEmailText, extractTimeFromText, calculateEventStatus } from './date-parser';
import { extractActionLinks, deduplicateActionLinks } from '../gmail/links';

export const CURRENT_SCHEMA_VERSION = 7;

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
 * Classifies the EventType based on semantic specificity and explicit wording in subject and content.
 */
export function detectEventType(subject: string, body: string = ''): EventType {
  const cleanSub = cleanEventTitle(subject).toLowerCase();
  const lowerBody = body.toLowerCase();
  const combined = `${cleanSub} ${lowerBody}`;

  // 1. Nominations / Awards
  if (/\b(nomination|call\s+for\s+nominations|award\s+nomination|nominate)\b/i.test(cleanSub) || /\b(call\s+for\s+nominations)\b/i.test(combined)) {
    return 'nomination';
  }

  // 2. Hackathons / Coding Competitions / Ideathons
  if (/\b(hackathon|ideathon|coding\s+competition|sih\s*20\d\d)\b/i.test(cleanSub) || /\b(internal\s+hackathon|smart\s+india\s+hackathon)\b/i.test(combined)) {
    return 'hackathon';
  }

  // 3. Registrations / Applications / Form Submissions
  if (/\b(registration|register\s+before|registration\s+deadline|apply\s+before|application\s+form|call\s+for\s+applications)\b/i.test(cleanSub)) {
    return 'registration';
  }

  // 4. Specific Technical Assessments / Coding Rounds
  if (/\b(coding\s+round|oa\b|online\s+assessment|technical\s+assessment|hackerrank|codeforces|leetcode|mettl|wheebox|test\s+credentials)\b/i.test(combined)) {
    return 'coding_round';
  }

  // 5. Interviews
  if (/\b(interview|technical\s+round|hr\s+round|interview\s+schedule|discussion\s+round)\b/i.test(cleanSub) || /\b(technical\s+interview|hr\s+interview)\b/i.test(combined)) {
    return 'interview';
  }

  // 6. Pre-Placement Talks & Webinars
  if (/\b(ppt\b|pre[- ]placement\s+talk|presentation\s+session)\b/i.test(cleanSub)) {
    return 'ppt';
  }

  // 7. Academic Quizzes
  if (/\b(pop\s+quiz|quiz)\b/i.test(cleanSub) || /\b(quiz\s+\d|quiz\s+scheduled)\b/i.test(combined)) {
    return 'quiz';
  }

  // 8. Academic Exams
  if (/\b(midterm|endterm|final\s+exam|semester\s+exam|exam\s+schedule|examination)\b/i.test(combined)) {
    return 'exam';
  }

  // 9. General Tests & Assessments
  if (/\b(assessment|test|eval|evaluation|online\s+test|aptitude\s+test|aimcat|nqt)\b/i.test(combined)) {
    return 'assessment';
  }

  // 10. Assignments
  if (/\b(assignment|problem\s+set|homework|lab\s+work|project\s+submission)\b/i.test(combined)) {
    return 'assignment';
  }

  // 11. Submissions
  if (/\b(submission|submit\s+by|turn\s+in)\b/i.test(combined)) {
    return 'submission';
  }

  // 12. General Registrations in body
  if (/\b(registration|register\s+before|rsvp|fill\s+form|apply\s+now)\b/i.test(combined)) {
    return 'registration';
  }

  // 13. Internships
  if (/\b(internship|summer\s+intern|fall\s+intern|co-op)\b/i.test(combined)) {
    return 'internship';
  }

  // 14. Placements & Campus Drives
  if (/\b(placement|campus\s+drive|recruitment|job\s+offer|hiring\s+process|shortlist)\b/i.test(combined)) {
    return 'placement';
  }

  // 15. Deadlines
  if (/\b(deadline|due\s+date|last\s+date|closing\s+date)\b/i.test(combined)) {
    return 'deadline';
  }

  return 'other';
}

/**
 * Detects if action is required from the recipient and extracts operational details.
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
      parts.push(`The test will be active ${activeWindowMatch[1].trim()}`);
    }
    if (linkShareMatch) {
      parts.push(`the link is expected to be shared by ${linkShareMatch[1].trim()}`);
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
 * Extracts organization or company generically from subject structure, sender, and content.
 */
export function extractOrganization(senderName: string, subject: string, _body: string = ''): string {
  const cleanSub = cleanEventTitle(subject);

  // 1. Structured subject delimiters: "Campus Details | <Company> | ..." or "Campus Drive: <Company>"
  const pipeMatch = cleanSub.match(/^(?:campus\s+details?|campus\s+drive|recruitment\s+drive|placement\s+details?)\s*\|\s*([^|]+?)(?:\s*\||$)/i);
  if (pipeMatch && pipeMatch[1]) {
    const org = pipeMatch[1].trim();
    if (org && !/^\d/.test(org) && org.length > 1) {
      return org;
    }
  }

  const bracketMatch = cleanSub.match(/^\[([^\]]+)\]/);
  if (bracketMatch && bracketMatch[1]) {
    const org = bracketMatch[1].trim();
    if (org && !/^(external|urgent|important|reminder|action required)$/i.test(org)) {
      return org;
    }
  }

  const opportunityMatch = cleanSub.match(/(?:Opportunity\s*-\s*|Details\s+for\s+|Drive\s+by\s+)([A-Z0-9&.' -]{2,30})/i);
  if (opportunityMatch && opportunityMatch[1]) {
    return opportunityMatch[1].trim();
  }

  // 2. Pattern matching against subject text
  const orgInSub = cleanSub.match(/\b(Infoedge(?:\s+India(?:\s+Ltd\.?)?)?|Info\s*Edge|Naukri|Sigmoid(?:\s+Analytics)?|Cognizant|IDFC(?:\s+First)?\s+Bank|Dr\.?\s*Reddy'?s|BNP\s+Paribas|TCS|Infosys|Wipro|Accenture|Deloitte|PwC|EY|KPMG|Amazon|Google|Microsoft|Flipkart|Uber|Adobe|Salesforce|TIME|AIMCAT)\b/i);
  if (orgInSub) {
    let org = orgInSub[1].trim();
    if (/^info\s*edge/i.test(org) || /^naukri/i.test(org)) {
      org = 'Infoedge India Ltd.';
    }
    return org;
  }

  // 3. Sender Name fallback (excluding email addresses and generic tools like Teams/Zoom/Forms unless truly sender)
  if (senderName && !senderName.includes('@') && !/^(microsoft\s+teams|google\s+forms|zoom\s+video)$/i.test(senderName.trim())) {
    const cleanSender = senderName.replace(/^["']|["']$/g, '').trim();
    if (cleanSender) return cleanSender;
  }

  return '';
}

/**
 * Extracts discrete recruitment process stages (PPT, Assessment, Interview, Registration) from table rows, lists, or text blocks.
 */
export function extractProcessStages(
  subject: string,
  body: string,
  emailTimestamp: number,
  nowDate: Date = new Date()
): ProcessStage[] {
  const stages: ProcessStage[] = [];
  const text = `${subject}\n\n${body}`;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const stageKeywordMatchers = [
    {
      type: 'ppt' as EventType,
      keywordRegex: /\b(PPT|Pre[- ]Placement\s+Talk|Presentation\s+Session)\b/i
    },
    {
      type: 'assessment' as EventType,
      keywordRegex: /\b(Technical\s+Assessment|Online\s+Assessment|OA\b|Coding\s+Round|Coding\s+Test|Online\s+Test|Aptitude\s+Test|Assessment)\b/i
    },
    {
      type: 'interview' as EventType,
      keywordRegex: /\b(Technical\s+Interview|HR\s+Interview|Interview|Discussion\s+Round)\b/i
    },
    {
      type: 'registration' as EventType,
      keywordRegex: /\b(Registration|Registration\s+Deadline|Last\s+Date\s+to\s+Apply|Apply\s+Before|Nomination)\b/i
    }
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { type, keywordRegex } of stageKeywordMatchers) {
      const match = line.match(keywordRegex);
      if (match) {
        const stageName = match[0].trim();

        // Check if current line has enough information or if table cells are on consecutive lines
        let contextText = line;
        if (contextText.split(/\s+/).length <= 3 && i + 1 < lines.length) {
          contextText = lines.slice(i, i + 5).join(' ');
        }

        const isTBD = /\b(yet\s+to\s+decide|tbd|to\s+be\s+decided|to\s+be\s+announced|tba|not\s+decided)\b/i.test(contextText);

        if (isTBD) {
          if (!stages.some(s => s.type === type)) {
            stages.push({
              name: stageName,
              type,
              status: 'tbd',
              details: 'Yet to decide'
            });
          }
        } else {
          const parsed = parseDateFromEmailText(contextText, '', emailTimestamp, nowDate);
          const stageTime = parsed.time || extractTimeFromText(contextText);
          const stageLinks = extractActionLinks(contextText);

          if (parsed.date || stageTime) {
            if (!stages.some(s => s.type === type && s.date === parsed.date)) {
              stages.push({
                name: stageName,
                type,
                date: parsed.date,
                time: stageTime,
                status: 'scheduled',
                details: line,
                links: stageLinks.length > 0 ? stageLinks : undefined
              });
            }
          }
        }
      }
    }
  }

  return stages;
}

/**
 * Deterministically extracts structured event from a parsed Gmail message.
 */
export function extractEventFromEmail(email: ParsedEmailMessage, nowDate: Date = new Date()): ExtractedEvent | null {
  const cleanTitle = cleanEventTitle(email.subject);
  const type = detectEventType(email.subject, email.plainText);
  const organization = extractOrganization(email.senderName, email.subject, email.plainText);
  const { actionRequired, actionDescription } = detectActionRequired(email.subject, email.plainText);

  // Extract structured dates
  const dateResult = parseDateFromEmailText(email.plainText, email.subject, email.timestamp, nowDate);
  const allDates = dateResult.allDates || (dateResult.date ? [dateResult.date] : []);

  // Extract multi-stage process stages
  const stages = extractProcessStages(email.subject, email.plainText, email.timestamp, nowDate);

  // If no date found, no stages found, and not action required, ignore non-event email
  if (!dateResult.date && !dateResult.startDate && !dateResult.deadline && stages.length === 0 && !actionRequired) {
    return null;
  }

  const primaryDate = dateResult.date || dateResult.startDate || (stages.length > 0 ? stages[0].date : undefined);
  const primaryTime = dateResult.time || (stages.length > 0 ? stages[0].time : undefined);

  // Dynamic Status evaluation
  const status = calculateEventStatus(
    primaryDate,
    nowDate,
    dateResult.endDate,
    dateResult.isContinuousRange,
    allDates,
    stages
  );

  // Extract and sanitize actionable links
  const links = extractActionLinks(email.plainText);

  // Generate normalized deterministic ID
  const normTitle = normalizeTitleForDeduplication(cleanTitle);
  const orgKey = (organization || 'general').toLowerCase().replace(/[^a-z0-9]/g, '');
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
    date: primaryDate,
    time: primaryTime,
    deadline: dateResult.deadline,
    isDeadline: dateResult.isDeadline,
    isContinuousRange: dateResult.isContinuousRange,
    allDates: allDates.length > 0 ? allDates : undefined,
    stages: stages.length > 0 ? stages : undefined,
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
    status,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Merges multiple emails belonging to the same process or thread
 * preserving timing updates, action descriptions, discrete dates, and multi-stage details.
 */
export function mergeEvents(existing: ExtractedEvent, incoming: ExtractedEvent): ExtractedEvent {
  // Merge source messages avoiding duplicate messageId
  const sourceMap = new Map<string, typeof existing.sourceMessages[0]>();
  [...existing.sourceMessages, ...incoming.sourceMessages].forEach(m => sourceMap.set(m.messageId, m));

  // Merge links using semantic deduplication
  const mergedLinks = deduplicateActionLinks([...existing.links, ...incoming.links]);

  // Combine discrete dates if available
  const datesSet = new Set<string>();
  (existing.allDates || []).forEach(d => datesSet.add(d));
  (incoming.allDates || []).forEach(d => datesSet.add(d));
  const allDates = Array.from(datesSet).sort();

  // Combine and update stages
  const stageMap = new Map<string, ProcessStage>();
  (existing.stages || []).forEach(s => stageMap.set(s.type, s));
  (incoming.stages || []).forEach(s => {
    const prev = stageMap.get(s.type);
    if (!prev) {
      stageMap.set(s.type, s);
    } else {
      stageMap.set(s.type, {
        ...prev,
        ...s,
        date: s.date || prev.date,
        time: s.time || prev.time,
        status: s.status || prev.status,
        details: s.details && s.details.length >= (prev.details || '').length ? s.details : prev.details,
        links: (s.links && s.links.length > 0) ? s.links : prev.links
      });
    }
  });

  const isIncomingNewer = new Date(incoming.updatedAt).getTime() >= new Date(existing.updatedAt).getTime();
  const primary = isIncomingNewer ? incoming : existing;
  const secondary = isIncomingNewer ? existing : incoming;

  // Preserve strong organization name (e.g. from subject)
  const organization = (existing.organization && !/^(microsoft\s+teams|google|zoom)$/i.test(existing.organization))
    ? existing.organization
    : (incoming.organization || existing.organization);

  // Preserve cleaner action description without repetitive prepends
  let actionDescription = primary.actionDescription || secondary.actionDescription;
  if (primary.actionDescription && secondary.actionDescription && primary.actionDescription !== secondary.actionDescription) {
    if (!primary.actionDescription.includes(secondary.actionDescription) && !secondary.actionDescription.includes(primary.actionDescription)) {
      actionDescription = `${primary.actionDescription} ${secondary.actionDescription}`.trim();
    }
  }

  const stagesList = Array.from(stageMap.values());

  return {
    ...primary,
    organization,
    company: organization || primary.company,
    startDate: primary.startDate || secondary.startDate,
    endDate: primary.endDate || secondary.endDate,
    date: primary.date || secondary.date,
    time: primary.time || secondary.time,
    deadline: primary.deadline || secondary.deadline,
    isDeadline: primary.isDeadline || secondary.isDeadline,
    isContinuousRange: primary.isContinuousRange || secondary.isContinuousRange,
    allDates: allDates.length > 0 ? allDates : undefined,
    stages: stagesList.length > 0 ? stagesList : undefined,
    actionRequired: primary.actionRequired || secondary.actionRequired,
    actionDescription,
    links: mergedLinks,
    sourceMessages: Array.from(sourceMap.values()),
    status: calculateEventStatus(
      primary.date || secondary.date,
      new Date(),
      primary.endDate || secondary.endDate,
      primary.isContinuousRange || secondary.isContinuousRange,
      allDates,
      stagesList
    ),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString()
  };
}
