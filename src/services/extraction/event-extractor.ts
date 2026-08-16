import { ExtractedEvent, EventType, ProcessStage } from '../../types/events';
import { ParsedEmailMessage } from '../../types/gmail';
import { parseDateFromEmailText, extractTimeFromText, calculateEventStatus } from './date-parser';
import { extractActionLinks, deduplicateActionLinks } from '../gmail/links';

export const CURRENT_SCHEMA_VERSION = 10;

/**
 * Checks if a sender name represents a university placement intermediary/cell
 * rather than the actual hiring employer.
 */
export function isPlacementIntermediary(name: string): boolean {
  if (!name) return false;
  return /\b(placement|placements|tnp|t&p|career\s+services|placement\s+cell|placement\s+office|cdc|training\s+and\s+placement|campus\s+relations|thapar\s+placements|placement\s+coordinator)\b/i.test(name);
}

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
      .replace(/^\[(external|urgent|action\s+required|important|reminder|placement|campus\s+drive|internship)\]\s*/i, '')
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
    .replace(/\b(is\s+live|invites\s+you\s+to\s+take|invitation\s+to\s+take|invitation\s+for|details?|campus\s+details?|hiring\s+process|selection\s+process|recruitment\s+process)\b/gi, '')
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
  if (/\b(coding\s+round|oa\b|online\s+assessment|technical\s+assessment|hackerrank|codeforces|leetcode|mettl|wheebox|test\s+credentials|online\s+test)\b/i.test(combined)) {
    return 'coding_round';
  }

  // 5. Interviews
  if (/\b(interview|interviews|technical\s+round|hr\s+round|interview\s+schedule|discussion\s+round)\b/i.test(cleanSub) || /\b(technical\s+interview|hr\s+interview|personal\s+interview)\b/i.test(combined)) {
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
 * Normalizes time string into standard format e.g. "4:00 PM" or "5:30 PM".
 */
export function standardizeTimeString(raw: string): string {
  const clean = raw.trim().replace(/[*_~#\\]+/g, '').trim();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return clean;

  const hours = match[1];
  const minutes = match[2] || '00';
  const period = (match[3] || '').toUpperCase();

  return period ? `${hours}:${minutes} ${period}` : `${hours}:${minutes}`;
}

/**
 * Normalizes operational action text in an IDEMPOTENT way:
 * normalizeActionText(normalizeActionText(text)) === normalizeActionText(text).
 */
export function normalizeActionText(text: string): string {
  if (!text) return '';

  let clean = text
    // 1. Strip markdown artifacts e.g. *, _, ~, #, \
    .replace(/[*_~#\\]+/g, '')
    // 2. Normalize repeated words e.g. "between between" -> "between", "active active" -> "active"
    .replace(/\b(between|from|active|the|test|is|link|shared|by)\s+\1\b/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  // 3. Normalize time ranges: "between 4 pm - 5:30 pm" -> "between 4:00 PM and 5:30 PM"
  clean = clean.replace(
    /\b(?:between|from)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to|and)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi,
    (_match, t1, t2) => {
      const formatted1 = standardizeTimeString(t1);
      const formatted2 = standardizeTimeString(t2);
      return `between ${formatted1} and ${formatted2}`;
    }
  );

  // 4. Normalize single time targets: "by 3:50PM" -> "by 3:50 PM"
  clean = clean.replace(
    /\bby\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi,
    (_match, t) => `by ${standardizeTimeString(t)}`
  );

  // 5. Clean spaces before punctuation
  clean = clean
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();

  // 6. Clean consecutive duplicate words again if formed after replacements
  clean = clean.replace(/\b(between|from|active|the|test|is|link|shared|by)\s+\1\b/gi, '$1');

  // 7. Ensure trailing period
  if (clean && !/[.!?]$/.test(clean)) {
    clean = `${clean}.`;
  }

  return clean;
}

/**
 * Detects if action is required from the recipient and extracts operational details cleanly.
 */
export function detectActionRequired(subject: string, body: string): { actionRequired: boolean; actionDescription?: string } {
  const combined = `${subject}\n${body}`;
  const lower = combined.toLowerCase();

  // 1. Check for specific operational timing details in email
  const activeWindowMatch = combined.match(/\b(?:test|assessment)\s+will\s+be\s+active\s+(?:between|from)?\s*([^.\n]+)/i);
  const linkShareMatch = combined.match(/\blink\s+will\s+be\s+shared\s+by\s*([^.\n]+)/i);

  if (activeWindowMatch || linkShareMatch) {
    const parts: string[] = [];
    if (activeWindowMatch) {
      const rawWindow = activeWindowMatch[1].trim().replace(/[*_~#\\]+/g, '').trim();
      const normRange = rawWindow.replace(/^between\s+/i, '').replace(/^from\s+/i, '');
      const rangeText = normalizeActionText(`between ${normRange}`).replace(/\.$/, '');
      parts.push(`The test will be active ${rangeText}`);
    }
    if (linkShareMatch) {
      const rawShare = linkShareMatch[1].trim().replace(/[*_~#\\]+/g, '').trim();
      const normShare = standardizeTimeString(rawShare);
      parts.push(`the link is expected to be shared by ${normShare}`);
    }
    const rawResult = `${parts.join(', and ')}.`;
    return {
      actionRequired: true,
      actionDescription: normalizeActionText(rawResult)
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
 * Checks if a string is a personal individual name (e.g. "SAIF DILAVAR NALBAND", "John Doe").
 */
export function isPersonalName(name: string): boolean {
  if (!name) return false;
  const clean = name.trim();

  // Known organization keywords that indicate this is NOT a personal name
  const orgKeywords = /\b(team|cell|office|university|college|department|centre|center|institute|club|committee|board|society|authority|academy|portal|hr|placement|placements|tnp|admin|support|desk|services|labs|foundation|education|careers|corp|corporation|inc|ltd|pvt|bank|technologies|solutions)\b/i;
  if (orgKeywords.test(clean)) {
    return false;
  }

  // Standard personal names: 2 to 4 capitalized words of letters/dots without org keywords
  const words = clean.split(/\s+/);
  if (words.length >= 2 && words.length <= 4 && words.every(w => /^[A-Z][a-zA-Z.'-]*$/.test(w) || /^[A-Z]+$/.test(w))) {
    return true;
  }

  return false;
}

/**
 * Cleans track, stage descriptors, and extra words from raw organization strings.
 * e.g. "Sigmoid Data Engineering Track PPT & OA" -> "Sigmoid"
 */
export function cleanOrganizationName(rawOrg: string): string {
  if (!rawOrg) return '';
  let org = rawOrg.trim();

  // Strip track and stage descriptors
  org = org
    .replace(/\b(?:data|software|cloud|full\s*stack|ai|ml|system|business)\s+engineering\s+track\b/gi, '')
    .replace(/\b[a-z0-9&.' -]+\s+track\b/gi, '')
    .replace(/\b(?:ppt\s*(?:&|and)\s*oa|ppt|oa|online\s+assessment|technical\s+assessment|hiring\s+process|campus\s+drive|recruitment\s+drive|internship\s+drive|internship\s+process|selection\s+process)\b/gi, '')
    .replace(/[-|&,:]+$/, '')
    .replace(/^[-|&,:]+/, '')
    .trim();

  return org || rawOrg.trim();
}

/**
 * Extracts organization or company generically from subject structure, sender, and content,
 * properly distinguishing placement intermediaries (e.g. Placements Thapar) from actual hiring companies (e.g. Bain & Company).
 */
export function extractOrganization(senderName: string, subject: string, body: string = ''): string {
  const cleanSub = cleanEventTitle(subject);
  const combined = `${cleanSub}\n${body}`;

  // 1. Structured subject delimiters: "Campus Details | <Company> | ..." or "Campus Drive: <Company>"
  const pipeMatch = cleanSub.match(/^(?:campus\s+details?|campus\s+drive|recruitment\s+drive|placement\s+details?|internship\s+drive)\s*\|\s*([^|]+?)(?:\s*\||$)/i);
  if (pipeMatch && pipeMatch[1]) {
    const rawOrg = pipeMatch[1].trim();
    if (rawOrg && !/^\d/.test(rawOrg) && rawOrg.length > 1 && !/^(microsoft\s+teams|google|zoom)$/i.test(rawOrg)) {
      return cleanOrganizationName(rawOrg);
    }
  }

  const bracketMatch = cleanSub.match(/^\[([^\]]+)\]/);
  if (bracketMatch && bracketMatch[1]) {
    const rawOrg = bracketMatch[1].trim();
    if (rawOrg && !/^(external|urgent|important|reminder|action required|placement|internship)$/i.test(rawOrg) && !/^(microsoft\s+teams|google|zoom)$/i.test(rawOrg)) {
      return cleanOrganizationName(rawOrg);
    }
  }

  const opportunityMatch = cleanSub.match(/(?:Opportunity\s*-\s*|Details\s+for\s+|Drive\s+by\s+|Internship\s+at\s+|Hiring\s+for\s+|Interview\s+at\s+)([A-Z0-9&.' -]{2,30})/i);
  if (opportunityMatch && opportunityMatch[1]) {
    return cleanOrganizationName(opportunityMatch[1].trim());
  }

  // 2. Recognizable hiring employers in subject (High Confidence)
  const employerRegex = /\b(Bain\s+(?:&|and)\s+Company|Bain\s*&\s*Co\.?|Bain|McKinsey(?:\s+(?:&|and)\s+Company)?|BCG|Boston\s+Consulting\s+Group|Infoedge(?:\s+India(?:\s+Ltd\.?)?)?|Info\s*Edge|Naukri|Sigmoid(?:\s+Analytics)?|Cognizant|IDFC(?:\s+First)?\s+Bank|Dr\.?\s*Reddy'?s|BNP\s+Paribas|Goldman\s+Sachs|Morgan\s+Stanley|JPMorgan|TCS|Infosys|Wipro|Accenture|Deloitte|PwC|EY|KPMG|Amazon|Google|Microsoft|Flipkart|Uber|Adobe|Salesforce|Qualcomm|Cisco|Oracle|Intel|Nvidia|Apple|Samsung|TIME|AIMCAT)\b/i;

  const orgInSub = cleanSub.match(employerRegex);
  if (orgInSub) {
    let org = orgInSub[1].trim();
    if (/^info\s*edge/i.test(org) || /^naukri/i.test(org)) {
      org = 'Infoedge India Ltd.';
    } else if (/^bain/i.test(org)) {
      org = 'Bain & Company';
    } else if (/^mckinsey/i.test(org)) {
      org = 'McKinsey & Company';
    }
    return cleanOrganizationName(org);
  }

  // 3. Recognizable hiring employer in body content (e.g. "Bain & Company is visiting campus")
  const orgInBody = body.match(employerRegex);
  if (orgInBody) {
    let org = orgInBody[1].trim();
    if (/^bain/i.test(org)) {
      org = 'Bain & Company';
    }
    return cleanOrganizationName(org);
  }

  // 4. Check institutional competitions/awards in subject (e.g. Smart India Hackathon, VC Excellence Award)
  if (/\b(sih\s*20\d\d|smart\s+india\s+hackathon)\b/i.test(combined)) {
    return 'Smart India Hackathon';
  }

  // Check specific University/Institution names from body/header/subject before falling back to generic "University"
  if (/\b(vc['’]?s\s+excellence\s+award|vice\s+chancellor)\b/i.test(combined)) {
    const uniMatch = combined.match(/\b((?:[A-Z][a-zA-Z.'&]+\s+){1,6}(?:University|Institute of Technology|College of Engineering|Deemed University))\b/);
    if (uniMatch && uniMatch[1]) {
      return uniMatch[1].trim();
    }
    return 'Vice Chancellor Office';
  }

  // 5. Sender Name fallback ONLY if it is not a personal name and not generic platform
  if (senderName && !senderName.includes('@')) {
    const cleanSender = senderName.replace(/^["']|["']$/g, '').trim();
    if (cleanSender && !isPersonalName(cleanSender) && !/^(microsoft\s+teams|google\s+forms|zoom\s+video)$/i.test(cleanSender)) {
      return cleanOrganizationName(cleanSender);
    }
  }

  return '';
}

/**
 * Extracts discrete recruitment process stages (PPT, Assessment, Interview, Registration)
 * from table rows, lists, bullet points, or structured text blocks.
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
      keywordRegex: /\b(Pre[- ]Placement\s+Talk|PPT\b|Presentation\s+Session|Company\s+Presentation)\b/i,
      defaultName: 'Pre-Placement Talk (PPT)'
    },
    {
      type: 'assessment' as EventType,
      keywordRegex: /\b(Online\s+Assessment|Technical\s+Assessment|Online\s+Test|OA\b|Coding\s+Round|Coding\s+Test|Aptitude\s+Test|Assessment)\b/i,
      defaultName: 'Online Assessment'
    },
    {
      type: 'interview' as EventType,
      keywordRegex: /\b(Interviews?|Technical\s+Interview|HR\s+Interview|Personal\s+Interview|Discussion\s+Round)\b/i,
      defaultName: 'Interviews'
    },
    {
      type: 'registration' as EventType,
      keywordRegex: /\b(Registration|Registration\s+Deadline|Last\s+Date\s+to\s+Apply|Apply\s+Before|Nomination)\b/i,
      defaultName: 'Registration'
    }
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { type, keywordRegex, defaultName } of stageKeywordMatchers) {
      const match = line.match(keywordRegex);
      if (match) {
        let stageName = match[0].trim();
        if (stageName.toUpperCase() === 'PPT') stageName = 'Pre-Placement Talk (PPT)';
        else if (stageName.toUpperCase() === 'OA') stageName = 'Online Assessment';

        // Gather context: current line plus subsequent 3 lines if indented or structured
        let contextBlock = line;
        let j = i + 1;
        while (j < lines.length && j <= i + 4) {
          const nextL = lines[j];
          const isSubTimeLine = /^(?:Assessment|Test|Registration|Interview|PPT)\s*:\s*\d{1,2}/i.test(nextL);
          // If next line starts with a distinct stage keyword from matchers and is not a sub-time line, stop gathering
          if (!isSubTimeLine && stageKeywordMatchers.some(m => m.keywordRegex.test(nextL) && m.type !== type)) {
            break;
          }
          contextBlock += ` ${nextL}`;
          j++;
        }

        const isTBD = /\b(yet\s+to\s+decide|tbd|to\s+be\s+decided|to\s+be\s+announced|tba|not\s+decided)\b/i.test(contextBlock);

        if (isTBD) {
          if (!stages.some(s => s.type === type)) {
            stages.push({
              name: stageName || defaultName,
              type,
              status: 'tbd',
              details: 'Yet to decide'
            });
          }
        } else {
          const parsed = parseDateFromEmailText(contextBlock, '', emailTimestamp, nowDate);
          const explicitAssessmentTimeMatch = contextBlock.match(/\bAssessment\s*:\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
          let stageTime = parsed.time || extractTimeFromText(contextBlock);
          if (type === 'assessment' && explicitAssessmentTimeMatch && /\d/.test(explicitAssessmentTimeMatch[1])) {
            stageTime = standardizeTimeString(explicitAssessmentTimeMatch[1]);
          }
          const stageLinks = extractActionLinks(contextBlock);

          // Extract extra operational notes (e.g. "Registration: 5:00 PM to 5:30 PM", "from 10:00 AM onwards")
          let extraDetails = '';
          const onwardsMatch = contextBlock.match(/\bfrom\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+onwards\b/i);
          if (onwardsMatch) {
            extraDetails = onwardsMatch[0].trim();
          }
          const regWindowMatch = contextBlock.match(/\bRegistration\s*:\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:to|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i);
          if (regWindowMatch) {
            extraDetails = extraDetails ? `${extraDetails}, ${regWindowMatch[0]}` : regWindowMatch[0];
          }

          if (parsed.date || stageTime) {
            // For registration stage, require an explicit calendar date or deadline so time-only sub-lines (e.g. "Registration: 5:00 PM to 5:30 PM") are not misclassified as separate stages
            if (type === 'registration' && !parsed.date && !parsed.startDate && !parsed.deadline) {
              continue;
            }

            const existingStage = stages.find(s => s.type === type && (s.date === parsed.date || !s.date || !parsed.date));
            if (existingStage) {
              if (stageTime && (!existingStage.time || explicitAssessmentTimeMatch)) {
                existingStage.time = stageTime;
              }
              if (parsed.date && !existingStage.date) {
                existingStage.date = parsed.date;
              }
              if (extraDetails && !existingStage.details?.includes(extraDetails)) {
                existingStage.details = existingStage.details ? `${existingStage.details}, ${extraDetails}` : extraDetails;
              }
            } else {
              stages.push({
                name: stageName || defaultName,
                type,
                date: parsed.date,
                time: stageTime,
                status: 'scheduled',
                details: extraDetails || line,
                links: stageLinks.length > 0 ? stageLinks : undefined
              });
            }
          }
        }
      }
    }
  }

  // If subject explicitly mentions multiple stages e.g. "Sigmoid ... PPT & OA Online Assessment" and no stages were extracted from body table
  if (stages.length === 0 && /\bppt\b/i.test(subject) && /\b(?:oa|assessment|test)\b/i.test(subject)) {
    const parsed = parseDateFromEmailText(subject, body, emailTimestamp, nowDate);
    stages.push({
      name: 'Pre-Placement Talk (PPT)',
      type: 'ppt',
      status: 'scheduled',
      date: parsed.date || parsed.startDate,
      time: parsed.time
    });
    stages.push({
      name: 'Online Assessment (OA)',
      type: 'assessment',
      status: 'scheduled',
      date: parsed.endDate || parsed.date || parsed.startDate,
      time: parsed.time
    });
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
  const dateResult = parseDateFromEmailText(email.subject, email.plainText, email.timestamp, nowDate);
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

  // Extract and sanitize actionable links with strict provenance
  const links = extractActionLinks(email.plainText);

  // Generate unique deterministic ID tied to thread or message
  const eventId = email.threadId
    ? `thread-${email.threadId}`
    : `msg-${email.id}`;

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

  // Preserve strong non-intermediary organization name
  let organization = existing.organization;
  if (!organization || isPlacementIntermediary(organization)) {
    organization = incoming.organization || existing.organization;
  }

  // Semantic sentence-level deduplication for actionDescription
  const sentenceSet = new Set<string>();
  const rawSentences = `${existing.actionDescription || ''} ${incoming.actionDescription || ''}`
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const sentence of rawSentences) {
    const normalized = normalizeActionText(sentence);
    if (normalized && !Array.from(sentenceSet).some(existing => existing.includes(normalized) || normalized.includes(existing))) {
      sentenceSet.add(normalized);
    }
  }

  const combinedActionDesc = Array.from(sentenceSet).join(' ');

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
    actionDescription: combinedActionDesc ? normalizeActionText(combinedActionDesc) : undefined,
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
