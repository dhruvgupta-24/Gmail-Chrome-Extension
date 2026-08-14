import { ChatMessage, ProviderHealthStatus } from '../../types/ai';
import { ExtractedEvent } from '../../types/events';
import { ParsedEmailMessage } from '../../types/gmail';

export interface AIResponse {
  content: string;
  suggestedFollowUps?: string[];
  extractedEvents?: ExtractedEvent[];
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;

  checkHealth(): Promise<ProviderHealthStatus>;
  listAvailableModels(): Promise<string[]>;

  chat(
    userPrompt: string,
    contextEmails: ParsedEmailMessage[],
    conversationHistory: ChatMessage[],
    userContextPrompt: string,
    extractedEventsContext?: ExtractedEvent[]
  ): Promise<AIResponse>;
}
