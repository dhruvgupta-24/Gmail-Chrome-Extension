import { describe, it, expect } from 'vitest';
import {
  parseDateFromEmailText,
  calculateEventStatus,
  extractTimeFromText,
  toDateString,
  parseQueryDateRange,
  isEventInRange
} from '../src/services/extraction/date-parser';
import { ExtractedEvent } from '../src/types/events';

describe('Date & Relative Time Parser', () => {
  const fixedNow = new Date('2026-08-14T10:00:00Z');

  it('extracts time formats accurately', () => {
    expect(extractTimeFromText('Submission deadline is by 11:59 PM today')).toBe('11:59 PM');
    expect(extractTimeFromText('Interview scheduled at 10:00 AM')).toBe('10:00 AM');
    expect(extractTimeFromText('Test starts at 2:30 pm')).toBe('2:30 PM');
    expect(extractTimeFromText('Meeting at 17:00')).toBe('17:00');
  });

  it('calculates event status relative to reference date', () => {
    expect(calculateEventStatus('2026-08-14', fixedNow)).toBe('today');
    expect(calculateEventStatus('2026-08-15', fixedNow)).toBe('tomorrow');
    expect(calculateEventStatus('2026-08-20', fixedNow)).toBe('upcoming');
    expect(calculateEventStatus('2026-08-01', fixedNow)).toBe('past');
  });

  it('resolves "today" relative to email date', () => {
    const emailSentDate = new Date('2026-08-14T09:00:00Z');
    const result = parseDateFromEmailText('Please submit the quiz today by 11:59 PM', emailSentDate, fixedNow);

    expect(result.date).toBe(toDateString(emailSentDate));
    expect(result.time).toBe('11:59 PM');
    expect(result.status).toBe('today');
  });

  it('resolves "tomorrow" relative to email date when email was sent on Aug 14', () => {
    const emailSentDate = new Date('2026-08-14T09:00:00Z');
    const result = parseDateFromEmailText('Your assessment is tomorrow at 10:00 AM', emailSentDate, fixedNow);

    const expectedDate = new Date(emailSentDate);
    expectedDate.setDate(expectedDate.getDate() + 1);

    expect(result.date).toBe(toDateString(expectedDate));
    expect(result.time).toBe('10:00 AM');
    expect(result.status).toBe('tomorrow');
  });

  it('resolves "tomorrow" in an older email relative to that email date (not today)', () => {
    const emailSentDate = new Date('2026-08-10T12:00:00Z');
    const result = parseDateFromEmailText('Online test will be tomorrow at 4:00 PM', emailSentDate, fixedNow);

    expect(result.date).toBe('2026-08-11');
    expect(result.status).toBe('past');
  });

  it('parses explicit month and day e.g. "August 18, 2026"', () => {
    const result = parseDateFromEmailText('Midterm examination on August 18, 2026 at 09:30 AM', fixedNow, fixedNow);
    expect(result.date).toBe('2026-08-18');
    expect(result.time).toBe('09:30 AM');
    expect(result.status).toBe('upcoming');
  });

  it('parses multi-date list e.g. "12th, 24th & 25th August 2026"', () => {
    const emailSent = new Date('2026-08-12T08:00:00Z');
    const text = 'Campus Detail | Sigmoid Data Engineering Track PPT & OA | 12th, 24th & 25th August 2026';
    const result = parseDateFromEmailText(text, emailSent, fixedNow);

    expect(result.allDates).toContain('2026-08-12');
    expect(result.allDates).toContain('2026-08-24');
    expect(result.allDates).toContain('2026-08-25');
    expect(result.startDate).toBe('2026-08-12');
    expect(result.endDate).toBe('2026-08-25');
  });

  it('parses date range e.g. "15 to 19 August" and "15-Aug-2026 to 19-Aug-2026"', () => {
    const emailSent = new Date('2026-08-10T08:00:00Z');
    const r1 = parseDateFromEmailText('Assessment window starts from 15th August to 19th August 2026', emailSent, fixedNow);
    expect(r1.startDate).toBe('2026-08-15');
    expect(r1.endDate).toBe('2026-08-19');

    const r2 = parseDateFromEmailText('Test window: 15-Aug-2026 to 19-Aug-2026', emailSent, fixedNow);
    expect(r2.startDate).toBe('2026-08-15');
    expect(r2.endDate).toBe('2026-08-19');
  });
});

describe('User Query Date Range Parser', () => {
  const refDate = new Date('2026-08-14T10:00:00Z');

  it('parses "tell me what all do i have from 15th august to 20th august?"', () => {
    const res = parseQueryDateRange('tell me what all do i have from 15th august to 20th august?', refDate);
    expect(res.isDateQuery).toBe(true);
    expect(res.startDate).toBe('2026-08-15');
    expect(res.endDate).toBe('2026-08-20');
  });

  it('parses "what do i have between 15 aug and 20 aug?"', () => {
    const res = parseQueryDateRange('what do i have between 15 aug and 20 aug?', refDate);
    expect(res.isDateQuery).toBe(true);
    expect(res.startDate).toBe('2026-08-15');
    expect(res.endDate).toBe('2026-08-20');
  });

  it('parses "what is scheduled on 17th august?"', () => {
    const res = parseQueryDateRange('what is scheduled on 17th august?', refDate);
    expect(res.isDateQuery).toBe(true);
    expect(res.startDate).toBe('2026-08-17');
    expect(res.endDate).toBe('2026-08-17');
    expect(res.isSingleDay).toBe(true);
  });
});

describe('Date-Range Event Overlap & Exclusion', () => {
  it('EXCLUDES event on Aug 24–25 when email was received on Aug 12 for query Aug 15–20', () => {
    const sigmoidEvent: ExtractedEvent = {
      id: 'thread-123',
      title: 'Sigmoid Data Engineering Assessment',
      type: 'assessment',
      startDate: '2026-08-24',
      endDate: '2026-08-25',
      date: '2026-08-24',
      allDates: ['2026-08-24', '2026-08-25'],
      actionRequired: true,
      links: [],
      sourceMessages: [
        {
          messageId: 'm-1',
          subject: 'Sigmoid OA',
          receivedAt: '2026-08-12T10:00:00Z' // Email received date is in the past
        }
      ],
      status: 'upcoming',
      createdAt: '2026-08-12T10:00:00Z',
      updatedAt: '2026-08-12T10:00:00Z'
    };

    // User asks for Aug 15 to Aug 20
    const overlaps = isEventInRange(sigmoidEvent, '2026-08-15', '2026-08-20');
    expect(overlaps).toBe(false); // Must be EXCLUDED
  });

  it('INCLUDES multi-day event spanning Aug 15–19 for query Aug 15–20', () => {
    const cognizantEvent: ExtractedEvent = {
      id: 'thread-456',
      title: 'Cognizant Communication & Aptitude Assessment',
      type: 'assessment',
      startDate: '2026-08-15',
      endDate: '2026-08-19',
      date: '2026-08-15',
      allDates: ['2026-08-15', '2026-08-19'],
      actionRequired: true,
      links: [],
      sourceMessages: [
        {
          messageId: 'm-2',
          subject: 'Cognizant Assessment',
          receivedAt: '2026-08-10T10:00:00Z'
        }
      ],
      status: 'upcoming',
      createdAt: '2026-08-10T10:00:00Z',
      updatedAt: '2026-08-10T10:00:00Z'
    };

    const overlaps = isEventInRange(cognizantEvent, '2026-08-15', '2026-08-20');
    expect(overlaps).toBe(true); // Must be INCLUDED
  });
});
