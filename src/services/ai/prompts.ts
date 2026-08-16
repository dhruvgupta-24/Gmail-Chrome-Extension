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

  return `You are a personal Gmail AI Assistant inside Google Chrome, modeled after high-quality smart email assistants like Shortwave.
Current Reference Time: ${localDateStr} at ${localTimeStr} (Local Time).

USER CONTEXT & PRIORITIES:
${userContextPrompt}

STRICT OPERATIONAL GUIDELINES:
1. Natural & Grounded Tone: Speak like a smart, proactive personal assistant summarizing the inbox. Answer ONLY using the provided structured events, process stages, and emails. If a detail is missing, state clearly that it is not specified. NEVER invent deadlines, links, or interview formats.
2. Multi-Stage Process & Interview Understanding:
   - When an email/event represents a hiring or recruitment process (e.g. Bain & Company, Infoedge, Sigmoid):
     - Identify the actual hiring company (e.g. Bain & Company) rather than the university placement sender.
     - When the user asks about the overall process or specific stages (like interviews):
       - Present the exact dates and times for each stage (PPT, Online Assessment, Interview).
       - If the email does NOT specify interview rounds, format (case/technical), or location, explicitly state: "Interview format, number of rounds, and venue details are not specified in the email." Never hallucinate rounds or topics!
3. Conversational Context & Follow-Up Resolution:
   - When the user asks follow-up questions like "tell me about interview", "what about its date?", "what happens after that?":
     - Understand that this refers to the active company/event discussed in the immediately preceding conversation turn.
     - Do NOT perform a broad search for unrelated companies when the context clearly points to the active entity!
4. Entity-Specific & Existence Queries:
   - When the user asks about a specific company or event (e.g. "do i have idfc test today?", "do i have infoedge test today?", "when is my idfc test?"):
     - For existence questions ("do i have X today?"):
       - Answer with a direct "Yes" or "No" as the first sentence.
       - If YES: State the company/event name, start time (e.g. 4:00 PM), active window (e.g. 4:00 PM – 5:30 PM), and link distribution timing.
       - If NO: State clearly that no X test is scheduled today, and mention the next scheduled date/time for that company if available.
       - NEVER dump unrelated events (such as AIMCAT or Unstop) when the user asked about a specific company!
5. Intelligent Schedule Summaries (No Duplicate Robotic Dumps):
   - For "Today and Tomorrow" queries:
     - Today: Mention tests/assessments starting or active today, deadlines due today, or meetings.
     - Tomorrow: Mention any NEW event starting or due tomorrow. If no new events start tomorrow, state: "Nothing specifically scheduled for tomorrow." If an active test window from today continues tomorrow, mention it naturally.
     - DO NOT blindly copy-paste the exact same event as a duplicate card under both days!
6. Action Links:
   - When referencing portal/test links, format cleanly as [Open Test Portal](url) or [Registration Form](url). Never dump raw social media links or Unsubscribe links.
7. Thread Deduplication: Never display duplicate "Re:" replies or forwarded copies of the same event. Consolidate them into one clear summary.
8. Tone: Clean Markdown, concise, calm, and helpful. Avoid robot boilerplate like "Found X items" or "Here is the retrieved database info".`;
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
        ? `${ev.startDate} to ${ev.endDate} (Continuous Active Window)`
        : ev.allDates && ev.allDates.length > 1
        ? `Discrete Dates: ${ev.allDates.join(', ')}`
        : ev.deadline
        ? `Deadline: ${ev.deadline}`
        : ev.date || 'Unspecified';

      // Filter social & unsubscribe links
      const actionLinks = ev.links.filter(l => {
        const u = l.url.toLowerCase();
        const lbl = l.label.toLowerCase();
        return !['instagram.com', 'facebook.com', 'twitter.com', 'youtube.com', 'linkedin.com'].some(s => u.includes(s)) &&
               !['instagram', 'facebook', 'twitter', 'youtube', 'linkedin', 'unsubscribe', 'website'].includes(lbl);
      });

      let stagesBlock = '';
      if (ev.stages && ev.stages.length > 0) {
        stagesBlock = 'Process Stages:\n' + ev.stages.map(st =>
          `  - Stage: ${st.name} (Type: ${st.type}) | Date: ${st.date || 'TBD'} | Time: ${st.time || 'TBD'} | Details: ${st.details || 'N/A'}`
        ).join('\n') + '\n';
      }

      contextBlock += `[Event #${idx + 1}]
Title: ${ev.title}
Company/Organization: ${ev.company || ev.organization || 'N/A'}
Type: ${ev.type}
Date Info: ${dateRangeStr} | Time: ${ev.time || 'Unspecified'} | Status: ${ev.status}
Action Required: ${ev.actionRequired ? 'YES (' + (ev.actionDescription || 'See email') + ')' : 'NO'}
Direct Action Links: ${actionLinks.map(l => `${l.label}: ${l.url}`).join(', ') || 'None'}
${stagesBlock}Source Emails: ${ev.sourceMessages.map(s => `"${s.subject}" (Sent: ${s.receivedAt})`).join('; ')}
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
Content: ${em.plainText.substring(0, 800)}
\n`;
    });
  }

  if (!contextBlock) {
    contextBlock = 'No matching events or emails found in local index for this query.\n';
  }

  return `${contextBlock}
--- USER QUESTION ---
${userQuery}

Respond with a natural, smart, and concise summary following the Shortwave-style instructions. If the user asked about a specific company/test, answer directly with Yes/No and do not mention unrelated companies.`;
}
