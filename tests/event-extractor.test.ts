import { describe, it, expect } from 'vitest';
import {
  detectEventType,
  detectActionRequired,
  extractEventFromEmail,
  mergeEvents
} from '../src/services/extraction/event-extractor';
import { ParsedEmailMessage } from '../src/types/gmail';

describe('Event Extractor & Deduplication', () => {
  const fixedNow = new Date('2026-08-14T10:00:00Z');

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

  it('extracts structured event from parsed email message', () => {
    const parsedEmail: ParsedEmailMessage = {
      id: 'msg_999',
      threadId: 'th_888',
      subject: 'Bain & Company Online Assessment',
      sender: 'Campus Recruitment <recruitment@bain.com>',
      senderName: 'Bain & Company',
      senderEmail: 'recruitment@bain.com',
      recipient: 'student@univ.edu',
      date: '2026-08-14T08:00:00Z',
      timestamp: new Date('2026-08-14T08:00:00Z').getTime(),
      snippet: 'Your assessment is tomorrow at 10:00 AM',
      plainText: 'Please complete the assessment tomorrow at 10:00 AM on https://hackerrank.com/bain-oa',
      links: [{ text: 'Open HackerRank Test', href: 'https://hackerrank.com/bain-oa' }],
      labels: ['INBOX']
    };

    const event = extractEventFromEmail(parsedEmail, fixedNow);
    expect(event).not.toBeNull();
    expect(event?.title).toBe('Bain & Company Online Assessment');
    expect(event?.status).toBe('tomorrow');
    expect(event?.organization).toBe('Bain & Company');
    expect(event?.links.length).toBeGreaterThan(0);
    expect(event?.sourceMessages[0].messageId).toBe('msg_999');
  });

  it('merges multiple events from the same thread into one consolidated event', () => {
    const event1 = {
      id: 'event-1',
      title: 'Math Quiz Announcement',
      type: 'quiz' as const,
      date: '2026-08-15',
      time: '10:00 AM',
      actionRequired: true,
      links: [{ label: 'Quiz Portal', url: 'https://moodle.univ.edu/quiz1' }],
      sourceMessages: [
        {
          messageId: 'msg-1',
          threadId: 'th-1',
          subject: 'Math Quiz Announcement',
          receivedAt: '2026-08-14T08:00:00Z'
        }
      ],
      status: 'tomorrow' as const,
      createdAt: '2026-08-14T08:00:00Z',
      updatedAt: '2026-08-14T08:00:00Z'
    };

    const event2 = {
      id: 'event-1',
      title: 'Math Quiz Announcement (Updated Link)',
      type: 'quiz' as const,
      date: '2026-08-15',
      time: '10:00 AM',
      actionRequired: true,
      links: [
        { label: 'Quiz Portal', url: 'https://moodle.univ.edu/quiz1' },
        { label: 'Zoom Link', url: 'https://zoom.us/j/123456' }
      ],
      sourceMessages: [
        {
          messageId: 'msg-2',
          threadId: 'th-1',
          subject: 'Math Quiz Announcement (Updated Link)',
          receivedAt: '2026-08-14T09:00:00Z'
        }
      ],
      status: 'tomorrow' as const,
      createdAt: '2026-08-14T08:00:00Z',
      updatedAt: '2026-08-14T09:00:00Z'
    };

    const merged = mergeEvents(event1, event2);
    expect(merged.sourceMessages.length).toBe(2);
    expect(merged.links.length).toBe(2);
    expect(merged.title).toBe('Math Quiz Announcement (Updated Link)');
  });
});
