import { GmailListMessagesResponse, GmailMessageResource, ParsedEmailMessage, GmailThreadResource } from '../../types/gmail';
import { parseGmailMessage } from './parser';
import { OAuthManager } from '../../background/auth/oauth-manager';

export class GmailClient {
  private static instance: GmailClient;
  private readonly baseUrl = 'https://gmail.googleapis.com/gmail/v1/users/me';

  private constructor() {}

  static getInstance(): GmailClient {
    if (!GmailClient.instance) {
      GmailClient.instance = new GmailClient();
    }
    return GmailClient.instance;
  }

  /**
   * Helper to perform authenticated Gmail API fetch.
   */
  private async authenticatedFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const token = await OAuthManager.getInstance().getValidToken();
    if (!token) {
      throw new Error('Gmail authorization required. Please sign in with Google in extension settings.');
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      // Token expired or invalid
      await OAuthManager.getInstance().logout();
      throw new Error('Authentication expired. Please sign in again.');
    }

    return res;
  }

  /**
   * Searches Gmail for messages matching query string `q`.
   */
  async searchMessages(query: string, maxResults: number = 15): Promise<ParsedEmailMessage[]> {
    const searchUrl = `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const res = await this.authenticatedFetch(searchUrl);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail search error (${res.status}): ${err}`);
    }

    const data: GmailListMessagesResponse = await res.json();
    if (!data.messages || data.messages.length === 0) {
      return [];
    }

    // Concurrently fetch message details in batches of 5
    const messageIds = data.messages.map(m => m.id);
    const parsedMessages: ParsedEmailMessage[] = [];

    const batchSize = 5;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const promises = batch.map(id => this.getMessage(id));
      const results = await Promise.allSettled(promises);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          parsedMessages.push(result.value);
        }
      }
    }

    return parsedMessages;
  }

  /**
   * Fetches single full message by ID.
   */
  async getMessage(messageId: string): Promise<ParsedEmailMessage | null> {
    try {
      const res = await this.authenticatedFetch(`/messages/${encodeURIComponent(messageId)}?format=full`);
      if (!res.ok) return null;

      const raw: GmailMessageResource = await res.json();
      return parseGmailMessage(raw);
    } catch (err) {
      console.warn(`Failed to fetch message ${messageId}:`, err);
      return null;
    }
  }

  /**
   * Fetches a full thread and parses all contained messages.
   */
  async getThread(threadId: string): Promise<ParsedEmailMessage[]> {
    try {
      const res = await this.authenticatedFetch(`/threads/${encodeURIComponent(threadId)}?format=full`);
      if (!res.ok) return [];

      const raw: GmailThreadResource = await res.json();
      if (!raw.messages || raw.messages.length === 0) return [];

      return raw.messages.map(parseGmailMessage);
    } catch (err) {
      console.warn(`Failed to fetch thread ${threadId}:`, err);
      return [];
    }
  }
}
