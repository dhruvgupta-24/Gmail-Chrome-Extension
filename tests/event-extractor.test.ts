import { describe, it, expect } from 'vitest';
import {
  detectEventType,
  detectActionRequired,
  extractEventFromEmail,
  cleanEventTitle,
  normalizeTitleForDeduplication
} from '../src/services/extraction/event-extractor';
import { deduplicateEvents } from '../src/storage/local-search';
import { ParsedEmailMessage } from '../src/types/gmail';

describe('Event Extractor & Deduplication', () => {
  const fixedNow = new Date('2026-08-15T10:00:00Z');

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

    const ev1 = extractEventFromEmail(email1, fixedNow)!;
    const ev2 = extractEventFromEmail(email2, fixedNow)!;

    const deduped = deduplicateEvents([ev1, ev2]);
    expect(deduped.length).toBe(1);
    expect(deduped[0].sourceMessages.length).toBe(2);
  });

  it('TEST G & Process Merging: Merges Infoedge initial process email and subsequent timing update email into one rich event', () => {
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
      plainText: 'Process: PPT — Aug 14, Technical Assessment — Aug 16, Sunday, 4:00 PM',
      links: [],
      labels: ['INBOX']
    };

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
      plainText: 'Test will be active between 4 pm - 5:30 pm. Link will be shared by 3:50PM. Link: https://assessment.infoedge.com',
      links: [{ text: 'Assessment Portal', href: 'https://assessment.infoedge.com' }],
      labels: ['INBOX']
    };

    const ev1 = extractEventFromEmail(email1, fixedNow)!;
    const ev2 = extractEventFromEmail(email2, fixedNow)!;

    const deduped = deduplicateEvents([ev1, ev2]);
    expect(deduped.length).toBe(1);

    const merged = deduped[0];
    expect(merged.company).toBe('Infoedge India Ltd.');
    expect(merged.sourceMessages.length).toBe(2);
    expect(merged.actionDescription).toContain('4 pm - 5:30 pm');
    expect(merged.actionDescription).toContain('3:50PM');
    expect(merged.links.some(l => l.url.includes('assessment.infoedge.com'))).toBe(true);
  });
});
