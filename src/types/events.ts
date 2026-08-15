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
  receivedAt: string; // ISO date string or formatted date
  snippet?: string;
}

export interface ExtractedEvent {
  id: string; // Typically "thread-<threadId>" or "event-<messageId>"
  threadId?: string;
  title: string; // Clean title without "Re:", "Fwd:", etc.
  company?: string; // Company / Organization / Institution
  type: EventType;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD for multi-day window
  date?: string; // YYYY-MM-DD (primary/start date for backward compatibility)
  time?: string; // e.g. "11:59 PM", "10:00 AM"
  deadline?: string; // Normalized string description e.g. "2026-08-16 at 11:59 PM"
  allDates?: string[]; // All specific event dates extracted from the text
  organization?: string;
  actionRequired: boolean;
  actionDescription?: string;
  links: ActionLink[];
  sourceMessages: SourceMessageRef[];
  confidence?: number;
  status: EventStatus;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface DateRangeQuery {
  isDateQuery: boolean;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  label?: string; // e.g. "Aug 15–20, 2026"
  isSingleDay?: boolean;
}

export interface EventFilter {
  status?: EventStatus | EventStatus[];
  type?: EventType | EventType[];
  actionRequired?: boolean;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}
