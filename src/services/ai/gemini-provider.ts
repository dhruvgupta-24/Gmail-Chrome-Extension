import { AIProvider, AIResponse } from './provider';
import { GeminiConfig, ChatMessage, ProviderHealthStatus } from '../../types/ai';
import { ParsedEmailMessage } from '../../types/gmail';
import { ExtractedEvent } from '../../types/events';
import { buildSystemPrompt, buildUserPromptWithContext } from './prompts';

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini API';
  private config: GeminiConfig;

  constructor(config: GeminiConfig) {
    this.config = {
      apiKey: config.apiKey || '',
      model: config.model || 'gemini-1.5-flash'
    };
  }

  async checkHealth(): Promise<ProviderHealthStatus> {
    if (!this.config.apiKey) {
      return {
        isAvailable: false,
        provider: 'gemini',
        message: 'Gemini API Key is not configured.',
        errorDetails: 'Please add your Google AI Studio API key in Settings.'
      };
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        return {
          isAvailable: false,
          provider: 'gemini',
          message: 'Invalid Gemini API key or quota exceeded.',
          errorDetails: `Status ${res.status}: ${res.statusText}`
        };
      }
      return {
        isAvailable: true,
        provider: 'gemini',
        message: `Connected to Google Gemini (${this.config.model}).`
      };
    } catch (err: any) {
      return {
        isAvailable: false,
        provider: 'gemini',
        message: 'Could not connect to Gemini API.',
        errorDetails: err.message
      };
    }
  }

  async listAvailableModels(): Promise<string[]> {
    return ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
  }

  async chat(
    userPrompt: string,
    contextEmails: ParsedEmailMessage[],
    conversationHistory: ChatMessage[],
    userContextPrompt: string,
    extractedEventsContext?: ExtractedEvent[]
  ): Promise<AIResponse> {
    if (!this.config.apiKey) {
      throw new Error('Gemini API key is missing. Please set it in Extension Settings.');
    }

    const systemPrompt = buildSystemPrompt(userContextPrompt, new Date());
    const enrichedUserPrompt = buildUserPromptWithContext(userPrompt, contextEmails, extractedEventsContext);

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // History
    for (const msg of conversationHistory.slice(-4)) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: enrichedUserPrompt }]
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error: ${err}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';

    return {
      content: text,
      extractedEvents: extractedEventsContext
    };
  }
}
