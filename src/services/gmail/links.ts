import { ActionLink, ActionLinkType, EventType } from '../../types/events';

// URL patterns that are strictly non-actionable (tracking, footers, policies, social, generic)
const IGNORED_URL_PATTERNS = [
  /unsubscribe/i,
  /opt-?out/i,
  /manage[-_]?preferences/i,
  /email[-_]?preferences/i,
  /privacy[-_]?policy/i,
  /terms(?:[-_]?of[-_]?(?:service|use))?/i,
  /cookie[-_]?policy/i,
  /disclaimer/i,
  /mail\.google\.com/i,
  /support\.google\.com/i,
  /accounts\.google\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /facebook\.com/i,
  /instagram\.com/i,
  /linkedin\.com/i,
  /youtube\.com/i,
  /tiktok\.com/i,
  /pinterest\.com/i,
  /t\.me/i,
  /telegram\.me/i,
  /play\.google\.com/i,
  /apps\.apple\.com/i,
  /list-manage\.com/i,
  /mailchimp\.com/i,
  /sendgrid\.net/i,
  /mandrillapp\.com/i,
  /email-tracking/i,
  /pixel\./i,
  /doubleclick\.net/i,
  /awstrack\.me/i,
  /hubspot\.com/i,
  /bit\.ly\/(?:fb|tw|ig|yt)/i
];

// Anchor text patterns that are strictly non-actionable
const IGNORED_ANCHOR_PATTERNS = [
  /^unsubscribe$/i,
  /^opt[- ]?out$/i,
  /manage\s+preferences/i,
  /update\s+preferences/i,
  /email\s+preferences/i,
  /privacy\s+policy/i,
  /terms\s+(?:of\s+service|and\s+conditions|of\s+use)/i,
  /terms\s*&\s*conditions/i,
  /^privacy$/i,
  /^terms$/i,
  /^disclaimer$/i,
  /^visit\s+(?:our\s+)?website\s*→?$/i,
  /^our\s+website$/i,
  /^website$/i,
  /^homepage$/i,
  /^home$/i,
  /^view\s+in\s+browser$/i,
  /^view\s+online$/i,
  /^web\s+version$/i,
  /^click\s+here\s+to\s+view$/i,
  /^download\s+(?:the\s+)?app$/i,
  /^google\s+play$/i,
  /^app\s+store$/i,
  /^contact\s+us$/i,
  /^about\s+us$/i,
  /^help\s+center$/i,
  /^faq$/i,
  /^support$/i,
  /^feedback$/i,
  /^report\s+spam$/i,
  /^facebook$/i,
  /^twitter$/i,
  /^instagram$/i,
  /^linkedin$/i,
  /^youtube$/i,
  /^instagram\s+handle$/i
];

/**
 * Unwraps known redirection wrappers such as Google redirect URLs and Outlook SafeLinks.
 */
export function unwrapRedirectUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  try {
    const trimmed = rawUrl.trim();
    // 1. Google redirect wrapper: https://www.google.com/url?q=https://...
    if (trimmed.includes('google.com/url') && trimmed.includes('q=')) {
      const parsed = new URL(trimmed);
      const target = parsed.searchParams.get('q');
      if (target && target.startsWith('http')) {
        return unwrapRedirectUrl(target);
      }
    }

    // 2. Outlook SafeLinks: https://*.safelinks.protection.outlook.com/?url=https%3A%2F%2F...
    if (trimmed.includes('safelinks.protection.outlook.com') && trimmed.includes('url=')) {
      const parsed = new URL(trimmed);
      const target = parsed.searchParams.get('url');
      if (target && target.startsWith('http')) {
        return unwrapRedirectUrl(target);
      }
    }

    return trimmed;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Normalizes URL, unwraps redirects, and strips common tracking query parameters.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const unwrapped = unwrapRedirectUrl(rawUrl);
    const url = new URL(unwrapped);

    // Strip tracking parameters
    const paramsToStrip = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name',
      'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'fbclid', 'gclid', 'ref', 'source', 'trk',
      'mkt_tok', 'sc_src', 'sc_lid', 'sc_uid', 'sc_llid', 'guccounter', '_ga', '_gl',
      'dclid', 'msclkid', 'yclid', 'usp', 'usp_link'
    ];
    paramsToStrip.forEach(param => url.searchParams.delete(param));

    // Remove trailing slashes and hash if empty
    let clean = url.toString().replace(/\/+$/, '');
    if (clean.endsWith('#')) clean = clean.slice(0, -1);
    return clean;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Checks if URL or anchor text represents non-actionable boilerplate (marketing, legal, unsubscribe).
 */
export function isIgnoredLink(url: string, anchorText: string = ''): boolean {
  if (!url || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('javascript:')) {
    return true;
  }

  const cleanUrl = url.trim().toLowerCase();
  const cleanAnchor = anchorText.trim();

  // Check URL patterns
  for (const pattern of IGNORED_URL_PATTERNS) {
    if (pattern.test(cleanUrl)) return true;
  }

  // Check Anchor Text patterns
  for (const pattern of IGNORED_ANCHOR_PATTERNS) {
    if (pattern.test(cleanAnchor)) return true;
  }

  return false;
}

/**
 * Classifies an actionable link into semantic types: assessment, registration, meeting, portal, submission, or general.
 */
export function classifyLinkType(url: string, anchorText: string = ''): { type: ActionLinkType; label: string } | null {
  if (isIgnoredLink(url, anchorText)) return null;

  const cleanUrl = sanitizeUrl(url);
  const lowerUrl = cleanUrl.toLowerCase();
  const lowerAnchor = anchorText.toLowerCase().trim();

  // 1. Video Meeting Links (Interviews, PPTs, Webinars)
  if (
    lowerUrl.includes('meet.google.com') ||
    lowerUrl.includes('teams.microsoft.com') ||
    lowerUrl.includes('teams.live.com') ||
    lowerUrl.includes('zoom.us') ||
    lowerUrl.includes('webex.com') ||
    lowerUrl.includes('chime.aws')
  ) {
    let label = 'Join Meeting';
    if (lowerUrl.includes('teams.')) label = 'Join Teams Meeting';
    else if (lowerUrl.includes('meet.google')) label = 'Join Google Meet';
    else if (lowerUrl.includes('zoom.')) label = 'Join Zoom Call';
    else if (lowerUrl.includes('webex.')) label = 'Join Webex Meeting';

    if (lowerAnchor.includes('ppt') || lowerAnchor.includes('presentation')) {
      label = 'Join PPT Session';
    } else if (lowerAnchor.includes('interview')) {
      label = 'Join Interview Call';
    }

    return { type: 'meeting', label };
  }

  // 2. Online Assessment & Coding Round Platforms
  const isAssessmentPlatform =
    lowerUrl.includes('hackerrank.com') ||
    lowerUrl.includes('hackerearth.com') ||
    lowerUrl.includes('mettl.com') ||
    lowerUrl.includes('wheebox.com') ||
    lowerUrl.includes('codesignal.com') ||
    lowerUrl.includes('codility.com') ||
    lowerUrl.includes('hirepro.in') ||
    lowerUrl.includes('cocubes.com') ||
    lowerUrl.includes('amcat.com') ||
    lowerUrl.includes('glider.ai') ||
    lowerUrl.includes('leetcode.com') ||
    lowerUrl.includes('codeforces.com') ||
    lowerUrl.includes('testgorilla.com') ||
    lowerUrl.includes('talview.com') ||
    lowerUrl.includes('time4education.com/start-test') ||
    lowerUrl.includes('assessment') ||
    lowerUrl.includes('eval.ai');

  const isAssessmentAnchor =
    /\b(take\s+(?:the\s+)?test|start\s+(?:the\s+)?test|take\s+(?:the\s+)?assessment|start\s+(?:the\s+)?assessment|begin\s+(?:the\s+)?test|coding\s+round|online\s+assessment|test\s+link|assessment\s+link|test\s+portal)\b/i.test(
      lowerAnchor
    );

  if (isAssessmentPlatform || isAssessmentAnchor) {
    let label = 'Start Assessment';
    if (lowerUrl.includes('hackerrank.com')) label = 'Open HackerRank Test';
    else if (lowerUrl.includes('mettl.com')) label = 'Open Mettl Assessment';
    else if (lowerUrl.includes('wheebox.com')) label = 'Open Wheebox Test';
    else if (lowerUrl.includes('codesignal.com')) label = 'Open CodeSignal Test';
    else if (lowerUrl.includes('time4education.com')) label = 'Start AIMCAT Test';
    else if (lowerAnchor.includes('coding')) label = 'Start Coding Round';
    else if (lowerAnchor.includes('test')) label = 'Start Online Test';

    return { type: 'assessment', label };
  }

  // 3. Registrations, Application Forms, Competitions
  const isRegistrationForm =
    lowerUrl.includes('forms.gle') ||
    lowerUrl.includes('docs.google.com/forms') ||
    lowerUrl.includes('typeform.com') ||
    lowerUrl.includes('airtable.com') ||
    lowerUrl.includes('surveymonkey.com') ||
    lowerUrl.includes('unstop.com/competitions') ||
    lowerUrl.includes('unstop.com/hackathons') ||
    lowerUrl.includes('unstop.com/jobs') ||
    lowerUrl.includes('unstop.com/internships') ||
    lowerUrl.includes('unstop.com/o') ||
    lowerUrl.includes('unstop.com/p') ||
    lowerUrl.includes('unstop.com/c') ||
    lowerUrl.includes('drreddys.com/careers') ||
    lowerUrl.includes('supersets.in') ||
    lowerUrl.includes('myanatomy.in') ||
    lowerUrl.includes('apply');

  const isRegistrationAnchor =
    /\b(register\s+now|register\s+here|click\s+to\s+register|registration\s+link|registration\s+form|apply\s+now|apply\s+here|application\s+form|sign\s+up|nominate\s+here|submit\s+nomination)\b/i.test(
      lowerAnchor
    );

  if (isRegistrationForm || isRegistrationAnchor) {
    let label = 'Register Now';
    if (lowerUrl.includes('forms.gle') || lowerUrl.includes('docs.google.com/forms')) {
      label = 'Open Registration Form';
    } else if (lowerUrl.includes('unstop.com')) {
      label = 'Register on Unstop';
    } else if (lowerUrl.includes('apply') || lowerAnchor.includes('apply')) {
      label = 'Apply Now';
    } else if (lowerAnchor.includes('nomination')) {
      label = 'Submit Nomination';
    }
    return { type: 'registration', label };
  }

  // 4. Academic Submissions & LMS (Moodle, Canvas, Blackboard, Classroom)
  if (
    lowerUrl.includes('classroom.google.com') ||
    lowerUrl.includes('moodle') ||
    lowerUrl.includes('instructure.com') ||
    lowerUrl.includes('blackboard.com') ||
    lowerAnchor.includes('submit assignment') ||
    lowerAnchor.includes('turn in') ||
    lowerAnchor.includes('upload submission')
  ) {
    return { type: 'submission', label: 'Open Submission Portal' };
  }

  // 5. Portals & Dashboards (TCS iON, Superset, College Placements Portal)
  if (
    lowerUrl.includes('tcsion.com') ||
    lowerUrl.includes('supersets.in') ||
    lowerUrl.includes('joinhandshake.com') ||
    lowerAnchor.includes('view results') ||
    lowerAnchor.includes('admit card') ||
    lowerAnchor.includes('candidate portal')
  ) {
    return { type: 'portal', label: 'Open Candidate Portal' };
  }

  return null;
}

/**
 * Extracts and classifies all actionable links from HTML body or plain text.
 */
export function extractActionLinks(htmlOrText: string): ActionLink[] {
  if (!htmlOrText) return [];

  const rawCandidates: ActionLink[] = [];

  // 1. Extract HTML <a> tags: <a href="..." ...>anchor</a>
  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = anchorRegex.exec(htmlOrText)) !== null) {
    const rawUrl = match[1];
    const rawAnchor = match[2].replace(/<[^>]+>/g, '').trim(); // Strip nested HTML in anchor
    const cleanUrl = sanitizeUrl(rawUrl);

    const classified = classifyLinkType(cleanUrl, rawAnchor);
    if (classified) {
      rawCandidates.push({ label: classified.label, url: cleanUrl, type: classified.type });
    }
  }

  // 2. Extract plain text URLs: https://...
  const plainUrlRegex = /(https?:\/\/[^\s<>"'\)]+)/gi;
  while ((match = plainUrlRegex.exec(htmlOrText)) !== null) {
    const rawUrl = match[1].replace(/[.,;:!?]+$/, ''); // Strip trailing punctuation
    const cleanUrl = sanitizeUrl(rawUrl);

    const classified = classifyLinkType(cleanUrl, '');
    if (classified) {
      rawCandidates.push({ label: classified.label, url: cleanUrl, type: classified.type });
    }
  }

  return deduplicateActionLinks(rawCandidates);
}

/**
 * Deduplicates links semantically:
 * - Collapses duplicate action buttons with identical canonical destinations.
 * - Suppresses generic root homepages (e.g. unstop.com) if a specific deep-link exists.
 * - Preserves genuinely distinct actions (e.g. Apply, Join Teams, View Results).
 */
export function deduplicateActionLinks(links: ActionLink[]): ActionLink[] {
  if (!links || links.length === 0) return [];

  const uniqueResults: ActionLink[] = [];
  const seenCanonicalUrls = new Set<string>();

  // Check if any specific deep link exists for platforms like Unstop
  const hasSpecificUnstop = links.some(l => {
    const u = sanitizeUrl(l.url).toLowerCase();
    return u.includes('unstop.com/') && !u.endsWith('unstop.com') && !u.endsWith('unstop.com/');
  });

  // Prioritize high-value action links (assessments, registrations, meetings first)
  const priorityOrder: Record<ActionLinkType, number> = {
    assessment: 1,
    registration: 2,
    meeting: 3,
    submission: 4,
    portal: 5,
    general: 6
  };

  const sortedCandidates = [...links].sort(
    (a, b) => (priorityOrder[a.type || 'general'] || 10) - (priorityOrder[b.type || 'general'] || 10)
  );

  for (const item of sortedCandidates) {
    const cleanUrl = sanitizeUrl(item.url);
    const normUrl = cleanUrl.toLowerCase().replace(/\/+$/, '');

    // Suppress bare root homepage when a specific competition/form exists
    if (hasSpecificUnstop && (normUrl === 'https://unstop.com' || normUrl === 'http://unstop.com')) {
      continue;
    }

    // Canonical key based on destination URL
    if (seenCanonicalUrls.has(normUrl)) {
      continue;
    }

    seenCanonicalUrls.add(normUrl);
    uniqueResults.push({
      label: item.label,
      url: cleanUrl,
      type: item.type
    });
  }

  return uniqueResults.slice(0, 3);
}

/**
 * Filters actionable links strictly compatible with the given event or stage type.
 */
export function filterActionLinksForEventType(type: EventType, links: ActionLink[] = []): ActionLink[] {
  if (!links || links.length === 0) return [];

  const deduped = deduplicateActionLinks(links);

  // 1. Coding Round / Assessment / Exam / Quiz
  if (['assessment', 'coding_round', 'test', 'quiz', 'exam'].includes(type)) {
    // Return assessment, portal, or registration links; strictly reject meeting links (Teams/Zoom/Meet)
    const testLinks = deduped.filter(l => l.type === 'assessment' || l.type === 'portal');
    if (testLinks.length > 0) return testLinks;
    return deduped.filter(l => l.type !== 'meeting');
  }

  // 2. PPT / Webinar / Talks
  if (type === 'ppt') {
    // Return meeting links; strictly reject tests or unrelated registrations
    const meetingLinks = deduped.filter(l => l.type === 'meeting');
    if (meetingLinks.length > 0) return meetingLinks;
    return [];
  }

  // 3. Interview
  if (type === 'interview') {
    return deduped.filter(l => l.type === 'meeting' || l.type === 'portal');
  }

  // 4. Registration / Nomination / Hackathon
  if (['registration', 'nomination', 'hackathon'].includes(type)) {
    return deduped.filter(l => l.type === 'registration' || l.type === 'submission' || l.type === 'portal');
  }

  return deduped;
}
