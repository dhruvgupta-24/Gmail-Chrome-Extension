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

  it('detects action required phrases', () => {
    const { actionRequired, actionDescription } = detectActionRequired(
      'Urgent: Register for Campus Drive',
      'Please fill the form before 11:59 PM today.'
    );
    expect(actionRequired).toBe(true);
    expect(actionDescription).toBeDefined();
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
      threadId: 'th-dr2', // Different thread ID (e.g. forward from placement officer)
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
    expect(deduped.length).toBe(1); // Must consolidate into exactly ONE event
    expect(deduped[0].sourceMessages.length).toBe(2); // Both emails tracked
  });

  it('CASE 7: Deduplicates two copies of "IDFC First Bank - Online Test Credentials" into ONE event', () => {
    const email1: ParsedEmailMessage = {
      id: 'msg-idfc1',
      threadId: 'th-idfc1',
      subject: 'IDFC First Bank - Online Test Credentials',
      sender: 'Hiring Team <hiring@idfcfirstbank.com>',
      senderName: 'IDFC First Bank',
      senderEmail: 'hiring@idfcfirstbank.com',
      recipient: 'student@univ.edu',
      date: '2026-08-14T08:00:00Z',
      timestamp: new Date('2026-08-14T08:00:00Z').getTime(),
      snippet: 'Your test credentials for IDFC First Bank OA',
      plainText: 'Online test will be on 16th August 2026 at 10:00 AM. Link: https://assessment.idfc.com',
      links: [{ text: 'Take Test', href: 'https://assessment.idfc.com' }],
      labels: ['INBOX']
    };

    const email2: ParsedEmailMessage = {
      id: 'msg-idfc2',
      threadId: 'th-idfc2',
      subject: 'IDFC First Bank - Online Test Credentials (Reminder)',
      sender: 'Hiring Team <hiring@idfcfirstbank.com>',
      senderName: 'IDFC First Bank',
      senderEmail: 'hiring@idfcfirstbank.com',
      recipient: 'student@univ.edu',
      date: '2026-08-15T06:00:00Z',
      timestamp: new Date('2026-08-15T06:00:00Z').getTime(),
      snippet: 'Reminder: test credentials for IDFC First Bank OA',
      plainText: 'Online test will be on 16th August 2026 at 10:00 AM. Link: https://assessment.idfc.com',
      links: [{ text: 'Take Test', href: 'https://assessment.idfc.com' }],
      labels: ['INBOX']
    };

    const ev1 = extractEventFromEmail(email1, fixedNow)!;
    const ev2 = extractEventFromEmail(email2, fixedNow)!;

    const deduped = deduplicateEvents([ev1, ev2]);
    expect(deduped.length).toBe(1); // Exactly ONE event
    expect(deduped[0].sourceMessages.length).toBe(2);
  });
});
