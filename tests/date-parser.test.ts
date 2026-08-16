import { describe, it, expect } from 'vitest';
import {
  parseDateFromEmailText,
  calculateEventStatus,
  extractTimeFromText,
  parseQueryDateRange,
  isEventInRange
} from '../src/services/extraction/date-parser';
import { formatEventSemanticDate } from '../src/shared/utils';
import { ExtractedEvent } from '../src/types/events';

describe('Date & Relative Time Parser with Context Scoring', () => {
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

  it('TEST 1 & 3: Subject-level explicit deadline (Dr. Reddy 20th Aug) outranks body-level assessment date (23rd Aug at 23:59 HRS)', () => {
    const subject = "Destination Dr. Reddy's 3.0 is LIVE | Engineering, Pharma, Management and Digital & AI Track | Registration Deadline - 20th Aug 2026";
    const body = `
      Dear Candidate,
      We invite you to participate in Destination Dr. Reddy's 3.0.
      Important Dates:
      - Round 1 Online Assessment: 23rd Aug 2026 at 23:59 HRS
      - Grand Finale: 5th September 2026
      Please complete your registration before the deadline.
    `;
    const emailSent = new Date('2026-08-10T08:00:00Z');

    const result = parseDateFromEmailText(subject, body, emailSent, fixedNow);

    // Must prioritize the subject registration deadline of Aug 20, NOT Aug 23!
    expect(result.isDeadline).toBe(true);
    expect(result.date).toBe('2026-08-20');
    expect(result.deadline).toContain('2026-08-20');
    // Must NOT adopt 23:59 HRS from the unrelated body assessment
    expect(result.deadline).not.toContain('23:59 HRS');
    expect(result.date).not.toBe('2026-08-23');
    expect(result.status).toBe('upcoming');
  });

  it('TEST 2: Explicit deadline in body outranks generic announcement dates', () => {
    const subject = 'Campus Internship Opportunity 2026';
    const body = `
      The opportunity was announced on 1st August 2026.
      Please note that the final registration deadline is 20th Aug 2026 by 11:59 PM.
      Information session was held on 5th August 2026.
    `;
    const result = parseDateFromEmailText(subject, body, new Date('2026-08-01'), fixedNow);

    expect(result.isDeadline).toBe(true);
    expect(result.date).toBe('2026-08-20');
    expect(result.deadline).toContain('2026-08-20 at 11:59 PM');
  });

  it('CASE 1: Discrete multi-date list (Sigmoid 12th, 24th & 25th August 2026) does NOT create continuous interval', () => {
    const emailSent = new Date('2026-08-11T08:00:00Z');
    const text = 'Campus Detail | Sigmoid Data Engineering Track PPT & OA | 12th, 24th & 25th August 2026';
    const result = parseDateFromEmailText(text, '', emailSent, fixedNow);

    expect(result.allDates).toEqual(['2026-08-12', '2026-08-24', '2026-08-25']);
    expect(result.isContinuousRange).toBe(false);
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBeUndefined();
    expect(result.status).toBe('upcoming');
  });

  it('CASE 4: Continuous active window (AIMCAT Aug 15–19) stores continuous range and is marked TODAY', () => {
    const emailSent = new Date('2026-08-15T08:00:00Z');
    const text = 'AIMCAT2714 Test window starts from 15-Aug-2026 to 19-Aug-2026.';
    const result = parseDateFromEmailText(text, '', emailSent, fixedNow);

    expect(result.isContinuousRange).toBe(true);
    expect(result.startDate).toBe('2026-08-15');
    expect(result.endDate).toBe('2026-08-19');
    expect(result.status).toBe('today');
  });

  it('TEST 7: formatEventSemanticDate renders semantic deadline and window labels', () => {
    const drReddyEvent: ExtractedEvent = {
      id: 'ev-dr',
      title: "Destination Dr. Reddy's 3.0",
      type: 'registration',
      date: '2026-08-20',
      deadline: '2026-08-20',
      isDeadline: true,
      actionRequired: true,
      links: [],
      sourceMessages: [],
      status: 'upcoming',
      createdAt: '',
      updatedAt: ''
    };
    expect(formatEventSemanticDate(drReddyEvent)).toBe('Registration Deadline: Aug 20, 2026');

    const aimcatEvent: ExtractedEvent = {
      id: 'ev-aimcat',
      title: 'AIMCAT2714 Test',
      type: 'assessment',
      date: '2026-08-15',
      startDate: '2026-08-15',
      endDate: '2026-08-19',
      isContinuousRange: true,
      actionRequired: true,
      links: [],
      sourceMessages: [],
      status: 'today',
      createdAt: '',
      updatedAt: ''
    };
    expect(formatEventSemanticDate(aimcatEvent)).toContain('Test window: Aug 15 to Aug 19, 2026');

    const idfcEvent: ExtractedEvent = {
      id: 'ev-idfc',
      title: 'IDFC First Bank Online Test',
      type: 'assessment',
      date: '2026-08-21',
      time: '10:00 AM',
      actionRequired: true,
      links: [],
      sourceMessages: [],
      status: 'upcoming',
      createdAt: '',
      updatedAt: ''
    };
    expect(formatEventSemanticDate(idfcEvent)).toBe('Scheduled for Aug 21, 2026 at 10:00 AM');
  });
});

describe('User Query Date Range Parser', () => {
  const refDate = new Date('2026-08-15T10:00:00Z');

  it('Parses "what all do i have today and tomorrow?" into Aug 15 to Aug 16', () => {
    const res1 = parseQueryDateRange('what all do i have today and tomorrow?', refDate);
    expect(res1.isDateQuery).toBe(true);
    expect(res1.isTodayAndTomorrow).toBe(true);
    expect(res1.startDate).toBe('2026-08-15');
    expect(res1.endDate).toBe('2026-08-16');
  });

  it('Parses explicit range "from 15th august to 20th august"', () => {
    const res = parseQueryDateRange('tell me what all do i have from 15th august to 20th august?', refDate);
    expect(res.isDateQuery).toBe(true);
    expect(res.startDate).toBe('2026-08-15');
    expect(res.endDate).toBe('2026-08-20');
  });
});

describe('Date-Range Event Overlap & Exclusion', () => {
  it('Sigmoid OA (Aug 12, 24, 25) is EXCLUDED for query today and tomorrow (Aug 15–16)', () => {
    const sigmoidEvent: ExtractedEvent = {
      id: 'thread-123',
      title: 'Sigmoid Data Engineering Track PPT & OA',
      type: 'assessment',
      date: '2026-08-25',
      allDates: ['2026-08-12', '2026-08-24', '2026-08-25'],
      isContinuousRange: false,
      actionRequired: true,
      links: [],
      sourceMessages: [{ messageId: 'm-1', subject: 'Sigmoid OA', receivedAt: '2026-08-11T10:00:00Z' }],
      status: 'upcoming',
      createdAt: '2026-08-11T10:00:00Z',
      updatedAt: '2026-08-11T10:00:00Z'
    };

    expect(isEventInRange(sigmoidEvent, '2026-08-15', '2026-08-16')).toBe(false);
  });

  it('AIMCAT (Aug 15–19) is INCLUDED for query today and tomorrow (Aug 15–16)', () => {
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
      sourceMessages: [{ messageId: 'm-aimcat', subject: 'AIMCAT window', receivedAt: '2026-08-15T10:00:00Z' }],
      status: 'today',
      createdAt: '2026-08-15T10:00:00Z',
      updatedAt: '2026-08-15T10:00:00Z'
    };

    expect(isEventInRange(aimcatEvent, '2026-08-15', '2026-08-16')).toBe(true);
  });
});
