import { describe, it, expect } from 'vitest';
import {
  parseDateFromEmailText,
  calculateEventStatus,
  extractTimeFromText,
  toDateString
} from '../src/services/extraction/date-parser';

describe('Date & Relative Time Parser', () => {
  // Fixed current time: Aug 14, 2026
  const fixedNow = new Date('2026-08-14T10:00:00Z');

  it('extracts time formats accurately', () => {
    expect(extractTimeFromText('Submission deadline is by 11:59 PM today')).toBe('11:59 PM');
    expect(extractTimeFromText('Interview scheduled at 10:00 AM')).toBe('10:00 AM');
    expect(extractTimeFromText('Test starts at 2:30 pm')).toBe('2:30 PM');
    expect(extractTimeFromText('Meeting at 17:00')).toBe('17:00');
  });

  it('resolves "today" relative to email date', () => {
    // Email sent on Aug 14, 2026
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
    // Email was sent on Aug 10, 2026
    const emailSentDate = new Date('2026-08-10T12:00:00Z');
    const result = parseDateFromEmailText('Online test will be tomorrow at 4:00 PM', emailSentDate, fixedNow);

    // Should resolve to Aug 11, 2026
    expect(result.date).toBe('2026-08-11');
    expect(result.status).toBe('past'); // Because Aug 11 is in the past relative to Aug 14
  });

  it('parses explicit month and day e.g. "August 18, 2026"', () => {
    const result = parseDateFromEmailText('Midterm examination on August 18, 2026 at 09:30 AM', fixedNow, fixedNow);
    expect(result.date).toBe('2026-08-18');
    expect(result.time).toBe('09:30 AM');
    expect(result.status).toBe('upcoming');
  });

  it('calculates event status correctly', () => {
    const todayStr = toDateString(fixedNow);
    const tomorrowDate = new Date(fixedNow);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = toDateString(tomorrowDate);

    const futureDate = new Date(fixedNow);
    futureDate.setDate(futureDate.getDate() + 5);
    const futureStr = toDateString(futureDate);

    expect(calculateEventStatus(todayStr, fixedNow)).toBe('today');
    expect(calculateEventStatus(tomorrowStr, fixedNow)).toBe('tomorrow');
    expect(calculateEventStatus(futureStr, fixedNow)).toBe('upcoming');
    expect(calculateEventStatus('2025-01-01', fixedNow)).toBe('past');
  });
});
