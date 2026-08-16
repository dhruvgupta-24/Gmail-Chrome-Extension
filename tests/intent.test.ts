import { describe, it, expect } from 'vitest';
import { analyzeIntent, parseQueryConstraints } from '../src/services/retrieval/intent';

describe('Query Intent & Constraint Parser', () => {
  const refDate = new Date('2026-08-15T10:00:00Z');

  it('extracts constraints for "do i have idfc test today?"', () => {
    const c = parseQueryConstraints('do i have idfc test today?', refDate);
    expect(c.isEntitySpecific).toBe(true);
    expect(c.entityQuery).toBe('idfc');
    expect(c.eventType).toBe('test');
    expect(c.questionType).toBe('existence');
    expect(c.dateRange?.startDate).toBe('2026-08-15');
  });

  it('extracts constraints for "do i have infoedge test today?"', () => {
    const c = parseQueryConstraints('do i have infoedge test today?', refDate);
    expect(c.isEntitySpecific).toBe(true);
    expect(c.entityQuery).toBe('infoedge');
    expect(c.eventType).toBe('test');
    expect(c.questionType).toBe('existence');
    expect(c.dateRange?.startDate).toBe('2026-08-15');
  });

  it('extracts constraints for "when is my IDFC test?"', () => {
    const c = parseQueryConstraints('when is my IDFC test?', refDate);
    expect(c.isEntitySpecific).toBe(true);
    expect(c.entityQuery).toBe('idfc');
    expect(c.eventType).toBe('test');
    expect(c.questionType).toBe('time_query');
  });

  it('extracts constraints for "when is the sigmoid OA?"', () => {
    const c = parseQueryConstraints('when is the sigmoid OA?', refDate);
    expect(c.isEntitySpecific).toBe(true);
    expect(c.entityQuery).toBe('sigmoid');
    expect(c.eventType).toBe('test');
    expect(c.questionType).toBe('time_query');
  });

  it('extracts constraints for "do i have any TCS interview this week?"', () => {
    const c = parseQueryConstraints('do i have any TCS interview this week?', refDate);
    expect(c.isEntitySpecific).toBe(true);
    expect(c.entityQuery).toBe('tcs');
    expect(c.eventType).toBe('interview');
    expect(c.questionType).toBe('existence');
    expect(c.dateRange?.isDateQuery).toBe(true);
  });

  it('extracts constraints for "when is BNP Paribas registration deadline?"', () => {
    const c = parseQueryConstraints('when is BNP Paribas registration deadline?', refDate);
    expect(c.isEntitySpecific).toBe(true);
    expect(c.entityQuery).toBe('bnpparibas');
    expect(c.eventType).toBe('deadline');
    expect(c.questionType).toBe('time_query');
  });

  it('handles generic queries without entity e.g. "do i have a test tomorrow?"', () => {
    const c = parseQueryConstraints('do i have a test tomorrow?', refDate);
    expect(c.isEntitySpecific).toBe(false);
    expect(c.eventType).toBe('test');
    expect(c.questionType).toBe('existence');
    expect(c.dateRange?.startDate).toBe('2026-08-16');
  });

  it('extracts constraints for "is my cognizant assessment today?"', () => {
    const c = parseQueryConstraints('is my cognizant assessment today?', refDate);
    expect(c.isEntitySpecific).toBe(true);
    expect(c.entityQuery).toBe('cognizant');
    expect(c.eventType).toBe('test');
    expect(c.questionType).toBe('existence');
  });

  it('generates targeted entity search query for live Gmail API', () => {
    const intent = analyzeIntent('do i have idfc test today?', refDate);
    expect(intent.queryType).toBe('specific_search');
    expect(intent.gmailQuery).toContain('idfc');
  });
});
