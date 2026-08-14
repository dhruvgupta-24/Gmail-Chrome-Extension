export type EventType =
  | "test"
  | "quiz"
  | "exam"
  | "assessment"
  | "interview"
  | "coding_round"
  | "assignment"
  | "submission"
  | "registration"
  | "deadline"
  | "internship"
  | "placement"
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
  receivedAt: string; // ISO date string
  snippet?: string;
}

export interface ExtractedEvent {
  id: string;
  title: string;
  type: EventType;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm or HH:mm AM/PM
  endDate?: string;
  deadline?: string; // ISO or formatted string
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

export interface EventFilter {
  status?: EventStatus | EventStatus[];
  type?: EventType | EventType[];
  actionRequired?: boolean;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}
