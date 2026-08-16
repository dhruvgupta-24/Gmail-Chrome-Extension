import { describe, it, expect } from 'vitest';
import { sanitizeUrl, classifyLinkType, extractActionLinks } from '../src/services/gmail/links';

describe('Link Extractor and Semantic Classifier', () => {
  it('strips UTM tracking parameters from URLs', () => {
    const raw = 'https://hackerrank.com/test-123?utm_source=email&utm_medium=mailchimp&utm_campaign=hiring#instructions';
    const clean = sanitizeUrl(raw);
    expect(clean).toBe('https://hackerrank.com/test-123#instructions');
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
    // Should ONLY extract the real test link and registration form link
    expect(links.length).toBe(2);
    expect(links.some(l => l.url.includes('start-test'))).toBe(true);
    expect(links.some(l => l.url.includes('forms.gle'))).toBe(true);

    // Must NOT contain Unsubscribe, Instagram, Visit Our Website, or Privacy
    expect(links.some(l => l.label.toLowerCase().includes('unsubscribe'))).toBe(false);
    expect(links.some(l => l.label.toLowerCase().includes('website'))).toBe(false);
    expect(links.some(l => l.label.toLowerCase().includes('instagram'))).toBe(false);
    expect(links.some(l => l.label.toLowerCase().includes('privacy'))).toBe(false);
  });
});
