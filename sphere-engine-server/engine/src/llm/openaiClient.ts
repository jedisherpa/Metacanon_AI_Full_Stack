import type { ChatChunk, ChatParams, ChatResponse, LLMProvider } from './types.js';

export type OpenAIClientConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

async function parseEventStream(resp: Response): Promise<AsyncIterable<ChatChunk>> {
  if (!resp.body) {
    throw new Error('No response body for stream');
  }

  const decoder = new TextDecoder();
  const stream = resp.body;

  async function* iterator(): AsyncIterable<ChatChunk> {
    let buffer = '';
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let lineBreakIndex = buffer.indexOf('\n');
      while (lineBreakIndex >= 0) {
        const line = buffer.slice(0, lineBreakIndex).trim();
        buffer = buffer.slice(lineBreakIndex + 1);
        if (line.startsWith('data:')) {
          const data = line.replace(/^data:\s*/, '');
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data) as ChatChunk;
            yield parsed;
          } catch {
            // ignore malformed lines
          }
        }
        lineBreakIndex = buffer.indexOf('\n');
      }
    }
  }

  return iterator();
}

export function createOpenAIClient(config: OpenAIClientConfig): LLMProvider {
  return {
    name: config.name,
    async chat(params: ChatParams): Promise<ChatResponse | AsyncIterable<ChatChunk>> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      const body = {
        model: params.model,
        messages: params.messages,
        stream: params.stream ?? false,
        temperature: params.temperature,
        max_tokens: params.max_tokens
      };

      const resp = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`LLM error (${config.name}): ${resp.status} ${text}`);
      }

      if (params.stream) {
        return parseEventStream(resp);
      }

      return (await resp.json()) as ChatResponse;
    }
  };
}
