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

  it('extracts constraints for "tell me all details about interview process and dates of bain and company"', () => {
    const c = parseQueryConstraints('tell me all details about interview process and dates of bain and company', refDate);
    expect(c.isEntitySpecific).toBe(true);
    expect(c.entityQuery).toBe('bain');
    expect(c.questionType).toBe('process_query');
    expect(c.eventType).toBe('interview');
  });

  it('CONVERSATIONAL CONTEXT: Resolves follow-up "tell me about interview" using active entity from chat history', () => {
    const mockHistory: any[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'tell me all details about interview process and dates of bain and company',
        timestamp: Date.now() - 10000
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Here are the details for Bain & Company...',
        events: [
          {
            id: 'thread-bain',
            title: 'Bain & Company Internship Process',
            company: 'Bain & Company',
            organization: 'Bain & Company',
            type: 'placement'
          }
        ],
        timestamp: Date.now() - 5000
      }
    ];

    const followUp = parseQueryConstraints('tell me about interview', refDate, mockHistory);
    expect(followUp.isEntitySpecific).toBe(true);
    expect(followUp.entityQuery).toBe('bain');
    expect(followUp.rawEntity).toBe('Bain & Company');
    expect(followUp.eventType).toBe('interview');
    expect(followUp.isConversationalFollowUp).toBe(true);
  });

  it('PRONOUN / ELLIPSIS: Resolves "what about its date?" and "what happens after that?" using active conversation entity', () => {
    const mockHistory: any[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Bain & Company recruitment process overview',
        events: [{ id: 'bain-1', title: 'Bain Process', company: 'Bain & Company', type: 'placement' }]
      }
    ];

    const dateQuery = parseQueryConstraints('what about its date?', refDate, mockHistory);
    expect(dateQuery.isEntitySpecific).toBe(true);
    expect(dateQuery.entityQuery).toBe('bain');

    const nextStep = parseQueryConstraints('what happens after that?', refDate, mockHistory);
    expect(nextStep.isEntitySpecific).toBe(true);
    expect(nextStep.entityQuery).toBe('bain');
  });

  it('EXPLICIT OVERRIDE: Explicit entity in new query overrides previous conversational entity', () => {
    const mockHistory: any[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Bain & Company recruitment process overview',
        events: [{ id: 'bain-1', title: 'Bain Process', company: 'Bain & Company', type: 'placement' }]
      }
    ];

    const overrideQuery = parseQueryConstraints('tell me about Microsoft interview instead', refDate, mockHistory);
    expect(overrideQuery.isEntitySpecific).toBe(true);
    expect(overrideQuery.entityQuery).toBe('microsoft');
    expect(overrideQuery.entityQuery).not.toBe('bain');
  });

  it('GLOBAL INTENT: "what do i have tomorrow?" remains a global query and is NOT constrained to active entity', () => {
    const mockHistory: any[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Bain & Company recruitment process overview',
        events: [{ id: 'bain-1', title: 'Bain Process', company: 'Bain & Company', type: 'placement' }]
      }
    ];

    const globalQuery = parseQueryConstraints('what do i have tomorrow?', refDate, mockHistory);
    expect(globalQuery.isEntitySpecific).toBe(false);
    expect(globalQuery.dateRange?.startDate).toBe('2026-08-16');
  });

  it('generates targeted entity search query for live Gmail API', () => {
    const intent = analyzeIntent('do i have idfc test today?', refDate);
    expect(intent.queryType).toBe('specific_search');
    expect(intent.gmailQuery).toContain('idfc');
  });
});

