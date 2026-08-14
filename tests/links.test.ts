import { describe, it, expect } from 'vitest';
import { sanitizeUrl, classifyLinkType, extractActionLinks } from '../src/services/gmail/links';

describe('Link Extractor and Classifier', () => {
  it('strips UTM tracking parameters from URLs', () => {
    const raw = 'https://hackerrank.com/test-123?utm_source=email&utm_medium=mailchimp&utm_campaign=hiring#instructions';
    const clean = sanitizeUrl(raw);
    expect(clean).toBe('https://hackerrank.com/test-123#instructions');
  });

  it('classifies assessment platforms', () => {
    const res = classifyLinkType('https://www.hackerrank.com/tests/abc', 'Take Test');
    expect(res.type).toBe('assessment');
    expect(res.label).toBe('Open HackerRank Test');
  });

  it('classifies registration and Google Forms', () => {
    const res = classifyLinkType('https://forms.gle/xyz123', 'Register for Session');
    expect(res.type).toBe('registration');
    expect(res.label).toBe('Open Google Form');
  });

  it('classifies video interview links', () => {
    const res = classifyLinkType('https://meet.google.com/abc-def-ghi', 'Join Call');
    expect(res.type).toBe('meeting');
    expect(res.label).toBe('Join Google Meet');
  });

  it('extracts links from HTML with contextual labels', () => {
    const html = `
      <div>
        <p>Dear Candidate,</p>
        <p>Please register using <a href="https://forms.gle/abc">Google Form</a>.</p>
        <p>Your test will be hosted on <a href="https://hackerrank.com/coding-round">HackerRank</a>.</p>
        <p><a href="https://example.com/unsubscribe?user=123">Unsubscribe</a></p>
      </div>
    `;

    const links = extractActionLinks(html);
    expect(links.length).toBe(2); // Unsubscribe link should be filtered out
    expect(links[0].type).toBe('assessment');
    expect(links[1].type).toBe('registration');
  });
});
