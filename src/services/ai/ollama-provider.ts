import { AIProvider, AIResponse } from './provider';
import { OllamaConfig, ChatMessage, ProviderHealthStatus } from '../../types/ai';
import { ParsedEmailMessage } from '../../types/gmail';
import { ExtractedEvent } from '../../types/events';
import { buildSystemPrompt, buildUserPromptWithContext } from './prompts';

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local AI)';
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:11434',
      model: config.model || 'qwen3:8b',
      temperature: config.temperature ?? 0.1,
      keepAlive: config.keepAlive || '5m'
    };
  }

  updateConfig(config: Partial<OllamaConfig>) {
    this.config = { ...this.config, ...config };
  }

  async checkHealth(): Promise<ProviderHealthStatus> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/api/tags`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          isAvailable: false,
          provider: 'ollama',
          message: `Ollama server returned status ${res.status}: ${res.statusText}`,
          errorDetails: 'Check if Ollama is running and accessible.'
        };
      }

      const data = await res.json();
      const models: string[] = (data.models || []).map((m: { name: string }) => m.name);

      const hasSelectedModel = models.some(m => m.includes(this.config.model) || this.config.model.includes(m));

      if (models.length === 0) {
        return {
          isAvailable: false,
          provider: 'ollama',
          message: 'Ollama is running, but no AI models are installed.',
          errorDetails: `Run "ollama pull ${this.config.model}" in your terminal to install the model.`,
          availableModels: []
        };
      }

      return {
        isAvailable: true,
        provider: 'ollama',
        message: hasSelectedModel
          ? `Connected to Ollama with model "${this.config.model}".`
          : `Ollama connected. Note: Model "${this.config.model}" not found in installed models (${models.join(', ')}).`,
        availableModels: models
      };
    } catch (error: any) {
      const isAbort = error.name === 'AbortError';
      return {
        isAvailable: false,
        provider: 'ollama',
        message: 'Could not connect to local Ollama server.',
        errorDetails: isAbort
          ? 'Connection to Ollama timed out (4s). Is Ollama running on ' + this.config.baseUrl + '?'
          : `Failed to fetch from ${url}. Ensure Ollama is running (e.g. "ollama serve"). Error: ${error.message || error}`
      };
    }
  }

  async listAvailableModels(): Promise<string[]> {
    try {
      const url = `${this.config.baseUrl.replace(/\/$/, '')}/api/tags`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map((m: { name: string }) => m.name);
    } catch {
      return [];
    }
  }

  async chat(
    userPrompt: string,
    contextEmails: ParsedEmailMessage[],
    conversationHistory: ChatMessage[],
    userContextPrompt: string,
    extractedEventsContext?: ExtractedEvent[]
  ): Promise<AIResponse> {
    const health = await this.checkHealth();
    if (!health.isAvailable && !health.availableModels?.length) {
      throw new Error(
        `Ollama unavailable: ${health.message} ${health.errorDetails || 'Please start Ollama using "ollama serve"'}`
      );
    }

    const systemPrompt = buildSystemPrompt(userContextPrompt, new Date());
    const enrichedUserPrompt = buildUserPromptWithContext(userPrompt, contextEmails, extractedEventsContext);

    // Build chat message history for multi-turn context
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt }
    ];

    // Include last 4 turns of history
    const recentHistory = conversationHistory.slice(-4);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Add current query with email context
    messages.push({
      role: 'user',
      content: enrichedUserPrompt
    });

    const url = `${this.config.baseUrl.replace(/\/$/, '')}/api/chat`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for local LLM

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          messages,
          stream: false,
          options: {
            temperature: this.config.temperature ?? 0.1
          },
          keep_alive: this.config.keepAlive || '5m'
        })
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ollama chat error (${res.status}): ${errorText || res.statusText}`);
      }

      const data = await res.json();
      const content = data.message?.content || 'No response generated.';

      return {
        content: content.trim(),
        extractedEvents: extractedEventsContext
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Ollama request timed out after 60 seconds. Consider using a smaller model like llama3.2.');
      }
      throw error;
    }
  }
}
