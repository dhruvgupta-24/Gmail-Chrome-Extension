import { GmailMessageResource, ParsedEmailMessage } from '../../types/gmail';
import { extractActionLinks } from './links';
import { cleanText } from '../../shared/utils';

/**
 * Decodes Gmail's web-safe Base64URL string into UTF-8 text.
 */
export function decodeBase64Url(base64Url: string): string {
  try {
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (error) {
    console.warn('Error decoding base64url content:', error);
    try {
      if (typeof atob !== 'undefined') {
        return atob(base64Url.replace(/-/g, '+').replace(/_/g, '/'));
      }
      return '';
    } catch {
      return '';
    }
  }
}

/**
 * Converts HTML body to clean plain text, preserving paragraphs, lists, and link cues.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  return html
    // Replace script/style tags and contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Replace breaks and paragraphs with newlines
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, ' • ')
    // Replace links with text + url annotations if clear
    .replace(/<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"'>]+)["'][^>]*>(.*?)<\/a>/gi, (_, href, text) => {
      const cleanLabel = text.replace(/<[^>]+>/g, '').trim();
      return cleanLabel && cleanLabel !== href ? `${cleanLabel} (${href})` : href;
    })
    // Strip all remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode basic HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Recursively extracts plain text and HTML from Gmail message payload parts.
 */
function extractBodyParts(payload: GmailMessageResource['payload']): { plainText: string; htmlContent: string } {
  let plainText = '';
  let htmlContent = '';

  if (!payload) return { plainText, htmlContent };

  // Direct body on payload
  if (payload.body && payload.body.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/html') {
      htmlContent += decoded;
    } else if (payload.mimeType === 'text/plain') {
      plainText += decoded;
    }
  }

  // Nested parts
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        plainText += (plainText ? '\n' : '') + decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        htmlContent += (htmlContent ? '\n' : '') + decodeBase64Url(part.body.data);
      } else if (part.parts && part.parts.length > 0) {
        // Recursive extraction (e.g. multipart/related inside multipart/alternative)
        const nested = extractBodyParts(part as GmailMessageResource['payload']);
        if (nested.plainText) plainText += (plainText ? '\n' : '') + nested.plainText;
        if (nested.htmlContent) htmlContent += (htmlContent ? '\n' : '') + nested.htmlContent;
      }
    }
  }

  return { plainText, htmlContent };
}

/**
 * Parses sender header into display name and email address.
 * e.g. "Placement Cell <placement@univ.edu>" -> { name: "Placement Cell", email: "placement@univ.edu" }
 */
export function parseSender(fromHeader: string = ''): { name: string; email: string } {
  const match = fromHeader.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, '').trim();
    return { name: name || match[2], email: match[2].trim() };
  }
  return { name: fromHeader.trim(), email: fromHeader.trim() };
}

/**
 * Parses a raw Gmail API message resource into a clean, structured ParsedEmailMessage.
 */
export function parseGmailMessage(raw: GmailMessageResource): ParsedEmailMessage {
  const headers = raw.payload?.headers || [];
  const getHeader = (name: string): string => {
    const h = headers.find(item => item.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  };

  const subject = getHeader('Subject') || raw.snippet || '(No Subject)';
  const from = getHeader('From');
  const { name: senderName, email: senderEmail } = parseSender(from);
  const recipient = getHeader('To');
  const dateHeader = getHeader('Date');

  // Parse date
  let timestamp = raw.internalDate ? parseInt(raw.internalDate, 10) : Date.now();
  let isoDate = new Date(timestamp).toISOString();

  if (dateHeader) {
    const parsedDate = new Date(dateHeader);
    if (!isNaN(parsedDate.getTime())) {
      timestamp = parsedDate.getTime();
      isoDate = parsedDate.toISOString();
    }
  }

  const { plainText, htmlContent } = extractBodyParts(raw.payload);

  // If plainText is missing, convert HTML to clean plain text
  const normalizedText = plainText ? cleanText(plainText) : htmlToPlainText(htmlContent);

  // Extract actionable links from both HTML and plain text
  const linksCombined = (htmlContent || '') + ' ' + (normalizedText || '');
  const extractedLinks = extractActionLinks(linksCombined).map(l => ({ text: l.label, href: l.url }));

  return {
    id: raw.id,
    threadId: raw.threadId,
    subject: cleanText(subject),
    sender: from,
    senderName,
    senderEmail,
    recipient,
    date: isoDate,
    timestamp,
    snippet: raw.snippet || '',
    plainText: normalizedText,
    htmlContent,
    links: extractedLinks,
    labels: raw.labelIds || []
  };
}
