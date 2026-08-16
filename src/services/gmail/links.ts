import { ActionLink, ActionLinkType } from '../../types/events';

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
 * Normalizes URL and strips common tracking query parameters.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    // Strip tracking parameters
    const paramsToStrip = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'fbclid', 'gclid', 'ref'
    ];
    paramsToStrip.forEach(param => url.searchParams.delete(param));
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Checks whether an anchor text or URL pattern should be strictly excluded.
 */
export function isNonActionable(url: string, anchorText: string = ''): boolean {
  if (!url || !url.startsWith('http')) return true;

  const cleanAnchor = anchorText.trim();

  // Check anchor text against blocklist
  for (const pattern of IGNORED_ANCHOR_PATTERNS) {
    if (pattern.test(cleanAnchor)) return true;
  }

  // Check URL against blocklist
  for (const pattern of IGNORED_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }

  return false;
}

/**
 * Classifies an actionable link based on domain, path, and anchor text.
 * Only returns a valid type if the link is truly actionable for a student/user.
 */
export function classifyLinkType(url: string, anchorText: string = ''): { type: ActionLinkType; label: string } | null {
  const lowerUrl = url.toLowerCase();
  const lowerText = anchorText.toLowerCase().trim();

  if (isNonActionable(url, anchorText)) {
    return null;
  }

  // 1. Assessment / Test portals
  if (
    lowerUrl.includes('hackerrank.com') ||
    lowerUrl.includes('leetcode.com') ||
    lowerUrl.includes('codechef.com') ||
    lowerUrl.includes('mettl.com') ||
    lowerUrl.includes('wheebox.com') ||
    lowerUrl.includes('hirevue.com') ||
    lowerUrl.includes('shl.com') ||
    lowerUrl.includes('assessment') ||
    lowerUrl.includes('cocubes.com') ||
    lowerUrl.includes('amcat') ||
    lowerUrl.includes('myanatomy') ||
    lowerText.includes('start test') ||
    lowerText.includes('take test') ||
    lowerText.includes('take assessment') ||
    lowerText.includes('start assessment') ||
    lowerText.includes('coding test') ||
    lowerText.includes('exam link') ||
    lowerText.includes('test link') ||
    lowerText.includes('online test') ||
    lowerText.includes('test portal')
  ) {
    let label = 'Start Test';
    if (lowerText.includes('take assessment') || lowerText.includes('start assessment') || lowerUrl.includes('assessment')) {
      label = 'Take Assessment';
    } else if (lowerUrl.includes('hackerrank.com')) {
      label = 'Open HackerRank Test';
    } else if (lowerUrl.includes('mettl.com')) {
      label = 'Open Mettl Assessment';
    } else if (lowerUrl.includes('hirevue.com')) {
      label = 'Open HireVue Interview';
    } else if (lowerText.length > 2 && lowerText.length < 32 && !isGenericAnchor(lowerText)) {
      label = anchorText.trim();
    }
    return { type: 'assessment', label };
  }

  // 2. Registration & Application
  if (
    lowerUrl.includes('forms.gle') ||
    lowerUrl.includes('docs.google.com/forms') ||
    lowerUrl.includes('unstop.com') ||
    lowerUrl.includes('superset.com') ||
    lowerUrl.includes('joinsuperset.com') ||
    lowerUrl.includes('pod.ai') ||
    lowerUrl.includes('apply') ||
    lowerUrl.includes('registration') ||
    lowerText.includes('register') ||
    lowerText.includes('apply now') ||
    lowerText.includes('registration form') ||
    lowerText.includes('fill form') ||
    lowerText.includes('rsvp') ||
    lowerText.includes('application form') ||
    lowerText.includes('submit application')
  ) {
    let label = 'Register';
    if (lowerText.includes('apply') || lowerUrl.includes('apply')) {
      label = 'Apply';
    } else if (lowerUrl.includes('unstop.com')) {
      label = 'Register on Unstop';
    } else if (lowerUrl.includes('forms.gle') || lowerUrl.includes('docs.google.com/forms')) {
      label = 'Open Registration Form';
    } else if (lowerUrl.includes('superset')) {
      label = 'Open Superset Application';
    } else if (lowerText.length > 2 && lowerText.length < 32 && !isGenericAnchor(lowerText)) {
      label = anchorText.trim();
    }
    return { type: 'registration', label };
  }

  // 3. Submissions & LMS (Canvas, Moodle, Classroom, Blackboard)
  if (
    lowerUrl.includes('moodle') ||
    lowerUrl.includes('canvas') ||
    lowerUrl.includes('blackboard') ||
    lowerUrl.includes('classroom.google.com') ||
    lowerText.includes('submit assignment') ||
    lowerText.includes('submit your') ||
    lowerText.includes('turn in') ||
    lowerText.includes('upload assignment')
  ) {
    let label = 'Open Submission';
    if (lowerUrl.includes('moodle')) label = 'Open Moodle';
    else if (lowerUrl.includes('canvas')) label = 'Open Canvas';
    else if (lowerUrl.includes('classroom.google.com')) label = 'Open Google Classroom';
    else if (lowerText.length > 2 && lowerText.length < 32 && !isGenericAnchor(lowerText)) {
      label = anchorText.trim();
    }
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
    lowerText.includes('video call') ||
    lowerText.includes('join interview')
  ) {
    let label = 'Join Meeting';
    if (lowerUrl.includes('meet.google.com')) label = 'Join Google Meet';
    else if (lowerUrl.includes('zoom.us')) label = 'Join Zoom';
    else if (lowerUrl.includes('teams.microsoft.com')) label = 'Join Teams';
    return { type: 'meeting', label };
  }

  // 5. Admit Card / Results / Hall Ticket
  if (
    lowerText.includes('admit card') ||
    lowerText.includes('hall ticket') ||
    lowerText.includes('view result') ||
    lowerText.includes('scorecard') ||
    lowerUrl.includes('admitcard') ||
    lowerUrl.includes('hallticket') ||
    lowerUrl.includes('scorecard')
  ) {
    const label = lowerText.includes('admit card') ? 'Download Admit Card' : 'View Results';
    return { type: 'portal', label };
  }

  // If anchor is purely generic and URL is just a top-level domain / general web page, reject it
  if (isGenericAnchor(lowerText)) {
    return null;
  }

  // If anchor has high semantic quality (e.g. "Candidate Portal", "Check Guidelines", "Slot Booking")
  if (
    lowerText.includes('portal') ||
    lowerText.includes('slot') ||
    lowerText.includes('guidelines') ||
    lowerText.includes('details') ||
    lowerText.includes('login')
  ) {
    const label = anchorText.length > 2 && anchorText.length < 30 ? anchorText.trim() : 'Open Portal';
    return { type: 'portal', label };
  }

  // Otherwise, ignore generic links to avoid spamming the card with noise
  return null;
}

function isGenericAnchor(text: string): boolean {
  if (!text) return true;
  const genericList = [
    'click here',
    'click here to view',
    'read more',
    'learn more',
    'here',
    'link',
    'website',
    'view',
    'open',
    'more details',
    'check here',
    'this link'
  ];
  return genericList.includes(text.toLowerCase().trim());
}

/**
 * Extracts only high-value, actionable URLs from HTML and plain text.
 * Aggressively filters out social media, marketing footers, generic websites, and unsubs.
 */
export function extractActionLinks(htmlOrText: string): ActionLink[] {
  if (!htmlOrText) return [];

  const results: ActionLink[] = [];
  const seenUrls = new Set<string>();

  // 1. Extract from HTML anchor tags: <a href="..." ...>Text</a>
  const anchorRegex = /<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"'>]+)["'][^>]*>(.*?)<\/a>/gis;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(htmlOrText)) !== null) {
    const rawUrl = match[1];
    const rawAnchorText = match[2].replace(/<[^>]+>/g, '').trim();
    const cleanUrl = sanitizeUrl(rawUrl);

    if (!seenUrls.has(cleanUrl)) {
      const classified = classifyLinkType(cleanUrl, rawAnchorText);
      if (classified) {
        seenUrls.add(cleanUrl);
        results.push({ label: classified.label, url: cleanUrl, type: classified.type });
      }
    }
  }

  // 2. Extract plain text URLs: https://...
  const plainUrlRegex = /(https?:\/\/[^\s<>"'\)]+)/gi;
  while ((match = plainUrlRegex.exec(htmlOrText)) !== null) {
    const rawUrl = match[1].replace(/[.,;:!?]+$/, ''); // Strip trailing punctuation
    const cleanUrl = sanitizeUrl(rawUrl);

    if (!seenUrls.has(cleanUrl)) {
      const classified = classifyLinkType(cleanUrl, '');
      if (classified) {
        seenUrls.add(cleanUrl);
        results.push({ label: classified.label, url: cleanUrl, type: classified.type });
      }
    }
  }

  // Deduplicate results by normalized URL and label
  const uniqueResults: ActionLink[] = [];
  const seenKeys = new Set<string>();

  for (const item of results) {
    const normUrl = item.url.toLowerCase().replace(/\/+$/, '');
    const normLabel = item.label.toLowerCase();
    const key = `${normUrl}|${normLabel}`;

    if (!seenKeys.has(key) && !seenKeys.has(normUrl)) {
      seenKeys.add(key);
      seenKeys.add(normUrl);
      uniqueResults.push(item);
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

  return uniqueResults
    .sort((a, b) => (priorityOrder[a.type || 'general'] || 10) - (priorityOrder[b.type || 'general'] || 10))
    .slice(0, 3); // Return at most top 3 high-value action links
}
