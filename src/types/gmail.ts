export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePartHeader {
  name: string;
  value: string;
}

export interface GmailMessagePartBody {
  attachmentId?: string;
  size: number;
  data?: string; // base64url encoded
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailMessagePartHeader[];
  body: GmailMessagePartBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessagePayload {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailHeader[];
  body: GmailMessagePartBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessageResource {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePayload;
  sizeEstimate?: number;
  raw?: string;
}

export interface GmailThreadResource {
  id: string;
  historyId?: string;
  messages?: GmailMessageResource[];
}

export interface GmailListMessagesResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface ParsedEmailMessage {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  senderName: string;
  senderEmail: string;
  recipient: string;
  date: string; // ISO string
  timestamp: number; // epoch ms
  snippet: string;
  plainText: string;
  htmlContent?: string;
  links: Array<{ text: string; href: string }>;
  labels: string[];
}
