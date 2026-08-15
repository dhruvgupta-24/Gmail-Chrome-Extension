import { describe, it, expect } from 'vitest';
import { generateLocalDeterministicResponse } from '../src/services/ai/local-responder';
import { ExtractedEvent } from '../src/types/events';

describe('Local Responder & Shortwave-Style Natural Answers', () => {
  // Reference date: Saturday, August 15, 2026
  const fixedNow = new Date('2026-08-15T10:00:00Z');

  const mockMailboxEvents: ExtractedEvent[] = [
    // 1. TCS from May 8 (Actual event Aug 17) -> Upcoming soon
    {
      id: 'ev-tcs',
      title: 'TCS National Qualifier Test (NQT)',
      type: 'assessment',
      date: '2026-08-17',
      allDates: ['2026-08-17'],
      isContinuousRange: false,
      organization: 'TCS',
      actionRequired: true,
      links: [{ label: 'NQT Portal', url: 'https://tcs.com/nqt' }],
      sourceMessages: [{ messageId: 'm-tcs', subject: 'TCS NQT', receivedAt: '2026-05-08T08:00:00Z' }],
      status: 'upcoming',
      createdAt: '2026-05-08T08:00:00Z',
      updatedAt: '2026-05-08T08:00:00Z'
    },
    // 2. BNP Paribas from July 30 (Deadline Aug 20) -> Upcoming soon
    {
      id: 'ev-bnp',
      title: 'INNOVERSITÉ - Internship Opportunity - BNP Paribas India COE',
      type: 'internship',
      date: '2026-08-20',
      deadline: '2026-08-20',
      isDeadline: true,
      isContinuousRange: false,
      organization: 'BNP Paribas',
      actionRequired: true,
      links: [{ label: 'Apply', url: 'https://bnpparibas.com/apply' }],
      sourceMessages: [{ messageId: 'm-bnp', subject: 'BNP Paribas', receivedAt: '2026-07-30T08:00:00Z' }],
      status: 'upcoming',
      createdAt: '2026-07-30T08:00:00Z',
      updatedAt: '2026-07-30T08:00:00Z'
    },
    // 3. AIMCAT Aug 15–19 (Active window contains Aug 15 & Aug 16) -> IS TODAY!
    {
      id: 'ev-aimcat',
      title: 'AIMCAT2714 Test window',
      type: 'assessment',
      startDate: '2026-08-15',
      endDate: '2026-08-19',
      date: '2026-08-15',
      isContinuousRange: true,
      organization: 'TIME',
      actionRequired: true,
      actionDescription: 'Complete online test before Aug 19',
      links: [{ label: 'Start Test', url: 'https://time4education.com/aimcat' }],
      sourceMessages: [{ messageId: 'm-aimcat', subject: 'AIMCAT window', receivedAt: '2026-08-15T08:00:00Z' }],
      status: 'today',
      createdAt: '2026-08-15T08:00:00Z',
      updatedAt: '2026-08-15T08:00:00Z'
    },
    // 4. IDFC Test on Aug 21
    {
      id: 'ev-idfc',
      title: 'IDFC First Bank - Online Test Credentials',
      type: 'assessment',
      date: '2026-08-21',
      time: '10:00 AM',
      isContinuousRange: false,
      organization: 'IDFC First Bank',
      actionRequired: true,
      links: [{ label: 'Take Test', url: 'https://assessment.idfc.com' }],
      sourceMessages: [{ messageId: 'm-idfc', subject: 'IDFC OA', receivedAt: '2026-08-14T08:00:00Z' }],
      status: 'upcoming',
      createdAt: '2026-08-14T08:00:00Z',
      updatedAt: '2026-08-14T08:00:00Z'
    }
  ];

  it('generates natural Shortwave-style answer without duplicating AIMCAT on tomorrow', () => {
    // Only AIMCAT is active today (Aug 15) and tomorrow (Aug 16)
    const activeRangeEvents = mockMailboxEvents.filter(e => e.id === 'ev-aimcat');

    const res = generateLocalDeterministicResponse(
      'what all do i have today and tomorrow?',
      activeRangeEvents,
      fixedNow,
      undefined,
      mockMailboxEvents
    );

    // Verify natural headings
    expect(res).toContain('### Today (Saturday, August 15)');
    expect(res).toContain('AIMCAT2714 Test window');
    expect(res).toContain('Test window is open');
    expect(res).toContain('August 19');

    // Tomorrow section should NOT duplicate AIMCAT as a separate identical bullet
    expect(res).toContain('### Tomorrow (Sunday, August 16)');
    expect(res).toContain('Nothing new is scheduled for tomorrow');
    expect(res).toContain('AIMCAT2714');
    expect(res).toContain('test window will still remain open');

    // Coming up soon preview
    expect(res).toContain('### Coming Up Soon');
    expect(res).toContain('TCS National Qualifier Test');
    expect(res).toContain('BNP Paribas');
  });

  it('generates immediate response for "due today"', () => {
    const todayEvents = mockMailboxEvents.filter(e => e.status === 'today');
    const res = generateLocalDeterministicResponse('What do I have due today?', todayEvents, fixedNow);
    expect(res).toContain('AIMCAT2714');
    expect(res).toContain('Test window is open');
  });

  it('generates immediate response for "due tomorrow" when nothing is due tomorrow', () => {
    const tomorrowEvents = mockMailboxEvents.filter(e => e.status === 'tomorrow');
    const res = generateLocalDeterministicResponse('What is scheduled for tomorrow?', tomorrowEvents, fixedNow);
    expect(res).toContain('no scheduled items or deadlines');
  });
});
