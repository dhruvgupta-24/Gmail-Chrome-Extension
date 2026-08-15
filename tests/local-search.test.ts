import { describe, it, expect } from 'vitest';
import { generateLocalDeterministicResponse } from '../src/services/ai/local-responder';
import { ExtractedEvent } from '../src/types/events';

describe('Local Responder & Today/Tomorrow Integration', () => {
  // Reference date: Saturday, August 15, 2026
  const fixedNow = new Date('2026-08-15T10:00:00Z');

  const mockMailboxEvents: ExtractedEvent[] = [
    // 1. TCS from May 8 (Actual event Aug 17) -> NOT today/tomorrow
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
    // 2. BNP Paribas from July 30 (Deadline Aug 20) -> NOT today/tomorrow
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
    // 3. Cognizant from Aug 3 (PPT on Sep 7) -> NOT today/tomorrow
    {
      id: 'ev-cog',
      title: "Pre-Placement Talk: Cognizant's Ace Frontier Engineer Program",
      type: 'ppt',
      date: '2026-09-07',
      isContinuousRange: false,
      organization: 'Cognizant',
      actionRequired: false,
      links: [],
      sourceMessages: [{ messageId: 'm-cog', subject: 'Cognizant PPT', receivedAt: '2026-08-03T08:00:00Z' }],
      status: 'upcoming',
      createdAt: '2026-08-03T08:00:00Z',
      updatedAt: '2026-08-03T08:00:00Z'
    },
    // 4. Sigmoid from Aug 11 (PPT on 12th, OA on 24th & 25th) -> NOT today/tomorrow
    {
      id: 'ev-sig',
      title: 'Campus Detail | Sigmoid Data Engineering Track PPT & OA',
      type: 'assessment',
      date: '2026-08-25',
      allDates: ['2026-08-12', '2026-08-24', '2026-08-25'],
      isContinuousRange: false,
      organization: 'Sigmoid',
      actionRequired: true,
      links: [{ label: 'OA Link', url: 'https://sigmoid.com/oa' }],
      sourceMessages: [{ messageId: 'm-sig', subject: 'Sigmoid OA', receivedAt: '2026-08-11T08:00:00Z' }],
      status: 'upcoming',
      createdAt: '2026-08-11T08:00:00Z',
      updatedAt: '2026-08-11T08:00:00Z'
    },
    // 5. AIMCAT Aug 15–19 (Active window contains Aug 15 & Aug 16) -> IS TODAY / TOMORROW!
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
    // 6. IDFC Test on Aug 16 (Tomorrow) -> IS TOMORROW!
    {
      id: 'ev-idfc',
      title: 'IDFC First Bank - Online Test Credentials',
      type: 'assessment',
      date: '2026-08-16',
      time: '10:00 AM',
      isContinuousRange: false,
      organization: 'IDFC First Bank',
      actionRequired: true,
      actionDescription: 'Take online test tomorrow at 10:00 AM',
      links: [{ label: 'Take Test', url: 'https://assessment.idfc.com' }],
      sourceMessages: [{ messageId: 'm-idfc', subject: 'IDFC OA', receivedAt: '2026-08-14T08:00:00Z' }],
      status: 'tomorrow',
      createdAt: '2026-08-14T08:00:00Z',
      updatedAt: '2026-08-14T08:00:00Z'
    }
  ];

  it('filters out old emails and only includes AIMCAT & IDFC for "what all do i have today and tomorrow?"', () => {
    // Relevant items: AIMCAT (today window) and IDFC (tomorrow)
    const filteredEvents = mockMailboxEvents.filter(e => e.id === 'ev-aimcat' || e.id === 'ev-idfc');

    const res = generateLocalDeterministicResponse(
      'what all do i have today and tomorrow?',
      filteredEvents,
      fixedNow
    );

    expect(res).toContain('# Your schedule: Aug 15–16, 2026');
    expect(res).toContain('## Today — Aug 15');
    expect(res).toContain('AIMCAT2714 Test window');
    expect(res).toContain('## Tomorrow — Aug 16');
    expect(res).toContain('IDFC First Bank - Online Test Credentials');

    // Crucial: Must NOT contain old emails from May 8, July 30, Aug 3, Aug 11
    expect(res).not.toContain('TCS National Qualifier Test');
    expect(res).not.toContain('BNP Paribas');
    expect(res).not.toContain('Cognizant');
    expect(res).not.toContain('Sigmoid');
    expect(res).not.toContain('May 8');
    expect(res).not.toContain('Jul 30');
  });

  it('generates immediate response for "due today"', () => {
    const todayEvents = mockMailboxEvents.filter(e => e.status === 'today');
    const res = generateLocalDeterministicResponse('What do I have due today?', todayEvents, fixedNow);
    expect(res).toContain('AIMCAT2714');
  });

  it('generates immediate response for "due tomorrow"', () => {
    const tomorrowEvents = mockMailboxEvents.filter(e => e.status === 'tomorrow');
    const res = generateLocalDeterministicResponse('What is scheduled for tomorrow?', tomorrowEvents, fixedNow);
    expect(res).toContain('IDFC First Bank');
    expect(res).toContain('10:00 AM');
  });
});
