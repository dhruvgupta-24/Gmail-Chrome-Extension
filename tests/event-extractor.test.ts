import { describe, it, expect } from 'vitest';
import {
  detectEventType,
  detectActionRequired,
  extractEventFromEmail,
  cleanEventTitle,
  normalizeTitleForDeduplication,
  extractProcessStages
} from '../src/services/extraction/event-extractor';
import { deduplicateEvents } from '../src/storage/local-search';
import { generateLocalDeterministicResponse } from '../src/services/ai/local-responder';
import { parseQueryConstraints } from '../src/services/retrieval/intent';
import { ParsedEmailMessage } from '../src/types/gmail';

describe('Event Extractor & Deduplication', () => {
  const fixedAug15 = new Date('2026-08-15T10:00:00Z');
  const fixedAug16 = new Date('2026-08-16T10:00:00Z');

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
    expect(actionDescription).toContain('4 pm - 5:30 pm');
    expect(actionDescription).toContain('3:50PM');
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

  it('CASE 6: Deduplicates "Destination Dr. Reddy\'s 3.0 is LIVE" and "Fwd: Destination Dr. Reddy\'s 3.0..." into ONE event', () => {
    const email1: ParsedEmailMessage = {
      id: 'msg-dr1',
      threadId: 'th-dr1',
      subject: "Destination Dr. Reddy's 3.0 is LIVE - Campus Engagement",
      sender: 'Dr. Reddy’s Campus Team <campus@drreddys.com>',
      senderName: 'Dr. Reddy’s',
      senderEmail: 'campus@drreddys.com',
      recipient: 'student@univ.edu',
      date: '2026-08-10T08:00:00Z',
      timestamp: new Date('2026-08-10T08:00:00Z').getTime(),
      snippet: 'Registration is live for Dr. Reddy’s 3.0',
      plainText: 'Register before 20th August 2026 at https://drreddys.com/register',
      links: [{ text: 'Register Now', href: 'https://drreddys.com/register' }],
      labels: ['INBOX']
    };

    const email2: ParsedEmailMessage = {
      id: 'msg-dr2',
      threadId: 'th-dr2',
      subject: "Fwd: Destination Dr. Reddy's 3.0 is LIVE - Campus Engagement",
      sender: 'Placement Officer <tnp@univ.edu>',
      senderName: 'Placement Cell',
      senderEmail: 'tnp@univ.edu',
      recipient: 'all-students@univ.edu',
      date: '2026-08-11T08:00:00Z',
      timestamp: new Date('2026-08-11T08:00:00Z').getTime(),
      snippet: 'Please find forwarded details for Dr. Reddy’s',
      plainText: 'Register before 20th August 2026 at https://drreddys.com/register',
      links: [{ text: 'Register Now', href: 'https://drreddys.com/register' }],
      labels: ['INBOX']
    };

    const ev1 = extractEventFromEmail(email1, fixedAug15)!;
    const ev2 = extractEventFromEmail(email2, fixedAug15)!;

    const deduped = deduplicateEvents([ev1, ev2]);
    expect(deduped.length).toBe(1);
    expect(deduped[0].sourceMessages.length).toBe(2);
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
    expect(merged.actionDescription).toContain('4 pm - 5:30 pm');
    expect(merged.actionDescription).toContain('3:50PM');
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
    expect(resToday).toContain('4 pm - 5:30 pm');
    expect(resToday).toContain('3:50PM');

    // Must NOT contain fake URLs or Teams meeting URLs for assessment
    expect(resToday).not.toContain('assessment.infoedge.com');
    expect(resToday).not.toContain('teams.microsoft.com');
    expect(resToday).not.toContain('PPT');

    // Query for Infoedge Link:
    const queryLink = 'where is the infoedge link?';
    const constraintsLink = parseQueryConstraints(queryLink, fixedAug16);
    const resLink = generateLocalDeterministicResponse(queryLink, [merged], fixedAug16, undefined, undefined, constraintsLink);

    expect(resLink).toContain('No direct test link was found');
    expect(resLink).toContain('3:50PM');
  });
});
