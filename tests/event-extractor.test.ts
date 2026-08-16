import { describe, it, expect } from 'vitest';
import {
  detectEventType,
  detectActionRequired,
  extractEventFromEmail,
  cleanEventTitle,
  normalizeTitleForDeduplication,
  extractProcessStages,
  extractOrganization,
  normalizeActionText,
  isPersonalName
} from '../src/services/extraction/event-extractor';
import { deduplicateEvents } from '../src/storage/local-search';
import { generateLocalDeterministicResponse } from '../src/services/ai/local-responder';
import { parseQueryConstraints } from '../src/services/retrieval/intent';
import { formatEventSemanticDate } from '../src/shared/utils';
import { ParsedEmailMessage } from '../src/types/gmail';

describe('Event Extractor & Deduplication', () => {
  const fixedAug16 = new Date('2026-08-16T10:00:00Z');

  it('PART 1 CLASSIFICATION: Classifies nominations, hackathons, registrations, assessments accurately', () => {
    // 1. Call for Nominations -> nomination
    expect(detectEventType("Call for Nominations – VC's Excellence Award (2025–26) for Teaching Staff - Step I", 'Please submit your nomination before Aug 30.'))
      .toBe('nomination');

    // 2. Registration for Internal Hackathon -> hackathon
    expect(detectEventType('Registration for Internal Hackathon for SIH 2026', 'Team presentation and project submission guidelines'))
      .toBe('hackathon');

    // 3. Technical Assessment -> coding_round / assessment
    expect(detectEventType('Campus Details | Infoedge India Ltd. - Technical Assessment', 'Your assessment will be held on HackerRank'))
      .toBe('coding_round');

    // 4. Pre-Placement Talk -> ppt
    expect(detectEventType('Pre-Placement Talk: Cognizant Ace Frontier', 'Join meeting session on Teams'))
      .toBe('ppt');

    // 5. Interview Schedule -> interview
    expect(detectEventType('Interview Schedule: Goldman Sachs Technical Round', 'Join interview call'))
      .toBe('interview');
  });

  it('PART 4 SENDER NAME VS ORG: Rejects personal sender name (e.g. SAIF DILAVAR NALBAND) and extracts context org', () => {
    expect(isPersonalName('SAIF DILAVAR NALBAND')).toBe(true);
    expect(isPersonalName('John Doe')).toBe(true);
    expect(isPersonalName('Placement Team')).toBe(false);
    expect(isPersonalName('Dr. Reddy\'s Campus Team')).toBe(false);

    const sihOrg = extractOrganization(
      'SAIF DILAVAR NALBAND <saif@univ.edu>',
      'Registration for Internal Hackathon for SIH 2026',
      'Please fill out the team nomination details for Smart India Hackathon 2026'
    );
    expect(sihOrg).toBe('Smart India Hackathon');
    expect(sihOrg).not.toContain('SAIF');
  });

  it('PART 5 COMPANY EXTRACTION: Extracts company cleanly without being polluted by Microsoft Teams in body', () => {
    const org = extractOrganization(
      'Placement Cell <tnp@univ.edu>',
      'Campus Details | IDFC Bank | 14th, 17th & 19th August 2026',
      'Please join the briefing on Microsoft Teams at https://teams.microsoft.com'
    );
    expect(org).toBe('IDFC Bank');
    expect(org).not.toBe('Microsoft');
  });

  it('PART 6 ACTION TEXT NORMALIZATION: Formats operational times cleanly without markdown artifacts or spaces', () => {
    const rawMalformed = 'The test will be active between 4 pm - 5:30 pm *, and the link is expected to be shared by 3:50PM.';
    const normalized = normalizeActionText(rawMalformed);
    expect(normalized).toBe('The test will be active between 4:00 PM and 5:30 PM, and the link is expected to be shared by 3:50 PM.');
  });

  it('PART 5 ACTIVE DATE-RANGE UI WORDING: Formats continuous active window clearly on active dates', () => {
    const aimcatEmail: ParsedEmailMessage = {
      id: 'msg-aimcat-1',
      threadId: 'th-aimcat',
      subject: 'AIMCAT 2714 Test Window Starts from Aug 15 to Aug 19',
      sender: 'TIME Institute <support@time4education.com>',
      senderName: 'TIME Institute',
      senderEmail: 'support@time4education.com',
      recipient: 'students@univ.edu',
      date: '2026-08-14T08:00:00Z',
      timestamp: new Date('2026-08-14T08:00:00Z').getTime(),
      snippet: 'Take your test anytime between Aug 15 and Aug 19',
      plainText: 'AIMCAT 2714 is live from Aug 15 to Aug 19, 2026. Take test at https://time4education.com/start-test?id=2714',
      links: [{ text: 'Start Test', href: 'https://time4education.com/start-test?id=2714' }],
      labels: ['INBOX']
    };

    const ev = extractEventFromEmail(aimcatEmail, fixedAug16)!;
    expect(ev).toBeDefined();
    expect(ev.isContinuousRange).toBe(true);

    // On Aug 16 (active day): Card must say "Test window active until Aug 19, 2026"
    const displayLabel = formatEventSemanticDate(ev, fixedAug16);
    expect(displayLabel).toBe('Test window active until Aug 19, 2026');
  });

  it('PART 1 & 8 CROSS-EVENT LEAKAGE: Unrelated Unstop reminder does NOT merge or steal links from Adobe Hackathon on Unstop', () => {
    const adobeEmail: ParsedEmailMessage = {
      id: 'msg-adobe-unstop',
      threadId: 'th-adobe-1',
      subject: 'Adobe Gensolve Hackathon is LIVE on Unstop',
      sender: 'Adobe Careers <careers@adobe.com>',
      senderName: 'Adobe Careers',
      senderEmail: 'careers@adobe.com',
      recipient: 'student@univ.edu',
      date: '2026-08-10T10:00:00Z',
      timestamp: new Date('2026-08-10T10:00:00Z').getTime(),
      snippet: 'Register for Adobe Gensolve Hackathon',
      plainText: 'Adobe Gensolve is now live. Register at https://unstop.com/competitions/adobe-gensolve-2026 before Aug 25.',
      links: [{ text: 'Register on Unstop', href: 'https://unstop.com/competitions/adobe-gensolve-2026' }],
      labels: ['INBOX']
    };

    const unstopReminderEmail: ParsedEmailMessage = {
      id: 'msg-unstop-newsletter',
      threadId: 'th-unstop-general-2',
      subject: 'Weekly Reminder: Complete your profile and explore opportunities on Unstop',
      sender: 'Unstop <newsletter@unstop.com>',
      senderName: 'Unstop',
      senderEmail: 'newsletter@unstop.com',
      recipient: 'student@univ.edu',
      date: '2026-08-12T10:00:00Z',
      timestamp: new Date('2026-08-12T10:00:00Z').getTime(),
      snippet: 'Weekly opportunities reminder',
      plainText: 'Register for upcoming events before Aug 28, 2026 at https://unstop.com/',
      links: [{ text: 'Explore Unstop', href: 'https://unstop.com/' }],
      labels: ['INBOX']
    };

    const adobeEv = extractEventFromEmail(adobeEmail, fixedAug16)!;
    const unstopEv = extractEventFromEmail(unstopReminderEmail, fixedAug16)!;

    const deduped = deduplicateEvents([adobeEv, unstopEv]);

    // MUST remain 2 completely distinct events
    expect(deduped.length).toBe(2);

    const foundAdobe = deduped.find(e => e.company === 'Adobe');
    const foundUnstop = deduped.find(e => e.title.includes('Weekly Reminder'));

    expect(foundAdobe).toBeDefined();
    expect(foundUnstop).toBeDefined();

    // Adobe competition link MUST NOT leak into the Unstop generic reminder event!
    expect(foundUnstop?.links.some(l => l.url.includes('adobe-gensolve'))).toBe(false);
  });

  it('cleans subject titles by removing Re:, Fwd:, [External] prefixes', () => {
    expect(cleanEventTitle('Re: Re: Campus Detail | Sigmoid OA')).toBe('Campus Detail | Sigmoid OA');
    expect(cleanEventTitle('[EXTERNAL] Fwd: Cognizant Assessment')).toBe('Cognizant Assessment');
    expect(cleanEventTitle('  FWD: [Urgent] Submit assignment before Friday ')).toBe('Submit assignment before Friday');
  });

  it('normalizes titles for deduplication matching', () => {
    const t1 = normalizeTitleForDeduplication("Destination Dr. Reddy's 3.0 is LIVE...");
    const t2 = normalizeTitleForDeduplication("Fwd: Destination Dr. Reddy's 3.0 is LIVE - Campus Drive");
    expect(t1).toContain('destination dr reddy');
    expect(t2).toContain('destination dr reddy');
  });

  it('detects coding round event type', () => {
    expect(detectEventType('Google Coding Round 1', 'Your test will start on HackerRank')).toBe('coding_round');
  });

  it('detects action required phrases and operational instructions', () => {
    const { actionRequired, actionDescription } = detectActionRequired(
      'Infoedge Online Test',
      'Test will be active between 4 pm - 5:30 pm. Link will be shared by 3:50PM.'
    );
    expect(actionRequired).toBe(true);
    expect(actionDescription).toContain('between 4:00 PM and 5:30 PM');
    expect(actionDescription).toContain('3:50 PM');
  });

  it('extracts process stages and stage-specific links from real recruitment process table text', () => {
    const tableText = `
Process Description\tDate\tDay\tTime\tMode
PPT\t14-Aug-26\tFriday\t4:30 PM\tVirtual\thttps://teams.microsoft.com/l/meetup-join/ppt
Technical Assessment\t16-Aug-26\tSunday\t4:00 PM\tVirtual
Interview\tYet to Decide\tIn Campus
    `;

    const stages = extractProcessStages(
      'Campus Details | Infoedge India Ltd. | 14th & 16th August 2026',
      tableText,
      new Date('2026-08-13T08:00:00Z').getTime(),
      fixedAug16
    );

    expect(stages.length).toBe(3);

    const pptStage = stages.find(s => s.type === 'ppt');
    expect(pptStage).toBeDefined();
    expect(pptStage?.date).toBe('2026-08-14');
    expect(pptStage?.time).toBe('4:30 PM');
    expect(pptStage?.links?.[0].url).toContain('teams.microsoft.com');

    const assessStage = stages.find(s => s.type === 'assessment');
    expect(assessStage).toBeDefined();
    expect(assessStage?.date).toBe('2026-08-16');
    expect(assessStage?.time).toBe('4:00 PM');
    expect(assessStage?.links).toBeUndefined();

    const interviewStage = stages.find(s => s.type === 'interview');
    expect(interviewStage).toBeDefined();
    expect(interviewStage?.status).toBe('tbd');
  });

  it('REAL GMAIL SCENARIO: Handles "Link will be shared by 3:50PM" with NO fake URLs and NO leaked Teams links on Assessment', () => {
    // Email 1: Process table with Teams link for PPT
    const email1: ParsedEmailMessage = {
      id: 'msg-info1',
      threadId: 'th-infoedge',
      subject: 'Campus Details | Infoedge India Ltd. | 14th & 16th August 2026',
      sender: 'Placement Team <placements@univ.edu>',
      senderName: 'Placement Team',
      senderEmail: 'placements@univ.edu',
      recipient: 'students@univ.edu',
      date: '2026-08-13T08:00:00Z',
      timestamp: new Date('2026-08-13T08:00:00Z').getTime(),
      snippet: 'Infoedge hiring process schedule',
      plainText: `
Process Description\tDate\tDay\tTime\tMode
PPT\t14-Aug-26\tFriday\t4:30 PM\tVirtual\thttps://teams.microsoft.com/l/meetup-join/ppt
Technical Assessment\t16-Aug-26\tSunday\t4:00 PM\tVirtual
Interview\tYet to Decide\tIn Campus
      `,
      links: [{ text: 'Join Teams', href: 'https://teams.microsoft.com/l/meetup-join/ppt' }],
      labels: ['INBOX']
    };

    // Email 2: Update email with ONLY text instruction: "Link will be shared by 3:50PM", NO URLs
    const email2: ParsedEmailMessage = {
      id: 'msg-info2',
      threadId: 'th-infoedge',
      subject: 'Infoedge Technical Assessment Timing & Instructions',
      sender: 'Placement Team <placements@univ.edu>',
      senderName: 'Placement Team',
      senderEmail: 'placements@univ.edu',
      recipient: 'students@univ.edu',
      date: '2026-08-15T08:00:00Z',
      timestamp: new Date('2026-08-15T08:00:00Z').getTime(),
      snippet: 'Important test instructions for Infoedge',
      plainText: 'Please find the list of eligible students. Test will be active between 4 pm - 5:30 pm. Link will be shared by 3:50PM.',
      links: [],
      labels: ['INBOX']
    };

    const ev1 = extractEventFromEmail(email1, fixedAug16)!;
    expect(ev1).toBeDefined();
    expect(ev1.status).toBe('today'); // On August 16, Technical Assessment is today!

    const ev2 = extractEventFromEmail(email2, fixedAug16)!;

    const deduped = deduplicateEvents([ev1, ev2]);
    expect(deduped.length).toBe(1);

    const merged = deduped[0];
    expect(merged.company).toBe('Infoedge India Ltd.');
    expect(merged.status).toBe('today');
    expect(merged.sourceMessages.length).toBe(2);
    expect(merged.actionDescription).toContain('between 4:00 PM and 5:30 PM');
    expect(merged.actionDescription).toContain('3:50 PM');
    expect(merged.stages?.length).toBe(3);

    // Verify stage 0 (PPT) has Teams link, but stage 1 (Technical Assessment) has NO link
    const ppt = merged.stages?.find(s => s.type === 'ppt');
    const assess = merged.stages?.find(s => s.type === 'assessment');
    expect(ppt?.links?.[0].url).toContain('teams.microsoft.com');
    expect(assess?.links).toBeUndefined();

    // Query for Today on Aug 16:
    const queryToday = 'what do i have today?';
    const resToday = generateLocalDeterministicResponse(queryToday, [merged], fixedAug16);

    // Must describe Technical Assessment with accurate timing instructions
    expect(resToday).toContain('Technical Assessment');
    expect(resToday).toContain('4:00 PM');
    expect(resToday).toContain('between 4:00 PM and 5:30 PM');
    expect(resToday).toContain('3:50 PM');

    // Must NOT contain fake URLs or Teams meeting URLs for assessment
    expect(resToday).not.toContain('assessment.infoedge.com');
    expect(resToday).not.toContain('teams.microsoft.com');
    expect(resToday).not.toContain('PPT');

    // Query for Infoedge Link:
    const queryLink = 'where is the infoedge link?';
    const constraintsLink = parseQueryConstraints(queryLink, fixedAug16);
    const resLink = generateLocalDeterministicResponse(queryLink, [merged], fixedAug16, undefined, undefined, constraintsLink);

    expect(resLink).toContain('No direct test link was found');
    expect(resLink).toContain('3:50 PM');
  });
});
