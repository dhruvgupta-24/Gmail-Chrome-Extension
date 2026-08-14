import { describe, it, expect } from 'vitest';
import { analyzeIntent } from '../src/services/retrieval/intent';

describe('Query Intent & Gmail Search Generator', () => {
  const fixedNow = new Date('2026-08-14T10:00:00Z');

  it('generates targeted query for "due today"', () => {
    const intent = analyzeIntent('What do I have due today?', fixedNow);
    expect(intent.queryType).toBe('due_today');
    expect(intent.gmailQuery).toContain('subject:');
    expect(intent.gmailQuery).toContain('-category:promotions');
  });

  it('generates targeted query for "upcoming tests"', () => {
    const intent = analyzeIntent('Find my upcoming tests and assessments', fixedNow);
    expect(intent.queryType).toBe('upcoming_tests');
    expect(intent.gmailQuery).toContain('hackerrank');
    expect(intent.gmailQuery).toContain('after:2026/07/31');
  });

  it('generates targeted query for "placements & internships"', () => {
    const intent = analyzeIntent('Show all placement and internship updates', fixedNow);
    expect(intent.queryType).toBe('specific_search');
    expect(intent.gmailQuery).toContain('placement');
    expect(intent.gmailQuery).toContain('internship');
  });
});
