import { ParsedEmailMessage } from '../../types/gmail';
import { ExtractedEvent } from '../../types/events';

export function buildSystemPrompt(userContextPrompt: string, nowDate: Date = new Date()): string {
  const localDateStr = nowDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const localTimeStr = nowDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return `You are a personal Gmail AI Assistant inside Google Chrome.
Current Reference Time: ${localDateStr} at ${localTimeStr} (Local Time).

USER CONTEXT & PRIORITIES:
${userContextPrompt}

STRICT OPERATIONAL GUIDELINES:
1. Grounding & Anti-Hallucination: Answer ONLY using the provided emails and extracted events. If a date, time, link, or instruction is not present in the retrieved emails, state clearly that it is not specified. NEVER invent or assume deadlines, test links, or email senders.
2. Prioritize Actionable Information: Highlight things due today, due tomorrow, upcoming exams/assessments, interviews, submissions, and registrations.
3. Chronological Clarity: Group or sort events by Today, Tomorrow, and Upcoming. Always mention explicit dates and times when available.
4. Action Links & Traceability: When discussing tests or forms, reference the specific action link or mention that it is available in the email.
5. Follow-Up Resolution: If the user refers to previous items (e.g. "the first test", "that registration link"), use the conversation history to resolve the reference accurately.
6. Tone: Calm, concise, professional, clear. Avoid unnecessary fluff or robotic boilerplate. Use clean Markdown formatting.`;
}

export function buildUserPromptWithContext(
  userQuery: string,
  emails: ParsedEmailMessage[],
  extractedEvents?: ExtractedEvent[]
): string {
  let contextBlock = '';

  if (extractedEvents && extractedEvents.length > 0) {
    contextBlock += '--- STRUCTURED EVENTS EXTRACTED FROM EMAILS ---\n';
    extractedEvents.slice(0, 10).forEach((ev, idx) => {
      contextBlock += `[Event #${idx + 1}]
Title: ${ev.title}
Type: ${ev.type}
Date: ${ev.date || 'Unspecified'} | Time: ${ev.time || 'Unspecified'} | Status: ${ev.status}
Organization: ${ev.organization || 'N/A'}
Action Required: ${ev.actionRequired ? 'YES (' + (ev.actionDescription || 'See email') + ')' : 'NO'}
Links: ${ev.links.map(l => `${l.label}: ${l.url}`).join(', ') || 'None'}
Source Email: ${ev.sourceMessages.map(s => `"${s.subject}" from ${s.sender || 'Unknown'}`).join('; ')}
\n`;
    });
  }

  if (emails && emails.length > 0) {
    contextBlock += '--- RELEVANT RETRIEVED EMAILS ---\n';
    emails.slice(0, 8).forEach((em, idx) => {
      contextBlock += `[Email #${idx + 1}]
Subject: ${em.subject}
From: ${em.sender}
Date Sent: ${em.date}
Snippet / Excerpt: ${em.snippet}
Content Excerpt: ${em.plainText.substring(0, 1200)}
Extracted Links: ${em.links.map(l => `${l.text} -> ${l.href}`).join('; ') || 'None'}
\n`;
    });
  }

  if (!contextBlock) {
    contextBlock = 'No relevant emails found for this query in the searched window.\n';
  }

  return `${contextBlock}
--- USER QUESTION ---
${userQuery}

Provide a concise, grounded, and actionable response based on the above information.`;
}
