import { ExtractedEvent } from './events';

export type AIProviderType = 'ollama' | 'gemini' | 'openai';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  temperature?: number;
  keepAlive?: string;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface AIProviderSettings {
  activeProvider: AIProviderType;
  ollama: OllamaConfig;
  gemini: GeminiConfig;
  openai: OpenAIConfig;
  userContextPrompt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  events?: ExtractedEvent[];
  sourceMessages?: Array<{
    messageId: string;
    threadId?: string;
    subject: string;
    sender?: string;
    receivedAt: string;
  }>;
  suggestedFollowUps?: string[];
  isError?: boolean;
}

export interface IntentResult {
  queryType: 'today_briefing' | 'due_today' | 'due_tomorrow' | 'upcoming_tests' | 'action_required' | 'specific_search' | 'follow_up' | 'general_qa';
  dateRange?: {
    start?: string; // YYYY/MM/DD for Gmail search
    end?: string;
  };
  keywords: string[];
  gmailQuery: string;
  intentExplanation: string;
}

export interface ProviderHealthStatus {
  isAvailable: boolean;
  provider: AIProviderType;
  message: string;
  availableModels?: string[];
  errorDetails?: string;
}
