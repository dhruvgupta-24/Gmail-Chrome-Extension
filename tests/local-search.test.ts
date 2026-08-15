import { describe, it, expect } from 'vitest';
import { generateLocalDeterministicResponse } from '../src/services/ai/local-responder';
import { ExtractedEvent } from '../src/types/events';

describe('Local Responder (Extract Once -> Query Many)', () => {
  const fixedNow = new Date('2026-08-14T10:00:00Z');

  const mockEvents: ExtractedEvent[] = [
    {
      id: 'ev-1',
      title: 'Google Coding Round 1',
      type: 'coding_round',
      startDate: '2026-08-15',
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
      startDate: '2026-08-14',
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
    },
    {
      id: 'ev-3',
      title: 'Cognizant Communication & Aptitude Assessment',
      type: 'assessment',
      startDate: '2026-08-16',
      endDate: '2026-08-19',
      date: '2026-08-16',
      allDates: ['2026-08-16', '2026-08-19'],
      organization: 'Cognizant',
      actionRequired: true,
      actionDescription: 'Assessment window active until Aug 19',
      links: [{ label: 'Assessment Portal', url: 'https://cognizant.com/oa', type: 'assessment' }],
      sourceMessages: [
        {
          messageId: 'msg-3',
          subject: 'Cognizant Assessment Window',
          receivedAt: '2026-08-12T08:00:00Z'
        }
      ],
      status: 'upcoming',
      createdAt: '2026-08-12T08:00:00Z',
      updatedAt: '2026-08-12T08:00:00Z'
    }
  ];

  it('generates immediate response for "due today"', () => {
    const res = generateLocalDeterministicResponse('What do I have due today?', mockEvents, fixedNow);
    expect(res).toContain('Math Assignment 3 Submission');
    expect(res).toContain('11:59 PM');
    expect(res).toContain('https://moodle.univ.edu/sub3');
  });

  it('generates immediate response for "due tomorrow"', () => {
    const res = generateLocalDeterministicResponse('What is scheduled for tomorrow?', mockEvents, fixedNow);
    expect(res).toContain('Google Coding Round 1');
    expect(res).toContain('10:00 AM');
    expect(res).toContain('https://hackerrank.com/google-oa');
  });

  it('generates structured schedule for date-range query "tell me what all do i have from 15th august to 20th august?"', () => {
    // Only ev-1 (Aug 15) and ev-3 (Aug 16-19) are in Aug 15-20 range.
    const relevantEvents = mockEvents.filter(e => e.id === 'ev-1' || e.id === 'ev-3');
    const res = generateLocalDeterministicResponse(
      'tell me what all do i have from 15th august to 20th august?',
      relevantEvents,
      fixedNow
    );

    expect(res).toContain('# Your schedule: Aug 15–20, 2026');
    expect(res).toContain('## Aug 15');
    expect(res).toContain('Google Coding Round 1');
    expect(res).toContain('## Aug 16–Aug 19');
    expect(res).toContain('Cognizant Communication & Aptitude Assessment');
    expect(res).not.toContain('Found 13 relevant items');
    expect(res).not.toContain('Math Assignment 3'); // Aug 14 is outside
  });

  it('generates clear empty schedule response when no events in requested range', () => {
    const res = generateLocalDeterministicResponse(
      'tell me what all do i have from 1st september to 5th september?',
      [],
      fixedNow
    );
    expect(res).toContain('# Your schedule: Sep 1–5, 2026');
    expect(res).toContain('No scheduled tests, assessments, deadlines, or academic events found');
  });
});
