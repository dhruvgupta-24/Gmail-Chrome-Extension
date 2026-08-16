import { describe, it, expect } from 'vitest';
import { generateLocalDeterministicResponse, getBestActionLinkForStage } from '../src/services/ai/local-responder';
import { parseQueryConstraints, normalizeEntityName } from '../src/services/retrieval/intent';
import { ExtractedEvent } from '../src/types/events';

describe('Entity-Aware Event Query System & Natural Answers', () => {
  // Reference date: Friday, August 14, 2026
  const refAug14 = new Date('2026-08-14T10:00:00Z');
  // Reference date: Saturday, August 15, 2026
  const refAug15 = new Date('2026-08-15T10:00:00Z');
  // Reference date: Sunday, August 16, 2026
  const refAug16 = new Date('2026-08-16T10:00:00Z');

  const mockMailboxEvents: ExtractedEvent[] = [
    // 1. AIMCAT Aug 15–19 (Active window contains Aug 15 & Aug 16)
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
      links: [{ label: 'Start Test', url: 'https://time4education.com/aimcat', type: 'assessment' }],
      sourceMessages: [{ messageId: 'm-aimcat', subject: 'AIMCAT window', receivedAt: '2026-08-15T08:00:00Z' }],
      status: 'today',
      createdAt: '2026-08-15T08:00:00Z',
      updatedAt: '2026-08-15T08:00:00Z'
    },
    // 2. IDFC Test on Aug 21
    {
      id: 'ev-idfc',
      title: 'IDFC First Bank - Online Test Credentials',
      type: 'assessment',
      date: '2026-08-21',
      time: '10:00 AM',
      isContinuousRange: false,
      organization: 'IDFC First Bank',
      company: 'IDFC First Bank',
      actionRequired: true,
      links: [{ label: 'Take Test', url: 'https://assessment.idfc.com', type: 'assessment' }],
      sourceMessages: [{ messageId: 'm-idfc', subject: 'IDFC OA', receivedAt: '2026-08-14T08:00:00Z' }],
      status: 'upcoming',
      createdAt: '2026-08-14T08:00:00Z',
      updatedAt: '2026-08-14T08:00:00Z'
    },
    // 3. Infoedge Process (Multi-stage: PPT on Aug 14 at 4:30 PM, Technical Assessment on Aug 16 at 4:00 PM, Interview TBD)
    {
      id: 'ev-infoedge',
      title: 'Campus Details | Infoedge India Ltd.',
      type: 'placement',
      date: '2026-08-16',
      allDates: ['2026-08-14', '2026-08-16'],
      time: '4:00 PM',
      isContinuousRange: false,
      organization: 'Infoedge India Ltd.',
      company: 'Infoedge India Ltd.',
      stages: [
        {
          name: 'PPT',
          type: 'ppt',
          date: '2026-08-14',
          time: '4:30 PM',
          status: 'scheduled',
          details: 'PPT — August 14, 2026, 4:30 PM',
          links: [{ label: 'Join Teams', url: 'https://teams.microsoft.com/l/meetup-join/ppt', type: 'meeting' }]
        },
        {
          name: 'Technical Assessment',
          type: 'assessment',
          date: '2026-08-16',
          time: '4:00 PM',
          status: 'scheduled',
          details: 'The test will be active between 4 pm - 5:30 pm, and the link is expected to be shared by 3:50PM.',
          links: [{ label: 'Open Assessment', url: 'https://assessment.infoedge.com', type: 'assessment' }]
        },
        {
          name: 'Interview',
          type: 'interview',
          status: 'tbd',
          details: 'Yet to decide'
        }
      ],
      actionRequired: true,
      actionDescription: 'The test will be active between 4 pm - 5:30 pm, and the link is expected to be shared by 3:50PM.',
      links: [
        { label: 'Join Teams', url: 'https://teams.microsoft.com/l/meetup-join/ppt', type: 'meeting' },
        { label: 'Open Assessment', url: 'https://assessment.infoedge.com', type: 'assessment' }
      ],
      sourceMessages: [{ messageId: 'm-infoedge', subject: 'Campus Details | Infoedge India Ltd. | 14th & 16th August 2026', receivedAt: '2026-08-13T08:00:00Z' }],
      status: 'upcoming',
      createdAt: '2026-08-13T08:00:00Z',
      updatedAt: '2026-08-14T08:00:00Z'
    },
    // 4. Sigmoid Discrete Dates (Aug 12, 24, 25)
    {
      id: 'ev-sigmoid',
      title: 'Sigmoid Data Engineering Track PPT & OA',
      type: 'assessment',
      date: '2026-08-25',
      allDates: ['2026-08-12', '2026-08-24', '2026-08-25'],
      isContinuousRange: false,
      organization: 'Sigmoid Analytics',
      company: 'Sigmoid Analytics',
      actionRequired: true,
      links: [{ label: 'Assessment Portal', url: 'https://sigmoid.hirepro.in', type: 'assessment' }],
      sourceMessages: [{ messageId: 'm-sig', subject: 'Sigmoid OA', receivedAt: '2026-08-11T08:00:00Z' }],
      status: 'upcoming',
      createdAt: '2026-08-11T08:00:00Z',
      updatedAt: '2026-08-11T08:00:00Z'
    }
  ];

  it('STAGE SELECTION ON AUG 16: "what do i have today and tomorrow?" selects Technical Assessment on Aug 16, NOT past PPT', () => {
    const query = 'what do i have today and tomorrow?';
    const res = generateLocalDeterministicResponse(
      query,
      mockMailboxEvents,
      refAug16
    );

    // Must mention Technical Assessment on Aug 16
    expect(res).toContain('Technical Assessment');
    expect(res).toContain('4:00 PM');
    expect(res).toContain('4 pm - 5:30 pm');

    // MUST NOT describe the past PPT as happening today
    expect(res).not.toContain('PPT — Scheduled for today');
    expect(res).not.toContain('at 4:30 PM');

    // Link must be Assessment Portal, NOT Teams Meeting
    expect(res).toContain('https://assessment.infoedge.com');
    expect(res).not.toContain('teams.microsoft.com');
  });

  it('STAGE SELECTION ON AUG 14: "what do i have today?" on Aug 14 selects PPT, NOT upcoming Technical Assessment', () => {
    const query = 'what do i have today?';
    const res = generateLocalDeterministicResponse(
      query,
      mockMailboxEvents,
      refAug14
    );

    expect(res).toContain('PPT');
    expect(res).toContain('4:30 PM');
    expect(res).toContain('https://teams.microsoft.com');
    expect(res).not.toContain('Technical Assessment — Scheduled for today');
  });

  it('LINK ASSOCIATION: getBestActionLinkForStage filters meeting links out of assessment stages', () => {
    const parentLinks = [
      { label: 'Join Teams', url: 'https://teams.microsoft.com/meeting', type: 'meeting' as const },
      { label: 'Open Assessment', url: 'https://assessment.infoedge.com', type: 'assessment' as const }
    ];

    const assessmentLink = getBestActionLinkForStage('assessment', undefined, parentLinks);
    expect(assessmentLink?.label).toBe('Open Assessment');
    expect(assessmentLink?.url).toBe('https://assessment.infoedge.com');

    const pptLink = getBestActionLinkForStage('ppt', undefined, parentLinks);
    expect(pptLink?.label).toBe('Join Teams');
  });

  it('TEST A: "do i have infoedge test today?" on Aug 16 returns direct YES and test window details, with NO AIMCAT/Unstop', () => {
    const query = 'do i have infoedge test today?';
    const constraints = parseQueryConstraints(query, refAug16);

    expect(constraints.isEntitySpecific).toBe(true);
    expect(constraints.entityQuery).toBe('infoedge');
    expect(constraints.questionType).toBe('existence');
    expect(constraints.eventType).toBe('test');

    const infoedgeEvents = mockMailboxEvents.filter(e => e.id === 'ev-infoedge');

    const res = generateLocalDeterministicResponse(
      query,
      infoedgeEvents,
      refAug16,
      undefined,
      mockMailboxEvents,
      constraints,
      true // matchedOnRequestedDate = true
    );

    // Must be a direct YES answer
    expect(res).toMatch(/^Yes\./i);
    expect(res).toContain('Infoedge');
    expect(res).toContain('Technical Assessment');
    expect(res).toContain('4:00 PM');
    expect(res).toContain('4 pm - 5:30 pm');
    expect(res).toContain('3:50PM');
    expect(res).not.toContain('Join Teams');

    // MUST NOT mention unrelated events
    expect(res).not.toContain('AIMCAT');
    expect(res).not.toContain('Unstop');
    expect(res).not.toContain('IDFC');
    expect(res).not.toContain('Obligations Due Today');
  });

  it('TEST B & H: "do i have idfc test today?" on Aug 15 returns direct NO + mentions Aug 21, with NO unrelated events', () => {
    const query = 'do i have idfc test today?';
    const constraints = parseQueryConstraints(query, refAug15);

    expect(constraints.isEntitySpecific).toBe(true);
    expect(constraints.entityQuery).toBe('idfc');
    expect(constraints.questionType).toBe('existence');

    const idfcEvents = mockMailboxEvents.filter(e => e.id === 'ev-idfc');

    const res = generateLocalDeterministicResponse(
      query,
      idfcEvents,
      refAug15,
      undefined,
      mockMailboxEvents,
      constraints,
      false // matchedOnRequestedDate = false
    );

    // Must be a direct NO answer
    expect(res).toMatch(/^No\./i);
    expect(res).toContain('IDFC');
    expect(res).toContain('August 21');
    expect(res).toContain('10:00 AM');

    // MUST NOT mention unrelated events
    expect(res).not.toContain('AIMCAT');
    expect(res).not.toContain('Unstop');
    expect(res).not.toContain('Infoedge');
    expect(res).not.toContain('Obligations Due Today');
  });

  it('TEST C: "when is my idfc test?" returns Aug 21, 10:00 AM', () => {
    const query = 'when is my idfc test?';
    const constraints = parseQueryConstraints(query, refAug15);

    expect(constraints.isEntitySpecific).toBe(true);
    expect(constraints.questionType).toBe('time_query');

    const idfcEvents = mockMailboxEvents.filter(e => e.id === 'ev-idfc');
    const res = generateLocalDeterministicResponse(
      query,
      idfcEvents,
      refAug15,
      undefined,
      mockMailboxEvents,
      constraints
    );

    expect(res).toContain('IDFC');
    expect(res).toContain('August 21');
    expect(res).toContain('10:00 AM');
  });

  it('TEST D: "when is the infoedge test?" returns Aug 16, 4:00 PM and test window', () => {
    const query = 'when is the infoedge test?';
    const constraints = parseQueryConstraints(query, refAug15);

    expect(constraints.isEntitySpecific).toBe(true);
    expect(constraints.questionType).toBe('time_query');
    expect(constraints.eventType).toBe('test');

    const infoedgeEvents = mockMailboxEvents.filter(e => e.id === 'ev-infoedge');
    const res = generateLocalDeterministicResponse(
      query,
      infoedgeEvents,
      refAug15,
      undefined,
      mockMailboxEvents,
      constraints
    );

    expect(res).toContain('Infoedge');
    expect(res).toContain('Technical Assessment');
    expect(res).toContain('August 16');
    expect(res).toContain('4:00 PM');
    expect(res).toContain('4 pm - 5:30 pm');
  });

  it('Multi-Stage: "when was the infoedge ppt?" targets the PPT stage of the recruitment drive', () => {
    const query = 'when was the infoedge ppt?';
    const constraints = parseQueryConstraints(query, refAug15);

    expect(constraints.isEntitySpecific).toBe(true);
    expect(constraints.eventType).toBe('ppt');

    const infoedgeEvents = mockMailboxEvents.filter(e => e.id === 'ev-infoedge');
    const res = generateLocalDeterministicResponse(
      query,
      infoedgeEvents,
      refAug15,
      undefined,
      mockMailboxEvents,
      constraints
    );

    expect(res).toContain('PPT');
    expect(res).toContain('August 14');
  });

  it('Multi-Stage: "do i have an infoedge interview?" reports interview is yet to be decided (TBD)', () => {
    const query = 'do i have an infoedge interview?';
    const constraints = parseQueryConstraints(query, refAug15);

    expect(constraints.isEntitySpecific).toBe(true);
    expect(constraints.eventType).toBe('interview');

    const infoedgeEvents = mockMailboxEvents.filter(e => e.id === 'ev-infoedge');
    const res = generateLocalDeterministicResponse(
      query,
      infoedgeEvents,
      refAug15,
      undefined,
      mockMailboxEvents,
      constraints
    );

    expect(res).toContain('Infoedge');
    expect(res).toContain('interview');
    expect(res).toContain('TBD');
  });

  it('TEST E: "what do i have today?" returns generic daily summary including all relevant events', () => {
    const query = 'what do i have today?';
    const constraints = parseQueryConstraints(query, refAug15);

    expect(constraints.isEntitySpecific).toBe(false);
    expect(constraints.questionType).toBe('general_summary');

    const todayEvents = mockMailboxEvents.filter(e => e.id === 'ev-aimcat');
    const res = generateLocalDeterministicResponse(
      query,
      todayEvents,
      refAug15,
      undefined,
      mockMailboxEvents,
      constraints
    );

    expect(res).toContain('Obligations Due Today');
    expect(res).toContain('AIMCAT2714');
  });

  it('TEST G: Entity aliases "idfc" and "IDFC First Bank" normalize to the same canonical entity', () => {
    expect(normalizeEntityName('idfc')).toBe('idfc');
    expect(normalizeEntityName('IDFC First Bank')).toBe('idfc');
    expect(normalizeEntityName('infoedge')).toBe('infoedge');
    expect(normalizeEntityName('Infoedge India Ltd.')).toBe('infoedge');
  });
});
