export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatParams = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
};

export type ChatChoice = {
  message?: { content: string };
  delta?: { content?: string };
};

export type ChatResponse = {
  choices: ChatChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number };
};

export type ChatChunk = {
  choices: ChatChoice[];
};

export interface LLMProvider {
  name: string;
  chat(params: ChatParams): Promise<ChatResponse | AsyncIterable<ChatChunk>>;
}
