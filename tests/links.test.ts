import { describe, it, expect } from 'vitest';
import {
  sanitizeUrl,
  classifyLinkType,
  extractActionLinks,
  unwrapRedirectUrl,
  deduplicateActionLinks,
  filterActionLinksForEventType
} from '../src/services/gmail/links';
import { ActionLink } from '../src/types/events';

describe('Link Extractor, Unwrapper and Semantic Deduplication', () => {
  it('unwraps Google redirect URLs to actual target destination', () => {
    const googleRedirect = 'https://www.google.com/url?q=https://unstop.com/competitions/sih-2026&sa=D&source=docs&ust=1723800000';
    const unwrapped = unwrapRedirectUrl(googleRedirect);
    expect(unwrapped).toBe('https://unstop.com/competitions/sih-2026');
  });

  it('unwraps Outlook SafeLinks to actual target destination', () => {
    const safeLink = 'https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fforms.gle%2Fvc-award-nomination&data=05%7C02%7Ctest';
    const unwrapped = unwrapRedirectUrl(safeLink);
    expect(unwrapped).toBe('https://forms.gle/vc-award-nomination');
  });

  it('strips UTM and email tracking query parameters from URLs', () => {
    const raw = 'https://hackerrank.com/test-123?utm_source=email&utm_medium=mailchimp&utm_campaign=hiring#instructions';
    const clean = sanitizeUrl(raw);
    expect(clean).toBe('https://hackerrank.com/test-123#instructions');
  });

  it('DEDUPLICATION: Collapses duplicate action buttons with tracking parameter variants into ONE button', () => {
    const rawLinks: ActionLink[] = [
      { label: 'Register on Unstop', url: 'https://unstop.com/competitions/hackathon?ref=email1', type: 'registration' },
      { label: 'Register on Unstop', url: 'https://unstop.com/competitions/hackathon?utm_source=blast', type: 'registration' },
      { label: 'Open Registration Form', url: 'https://forms.gle/sih2026?usp=sf_link', type: 'registration' },
      { label: 'Open Registration Form', url: 'https://forms.gle/sih2026', type: 'registration' }
    ];

    const deduped = deduplicateActionLinks(rawLinks);
    expect(deduped.length).toBe(2);
    expect(deduped.filter(l => l.label === 'Register on Unstop').length).toBe(1);
    expect(deduped.filter(l => l.label === 'Open Registration Form').length).toBe(1);
  });

  it('DEDUPLICATION: Collapses truncated/prefix Google Forms variants into the single longer canonical form', () => {
    const rawLinks: ActionLink[] = [
      { label: 'Open Registration Form', url: 'https://forms.gle/arAiR8Bi7', type: 'registration' },
      { label: 'Open Registration Form', url: 'https://forms.gle/arAiR8Bi7wyEaepT6', type: 'registration' }
    ];

    const deduped = deduplicateActionLinks(rawLinks);
    expect(deduped.length).toBe(1);
    expect(deduped[0].url).toBe('https://forms.gle/arAiR8Bi7wyEaepT6');
  });

  it('DEDUPLICATION: Preserves genuinely distinct Google Forms on the same event', () => {
    const rawLinks: ActionLink[] = [
      { label: 'Team Registration Form', url: 'https://forms.gle/formAlpha123', type: 'registration' },
      { label: 'Mentor Registration Form', url: 'https://forms.gle/formBeta456', type: 'registration' }
    ];

    const deduped = deduplicateActionLinks(rawLinks);
    expect(deduped.length).toBe(2);
    expect(deduped.some(l => l.url.includes('formAlpha123'))).toBe(true);
    expect(deduped.some(l => l.url.includes('formBeta456'))).toBe(true);
  });

  it('DEDUPLICATION: Suppresses generic root homepage (unstop.com) when a specific deep-link exists', () => {
    const mixedUnstop: ActionLink[] = [
      { label: 'Register on Unstop', url: 'https://unstop.com/competitions/adobe-hackathon-2026', type: 'registration' },
      { label: 'Unstop', url: 'https://unstop.com/', type: 'general' }
    ];

    const deduped = deduplicateActionLinks(mixedUnstop);
    expect(deduped.length).toBe(1);
    expect(deduped[0].url).toBe('https://unstop.com/competitions/adobe-hackathon-2026');
  });

  it('DEDUPLICATION: Preserves genuinely distinct actions on the same event', () => {
    const mixedLinks: ActionLink[] = [
      { label: 'Apply', url: 'https://drreddys.com/apply', type: 'registration' },
      { label: 'Join Teams', url: 'https://teams.microsoft.com/l/meetup-join/123', type: 'meeting' },
      { label: 'Download Admit Card', url: 'https://tcs.com/admitcard', type: 'portal' }
    ];

    const deduped = deduplicateActionLinks(mixedLinks);
    expect(deduped.length).toBe(3);
    expect(deduped.some(l => l.label === 'Apply')).toBe(true);
    expect(deduped.some(l => l.label === 'Join Teams')).toBe(true);
    expect(deduped.some(l => l.label === 'Download Admit Card')).toBe(true);
  });

  it('STAGE-AWARE ISOLATION: Coding rounds strictly reject Teams/Zoom meeting links (fixing BNP Paribas)', () => {
    const rawLinks: ActionLink[] = [
      { label: 'Apply Now', url: 'https://bnpparibas.com/careers/apply', type: 'registration' },
      { label: 'Join Teams Meeting', url: 'https://teams.microsoft.com/l/meetup-join/briefing', type: 'meeting' }
    ];

    const filteredForCoding = filterActionLinksForEventType('coding_round', rawLinks);
    // Must contain registration/portal link, MUST NOT contain Teams link!
    expect(filteredForCoding.length).toBe(1);
    expect(filteredForCoding[0].url).toContain('bnpparibas.com');
    expect(filteredForCoding.some(l => l.url.includes('teams.microsoft.com'))).toBe(false);

    // For PPT, must prefer Teams meeting link
    const filteredForPPT = filterActionLinksForEventType('ppt', rawLinks);
    expect(filteredForPPT.length).toBe(1);
    expect(filteredForPPT[0].url).toContain('teams.microsoft.com');
  });

  it('TEST 6: Classifies assessment and test platforms', () => {
    const res = classifyLinkType('https://www.hackerrank.com/tests/abc', 'Take Test');
    expect(res).not.toBeNull();
    expect(res!.type).toBe('assessment');
    expect(res!.label).toBe('Open HackerRank Test');
  });

  it('TEST 6: Classifies registration and Google Forms', () => {
    const res = classifyLinkType('https://forms.gle/xyz123', 'Register for Session');
    expect(res).not.toBeNull();
    expect(res!.type).toBe('registration');
    expect(res!.label).toBe('Open Registration Form');
  });

  it('TEST 6: Classifies video interview links', () => {
    const res = classifyLinkType('https://meet.google.com/abc-def-ghi', 'Join Call');
    expect(res).not.toBeNull();
    expect(res!.type).toBe('meeting');
    expect(res!.label).toBe('Join Google Meet');
  });

  it('TEST 4: Strictly filters out Unsubscribe and preferences links', () => {
    expect(classifyLinkType('https://time4education.com/unsubscribe?id=123', 'Unsubscribe')).toBeNull();
    expect(classifyLinkType('https://time4education.com/opt-out', 'Opt Out')).toBeNull();
    expect(classifyLinkType('https://example.com/preferences', 'Manage Preferences')).toBeNull();
  });

  it('TEST 5: Strictly filters out generic website, social media, and terms links', () => {
    expect(classifyLinkType('https://time4education.com', 'Visit Our Website →')).toBeNull();
    expect(classifyLinkType('https://time4education.com', 'Website')).toBeNull();
    expect(classifyLinkType('https://instagram.com/time4education', 'Instagram')).toBeNull();
    expect(classifyLinkType('https://facebook.com/time4education', 'Facebook')).toBeNull();
    expect(classifyLinkType('https://example.com/privacy-policy', 'Privacy Policy')).toBeNull();
    expect(classifyLinkType('https://example.com/terms', 'Terms & Conditions')).toBeNull();
  });

  it('TEST 4, 5, 6: Extracts ONLY actionable links from email HTML and drops marketing/footer junk', () => {
    const html = `
      <div>
        <p>Dear Student,</p>
        <p>Your AIMCAT test is now active. <a href="https://time4education.com/start-test?id=2714">Start Test</a></p>
        <p>Fill out the <a href="https://forms.gle/aimcat-form">Registration Form</a> if you have not registered.</p>
        <p>For more details, <a href="https://time4education.com">Visit Our Website →</a></p>
        <p>Follow us on <a href="https://instagram.com/time">Instagram</a></p>
        <p><a href="https://time4education.com/unsubscribe?user=123">Unsubscribe</a></p>
        <p><a href="https://time4education.com/privacy">Privacy Policy</a></p>
      </div>
    `;

    const links = extractActionLinks(html);
    expect(links.length).toBe(2);
    expect(links.some(l => l.url.includes('start-test'))).toBe(true);
    expect(links.some(l => l.url.includes('forms.gle'))).toBe(true);

    expect(links.some(l => l.label.toLowerCase().includes('unsubscribe'))).toBe(false);
    expect(links.some(l => l.label.toLowerCase().includes('website'))).toBe(false);
    expect(links.some(l => l.label.toLowerCase().includes('instagram'))).toBe(false);
    expect(links.some(l => l.label.toLowerCase().includes('privacy'))).toBe(false);
  });
});
