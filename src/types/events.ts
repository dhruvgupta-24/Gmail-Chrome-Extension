export type EventType =
  | "test"
  | "quiz"
  | "exam"
  | "assessment"
  | "online_test"
  | "aptitude_test"
  | "interview"
  | "coding_round"
  | "assignment"
  | "submission"
  | "registration"
  | "deadline"
  | "ppt"
  | "internship"
  | "placement"
  | "action_required"
  | "other";

export type EventStatus = "today" | "tomorrow" | "upcoming" | "past" | "unknown";

export type ActionLinkType = "assessment" | "registration" | "submission" | "meeting" | "portal" | "general";

export interface ActionLink {
  label: string;
  url: string;
  type?: ActionLinkType;
}

export interface SourceMessageRef {
  messageId: string;
  threadId?: string;
  subject: string;
  sender?: string;
  receivedAt: string; // ISO date string or formatted date (METADATA ONLY)
  snippet?: string;
}

export interface ProcessStage {
  name: string; // e.g. "PPT", "Technical Assessment", "Interview"
  type: EventType; // "ppt", "assessment", "interview", "deadline"
  date?: string; // YYYY-MM-DD
  time?: string; // e.g. "4:00 PM"
  status?: 'scheduled' | 'tbd' | 'completed' | 'unknown';
  details?: string; // e.g. "Virtual", "Test active from 4:00 PM to 5:30 PM"
}

export interface ExtractedEvent {
  id: string; // "event-<normalizedKey>" or "thread-<threadId>"
  threadId?: string;
  title: string; // Clean title without "Re:", "Fwd:", etc.
  company?: string; // Company / Organization / Institution
  type: EventType;
  startDate?: string; // YYYY-MM-DD (Explicit event start date)
  endDate?: string; // YYYY-MM-DD (Explicit event end date if continuous window)
  date?: string; // YYYY-MM-DD (Primary event date or deadline date)
  time?: string; // e.g. "11:59 PM", "10:00 AM"
  deadline?: string; // Point-in-time deadline e.g. "2026-08-20" or "2026-08-20 at 11:59 PM"
  isDeadline?: boolean; // True if this event is primarily a single deadline
  isContinuousRange?: boolean; // True ONLY if the text explicitly states a continuous active window
  allDates?: string[]; // Discrete individual dates mentioned for the event (e.g. ["2026-08-12", "2026-08-24", "2026-08-25"])
  stages?: ProcessStage[]; // Multi-stage recruitment process stages (PPT, Technical Assessment, Interview, etc.)
  organization?: string;
  actionRequired: boolean;
  actionDescription?: string;
  links: ActionLink[];
  sourceMessages: SourceMessageRef[];
  confidence?: number;
  status: EventStatus;
  schemaVersion?: number;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface DateRangeQuery {
  isDateQuery: boolean;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  label?: string; // e.g. "Aug 15–16, 2026"
  isSingleDay?: boolean;
  isTodayAndTomorrow?: boolean;
}

export interface EventFilter {
  status?: EventStatus | EventStatus[];
  type?: EventType | EventType[];
  actionRequired?: boolean;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}
