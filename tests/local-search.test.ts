import { describe, it, expect } from 'vitest';
import { generateLocalDeterministicResponse } from '../src/services/ai/local-responder';
import { ExtractedEvent } from '../src/types/events';

describe('Local Responder (Extract Once -> Query Many)', () => {
  const mockEvents: ExtractedEvent[] = [
    {
      id: 'ev-1',
      title: 'Google Coding Round 1',
      type: 'coding_round',
      date: '2026-08-15',
      time: '10:00 AM',
      organization: 'Google',
      actionRequired: true,
      actionDescription: 'Take the coding test on HackerRank',
      links: [{ label: 'Open HackerRank Test', url: 'https://hackerrank.com/google-oa', type: 'assessment' }],
      sourceMessages: [
        {
          messageId: 'msg-1',
          subject: 'Google Online Assessment',
          receivedAt: '2026-08-14T08:00:00Z'
        }
      ],
      status: 'tomorrow',
      createdAt: '2026-08-14T08:00:00Z',
      updatedAt: '2026-08-14T08:00:00Z'
    },
    {
      id: 'ev-2',
      title: 'Math Assignment 3 Submission',
      type: 'assignment',
      date: '2026-08-14',
      time: '11:59 PM',
      organization: 'Mathematics Dept',
      actionRequired: true,
      actionDescription: 'Submit homework on Moodle',
      links: [{ label: 'Open Moodle', url: 'https://moodle.univ.edu/sub3', type: 'submission' }],
      sourceMessages: [
        {
          messageId: 'msg-2',
          subject: 'Assignment 3 Deadline',
          receivedAt: '2026-08-14T08:00:00Z'
        }
      ],
      status: 'today',
      createdAt: '2026-08-14T08:00:00Z',
      updatedAt: '2026-08-14T08:00:00Z'
    }
  ];

  it('generates immediate response for "due today"', () => {
    const res = generateLocalDeterministicResponse('What do I have due today?', mockEvents);
    expect(res).toContain('Math Assignment 3 Submission');
    expect(res).toContain('11:59 PM');
    expect(res).toContain('https://moodle.univ.edu/sub3');
  });

  it('generates immediate response for "due tomorrow"', () => {
    const res = generateLocalDeterministicResponse('What is scheduled for tomorrow?', mockEvents);
    expect(res).toContain('Google Coding Round 1');
    expect(res).toContain('10:00 AM');
    expect(res).toContain('https://hackerrank.com/google-oa');
  });

  it('generates response for "upcoming tests"', () => {
    const res = generateLocalDeterministicResponse('Find my tests and assessments', mockEvents);
    expect(res).toContain('Google Coding Round 1');
    expect(res).toContain('Test Link');
  });

  it('returns clean message when no matching events exist', () => {
    const res = generateLocalDeterministicResponse('Any events?', []);
    expect(res).toContain('no relevant upcoming deadlines');
  });
});
