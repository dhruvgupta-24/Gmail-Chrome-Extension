import { describe, it, expect } from 'vitest';
import {
  parseDateFromEmailText,
  calculateEventStatus,
  extractTimeFromText,
  parseQueryDateRange,
  isEventInRange
} from '../src/services/extraction/date-parser';
import { ExtractedEvent } from '../src/types/events';

describe('Date & Relative Time Parser', () => {
  const fixedNow = new Date('2026-08-15T10:00:00Z');

  it('extracts time formats accurately', () => {
    expect(extractTimeFromText('Submission deadline is by 11:59 PM today')).toBe('11:59 PM');
    expect(extractTimeFromText('Interview scheduled at 10:00 AM')).toBe('10:00 AM');
    expect(extractTimeFromText('Test starts at 2:30 pm')).toBe('2:30 PM');
    expect(extractTimeFromText('Meeting at 17:00')).toBe('17:00');
  });

  it('calculates event status relative to reference date Aug 15, 2026', () => {
    expect(calculateEventStatus('2026-08-15', fixedNow)).toBe('today');
    expect(calculateEventStatus('2026-08-16', fixedNow)).toBe('tomorrow');
    expect(calculateEventStatus('2026-08-20', fixedNow)).toBe('upcoming');
    expect(calculateEventStatus('2026-08-01', fixedNow)).toBe('past');
  });

  it('CASE 1: Discrete multi-date list (Sigmoid 12th, 24th & 25th August 2026) does NOT create continuous interval', () => {
    const emailSent = new Date('2026-08-11T08:00:00Z');
    const text = 'Campus Detail | Sigmoid Data Engineering Track PPT & OA | 12th, 24th & 25th August 2026';
    const result = parseDateFromEmailText(text, emailSent, fixedNow);

    expect(result.allDates).toEqual(['2026-08-12', '2026-08-24', '2026-08-25']);
    expect(result.isContinuousRange).toBe(false);
    expect(result.startDate).toBeUndefined(); // Must NOT be Aug 11 or Aug 12
    expect(result.endDate).toBeUndefined();

    // Check status relative to Aug 15: since 12th is past and 24/25th are upcoming, status is upcoming (not today!)
    expect(result.status).toBe('upcoming');
  });

  it('CASE 2: Point-in-time deadline (Registration Deadline - 20th Aug 2026) does NOT become a range from email date', () => {
    const emailSent = new Date('2026-07-30T08:00:00Z');
    const text = 'INNOVERSITÉ - Internship Opportunity - BNP Paribas India COE\nRegistration Deadline - 20th Aug 2026';
    const result = parseDateFromEmailText(text, emailSent, fixedNow);

    expect(result.isDeadline).toBe(true);
    expect(result.isContinuousRange).toBe(false);
    expect(result.deadline).toContain('2026-08-20');
    expect(result.date).toBe('2026-08-20');
    expect(result.startDate).toBeUndefined(); // Must NOT be July 30!
    expect(result.endDate).toBeUndefined();
    expect(result.status).toBe('upcoming'); // On Aug 15, Aug 20 deadline is upcoming, NOT today!
  });

  it('CASE 3: Pre-placement talk on specific date does not use email date as start date', () => {
    const emailSent = new Date('2026-08-03T08:00:00Z');
    const text = "Pre-Placement Talk: Cognizant's Ace Frontier Engineer Program scheduled on September 7, 2026";
    const result = parseDateFromEmailText(text, emailSent, fixedNow);

    expect(result.date).toBe('2026-09-07');
    expect(result.startDate).toBeUndefined(); // Must NOT be Aug 3!
    expect(result.status).toBe('upcoming');
  });

  it('CASE 4: Continuous active window (AIMCAT Aug 15–19) stores continuous range and is marked TODAY', () => {
    const emailSent = new Date('2026-08-15T08:00:00Z');
    const text = 'AIMCAT2714 Test window starts from 15-Aug-2026 to 19-Aug-2026.';
    const result = parseDateFromEmailText(text, emailSent, fixedNow);

    expect(result.isContinuousRange).toBe(true);
    expect(result.startDate).toBe('2026-08-15');
    expect(result.endDate).toBe('2026-08-19');
    expect(result.status).toBe('today'); // On Aug 15, this active window IS today!
  });
});

describe('User Query Date Range Parser', () => {
  const refDate = new Date('2026-08-15T10:00:00Z');

  it('CASE 5: Parses "what all do i have today and tomorrow?" into Aug 15 to Aug 16', () => {
    const res1 = parseQueryDateRange('what all do i have today and tomorrow?', refDate);
    expect(res1.isDateQuery).toBe(true);
    expect(res1.isTodayAndTomorrow).toBe(true);
    expect(res1.startDate).toBe('2026-08-15');
    expect(res1.endDate).toBe('2026-08-16');

    const res2 = parseQueryDateRange('today and tomorrow', refDate);
    expect(res2.isTodayAndTomorrow).toBe(true);
    expect(res2.startDate).toBe('2026-08-15');
    expect(res2.endDate).toBe('2026-08-16');

    const res3 = parseQueryDateRange('what do i have today & tomorrow', refDate);
    expect(res3.isTodayAndTomorrow).toBe(true);
  });

  it('Parses explicit range "from 15th august to 20th august"', () => {
    const res = parseQueryDateRange('tell me what all do i have from 15th august to 20th august?', refDate);
    expect(res.isDateQuery).toBe(true);
    expect(res.startDate).toBe('2026-08-15');
    expect(res.endDate).toBe('2026-08-20');
  });

  it('Parses single date "what is scheduled on 17th august?"', () => {
    const res = parseQueryDateRange('what is scheduled on 17th august?', refDate);
    expect(res.isDateQuery).toBe(true);
    expect(res.startDate).toBe('2026-08-17');
    expect(res.endDate).toBe('2026-08-17');
    expect(res.isSingleDay).toBe(true);
  });
});

describe('Date-Range Event Overlap & Exclusion', () => {
  it('CASE 1 Overlap: Sigmoid OA (Aug 12, 24, 25) is EXCLUDED for query today and tomorrow (Aug 15–16)', () => {
    const sigmoidEvent: ExtractedEvent = {
      id: 'thread-123',
      title: 'Sigmoid Data Engineering Track PPT & OA',
      type: 'assessment',
      date: '2026-08-25',
      allDates: ['2026-08-12', '2026-08-24', '2026-08-25'],
      isContinuousRange: false,
      actionRequired: true,
      links: [],
      sourceMessages: [
        {
          messageId: 'm-1',
          subject: 'Sigmoid OA',
          receivedAt: '2026-08-11T10:00:00Z'
        }
      ],
      status: 'upcoming',
      createdAt: '2026-08-11T10:00:00Z',
      updatedAt: '2026-08-11T10:00:00Z'
    };

    const overlaps = isEventInRange(sigmoidEvent, '2026-08-15', '2026-08-16');
    expect(overlaps).toBe(false); // MUST be excluded
  });

  it('CASE 2 Overlap: BNP Paribas (Deadline Aug 20) is EXCLUDED for query Aug 15–16', () => {
    const bnpEvent: ExtractedEvent = {
      id: 'thread-bnp',
      title: 'INNOVERSITÉ - Internship Opportunity - BNP Paribas India COE',
      type: 'internship',
      date: '2026-08-20',
      deadline: '2026-08-20',
      isDeadline: true,
      isContinuousRange: false,
      actionRequired: true,
      links: [],
      sourceMessages: [
        {
          messageId: 'm-bnp',
          subject: 'BNP Paribas',
          receivedAt: '2026-07-30T10:00:00Z'
        }
      ],
      status: 'upcoming',
      createdAt: '2026-07-30T10:00:00Z',
      updatedAt: '2026-07-30T10:00:00Z'
    };

    const overlaps = isEventInRange(bnpEvent, '2026-08-15', '2026-08-16');
    expect(overlaps).toBe(false); // MUST be excluded
  });

  it('CASE 4 Overlap: AIMCAT (Aug 15–19) is INCLUDED for query today and tomorrow (Aug 15–16)', () => {
    const aimcatEvent: ExtractedEvent = {
      id: 'thread-aimcat',
      title: 'AIMCAT2714 Test window',
      type: 'assessment',
      startDate: '2026-08-15',
      endDate: '2026-08-19',
      date: '2026-08-15',
      isContinuousRange: true,
      actionRequired: true,
      links: [],
      sourceMessages: [
        {
          messageId: 'm-aimcat',
          subject: 'AIMCAT window',
          receivedAt: '2026-08-15T10:00:00Z'
        }
      ],
      status: 'today',
      createdAt: '2026-08-15T10:00:00Z',
      updatedAt: '2026-08-15T10:00:00Z'
    };

    const overlaps = isEventInRange(aimcatEvent, '2026-08-15', '2026-08-16');
    expect(overlaps).toBe(true); // MUST be included
  });
});
