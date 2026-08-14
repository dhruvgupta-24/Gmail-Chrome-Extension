import { describe, it, expect } from 'vitest';
import { decodeBase64Url, htmlToPlainText, parseSender, parseGmailMessage } from '../src/services/gmail/parser';
import { GmailMessageResource } from '../src/types/gmail';

describe('Gmail Parser', () => {
  it('decodes base64url strings with UTF-8 support correctly', () => {
    // "Hello World! 🎓" in base64url
    const raw = 'SGVsbG8gV29ybGQhIPCfjpM';
    const decoded = decodeBase64Url(raw);
    expect(decoded).toBe('Hello World! 🎓');
  });

  it('parses sender names and email addresses correctly', () => {
    expect(parseSender('Placement Cell <placement@univ.edu>')).toEqual({
      name: 'Placement Cell',
      email: 'placement@univ.edu'
    });

    expect(parseSender('"Prof. Alan Turing" <turing@cambridge.ac.uk>')).toEqual({
      name: 'Prof. Alan Turing',
      email: 'turing@cambridge.ac.uk'
    });

    expect(parseSender('admissions@university.edu')).toEqual({
      name: 'admissions@university.edu',
      email: 'admissions@university.edu'
    });
  });

  it('converts HTML body to clean plain text', () => {
    const html = `
      <div>
        <p>Dear Student,</p>
        <p>Your <b>Online Assessment</b> is scheduled for tomorrow.</p>
        <p>Click <a href="https://hackerrank.com/test-123">Start Assessment</a> to begin.</p>
      </div>
    `;
    const clean = htmlToPlainText(html);
    expect(clean).toContain('Dear Student,');
    expect(clean).toContain('Online Assessment is scheduled for tomorrow.');
    expect(clean).toContain('Start Assessment (https://hackerrank.com/test-123)');
  });

  it('parses full Gmail message resource into ParsedEmailMessage', () => {
    const mockRaw: GmailMessageResource = {
      id: 'msg_123',
      threadId: 'th_456',
      internalDate: '1723632000000',
      snippet: 'Reminder: Coding Round tomorrow at 10:00 AM',
      payload: {
        partId: '',
        mimeType: 'text/html',
        filename: '',
        headers: [
          { name: 'Subject', value: 'Google Online Assessment Invitation' },
          { name: 'From', value: 'Google University Programs <univ@google.com>' },
          { name: 'To', value: 'student@univ.edu' },
          { name: 'Date', value: 'Thu, 14 Aug 2026 10:00:00 +0000' }
        ],
        body: {
          size: 100,
          // Base64Url for "<p>Test link: <a href='https://hackerrank.com/google-test'>Take Assessment</a></p>"
          data: 'PHA-VGVzdCBsaW5rOiA8YSBocmVmPSdodHRwczovL2hhY2tlcnJhbmsuY29tL2dvb2dsZS10ZXN0Jz5UYWtlIEFzc2Vzc21lbnQ8L2E-PC9wPg'
        }
      }
    };

    const parsed = parseGmailMessage(mockRaw);
    expect(parsed.id).toBe('msg_123');
    expect(parsed.threadId).toBe('th_456');
    expect(parsed.subject).toBe('Google Online Assessment Invitation');
    expect(parsed.senderName).toBe('Google University Programs');
    expect(parsed.senderEmail).toBe('univ@google.com');
    expect(parsed.links.length).toBeGreaterThan(0);
    expect(parsed.links[0].href).toBe('https://hackerrank.com/google-test');
  });
});
