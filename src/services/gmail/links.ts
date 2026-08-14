import { ActionLink, ActionLinkType } from '../../types/events';

// URLs that are almost never actionable for students
const IGNORED_URL_PATTERNS = [
  /unsubscribe/i,
  /opt-out/i,
  /privacy-policy/i,
  /terms-of-service/i,
  /mail\.google\.com/i,
  /support\.google\.com/i,
  /twitter\.com/i,
  /facebook\.com/i,
  /instagram\.com/i,
  /linkedin\.com\/company/i,
  /list-manage\.com/i,
  /email-tracking/i,
  /pixel\./i,
  /doubleclick\.net/i
];

/**
 * Normalizes URL and strips common tracking query parameters.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    // Strip tracking parameters
    const paramsToStrip = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'mc_cid', 'mc_eid'];
    paramsToStrip.forEach(param => url.searchParams.delete(param));
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Categorizes an actionable link based on domain, path, and anchor text.
 */
export function classifyLinkType(url: string, anchorText: string = ''): { type: ActionLinkType; label: string } {
  const lowerUrl = url.toLowerCase();
  const lowerText = anchorText.toLowerCase();

  // 1. Assessment / Test portals
  if (
    lowerUrl.includes('hackerrank.com') ||
    lowerUrl.includes('leetcode.com') ||
    lowerUrl.includes('codechef.com') ||
    lowerUrl.includes('mettl.com') ||
    lowerUrl.includes('wheebox.com') ||
    lowerUrl.includes('hirevue.com') ||
    lowerUrl.includes('shl.com') ||
    lowerText.includes('start test') ||
    lowerText.includes('take assessment') ||
    lowerText.includes('coding test') ||
    lowerText.includes('exam link') ||
    lowerText.includes('test link')
  ) {
    let label = 'Open Assessment';
    if (lowerUrl.includes('hackerrank.com')) label = 'Open HackerRank Test';
    else if (lowerUrl.includes('mettl.com')) label = 'Open Mettl Assessment';
    else if (lowerUrl.includes('hirevue.com')) label = 'Open HireVue Interview';
    else if (lowerText.length > 2 && lowerText.length < 30) label = anchorText.trim();
    return { type: 'assessment', label };
  }

  // 2. Registration & Forms
  if (
    lowerUrl.includes('forms.gle') ||
    lowerUrl.includes('docs.google.com/forms') ||
    lowerUrl.includes('unstop.com') ||
    lowerUrl.includes('superset.com') ||
    lowerUrl.includes('joinsuperset.com') ||
    lowerText.includes('register') ||
    lowerText.includes('apply now') ||
    lowerText.includes('registration form') ||
    lowerText.includes('fill form') ||
    lowerText.includes('rsvp')
  ) {
    let label = 'Open Registration';
    if (lowerUrl.includes('unstop.com')) label = 'Open Unstop Challenge';
    else if (lowerUrl.includes('forms.gle') || lowerUrl.includes('docs.google.com/forms')) label = 'Open Google Form';
    else if (lowerUrl.includes('superset')) label = 'Open Superset Profile';
    else if (lowerText.length > 2 && lowerText.length < 30) label = anchorText.trim();
    return { type: 'registration', label };
  }

  // 3. Submissions & LMS (Canvas, Moodle, Classroom, Blackboard)
  if (
    lowerUrl.includes('moodle') ||
    lowerUrl.includes('canvas') ||
    lowerUrl.includes('blackboard') ||
    lowerUrl.includes('classroom.google.com') ||
    lowerText.includes('submit') ||
    lowerText.includes('assignment') ||
    lowerText.includes('turn in')
  ) {
    let label = 'Open Submission';
    if (lowerUrl.includes('moodle')) label = 'Open Moodle';
    else if (lowerUrl.includes('canvas')) label = 'Open Canvas';
    else if (lowerUrl.includes('classroom.google.com')) label = 'Open Google Classroom';
    else if (lowerText.length > 2 && lowerText.length < 30) label = anchorText.trim();
    return { type: 'submission', label };
  }

  // 4. Video / Meeting / Interview
  if (
    lowerUrl.includes('zoom.us') ||
    lowerUrl.includes('meet.google.com') ||
    lowerUrl.includes('teams.microsoft.com') ||
    lowerUrl.includes('webex.com') ||
    lowerText.includes('join meeting') ||
    lowerText.includes('interview link') ||
    lowerText.includes('video call')
  ) {
    let label = 'Join Interview / Meeting';
    if (lowerUrl.includes('meet.google.com')) label = 'Join Google Meet';
    else if (lowerUrl.includes('zoom.us')) label = 'Join Zoom';
    else if (lowerUrl.includes('teams.microsoft.com')) label = 'Join Teams Meeting';
    return { type: 'meeting', label };
  }

  // Default fallback
  const label = lowerText.length > 2 && lowerText.length < 30 ? anchorText.trim() : 'Open Link';
  return { type: 'general', label };
}

/**
 * Extracts all relevant actionable URLs from HTML and plain text.
 */
export function extractActionLinks(htmlOrText: string): ActionLink[] {
  const results: ActionLink[] = [];
  const seenUrls = new Set<string>();

  // 1. Extract from HTML anchor tags: <a href="..." ...>Text</a>
  const anchorRegex = /<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"'>]+)["'][^>]*>(.*?)<\/a>/gis;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(htmlOrText)) !== null) {
    const rawUrl = match[1];
    const rawAnchorText = match[2].replace(/<[^>]+>/g, '').trim();
    const cleanUrl = sanitizeUrl(rawUrl);

    if (shouldIncludeUrl(cleanUrl)) {
      if (!seenUrls.has(cleanUrl)) {
        seenUrls.add(cleanUrl);
        const { type, label } = classifyLinkType(cleanUrl, rawAnchorText);
        results.push({ label, url: cleanUrl, type });
      }
    }
  }

  // 2. Extract plain text URLs: https://...
  const plainUrlRegex = /(https?:\/\/[^\s<>"'\)]+)/gi;
  while ((match = plainUrlRegex.exec(htmlOrText)) !== null) {
    const rawUrl = match[1].replace(/[.,;:!?]+$/, ''); // Strip trailing punctuation
    const cleanUrl = sanitizeUrl(rawUrl);

    if (shouldIncludeUrl(cleanUrl) && !seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl);
      const { type, label } = classifyLinkType(cleanUrl, '');
      results.push({ label, url: cleanUrl, type });
    }
  }

  // Prioritize high-value action links (assessments, registrations, meetings first)
  const priorityOrder: Record<ActionLinkType, number> = {
    assessment: 1,
    registration: 2,
    meeting: 3,
    submission: 4,
    portal: 5,
    general: 6
  };

  return results
    .sort((a, b) => (priorityOrder[a.type || 'general'] || 10) - (priorityOrder[b.type || 'general'] || 10))
    .slice(0, 5); // Return up to top 5 most relevant links
}

function shouldIncludeUrl(url: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  for (const pattern of IGNORED_URL_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  // Check if it's a known academic platform or valid external link
  return true;
}
