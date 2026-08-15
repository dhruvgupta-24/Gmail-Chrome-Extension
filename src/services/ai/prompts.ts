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
2. Date-Range Queries: When the user asks for a date range (e.g. "from 15th August to 20th August"):
   - Filter and include ONLY events whose actual event dates / assessment windows overlap the requested range.
   - The email received/sent date must NEVER be treated as the event date.
   - Format the response with a clean schedule header, e.g.:
     # Your schedule: Aug 15–20, 2026
     ## Aug 15
     - **Event Title** (Company)
       - Details, time, actions, links
     ## Aug 15–19
     - **Cognizant Assessment**
       - Window: Aug 15–19
   - If no events are scheduled in that range, explicitly state that no events were found for that period.
3. No Raw Meta Dump: Never start your response with "Found X relevant items" or robotic retrieval summaries. Jump straight into the organized answer.
4. Thread Deduplication: Do not show repeated "Re:" or multiple copies of the same thread/event. Provide one consolidated summary per unique event.
5. Action Links & Traceability: When discussing tests or forms, reference the specific action link or mention that it is available in the email.
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
      const dateRangeStr = ev.startDate && ev.endDate && ev.startDate !== ev.endDate
        ? `${ev.startDate} to ${ev.endDate}`
        : ev.startDate || ev.date || 'Unspecified';

      contextBlock += `[Event #${idx + 1}]
Title: ${ev.title}
Company/Organization: ${ev.company || ev.organization || 'N/A'}
Type: ${ev.type}
Event Date / Window: ${dateRangeStr} | Time: ${ev.time || 'Unspecified'} | Status: ${ev.status}
Action Required: ${ev.actionRequired ? 'YES (' + (ev.actionDescription || 'See email') + ')' : 'NO'}
Links: ${ev.links.map(l => `${l.label}: ${l.url}`).join(', ') || 'None'}
Source Emails: ${ev.sourceMessages.map(s => `"${s.subject}" (Sent: ${s.receivedAt})`).join('; ')}
\n`;
    });
  }

  if (emails && emails.length > 0) {
    contextBlock += '--- RELEVANT RETRIEVED EMAILS ---\n';
    emails.slice(0, 6).forEach((em, idx) => {
      contextBlock += `[Email #${idx + 1}]
Subject: ${em.subject}
From: ${em.sender}
Date Sent: ${em.date}
Snippet: ${em.snippet}
Content: ${em.plainText.substring(0, 1000)}
Links: ${em.links.map(l => `${l.text} -> ${l.href}`).join('; ') || 'None'}
\n`;
    });
  }

  if (!contextBlock) {
    contextBlock = 'No matching events or emails found in local index for this query.\n';
  }

  return `${contextBlock}
--- USER QUESTION ---
${userQuery}

Provide a concise, grounded, and actionable response based on the above information following the formatting rules.`;
}
