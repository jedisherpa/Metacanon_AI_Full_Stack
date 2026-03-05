import type { LensPack } from '../config/lensPack.js';
import type { ChatChunk } from './types.js';
import { callWithRetry } from './fallback.js';
import { getProviderSet, type ProviderChoice } from './providers.js';
import { z } from 'zod';

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return value != null && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === 'function';
}

export type ResponseEntry = {
  avatarName: string;
  epistemology: string;
  content: string;
};

export type StructuredArtifactPhase = 'clash' | 'consensus' | 'options' | 'paradox' | 'minority';

const structuredArtifactSchema = z.object({
  format: z.literal('structured_v1'),
  artifact: z.enum(['clash', 'consensus', 'options', 'paradox', 'minority']),
  title: z.string().min(1),
  summary: z.string().default(''),
  cards: z
    .array(
      z.object({
        title: z.string().min(1),
        body: z.string().default(''),
        bullets: z.array(z.string()).default([]),
        endorsers: z.array(z.string()).optional(),
        confidence: z.string().optional(),
        quickTest: z.string().optional(),
        risk: z.string().optional()
      })
    )
    .default([]),
  questions: z.array(z.string()).default([]),
  rawText: z.string().default('')
});

export type StructuredArtifact = z.infer<typeof structuredArtifactSchema>;

export function formatResponses(responses: ResponseEntry[]): string {
  return responses
    .map(
      (r) =>
        `=== Response from ${r.avatarName} (${r.epistemology}) ===\n${r.content.trim()}`
    )
    .join('\n\n');
}

function extractJsonObject(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }
  return candidate.slice(start, end + 1);
}

function fallbackStructured(params: {
  artifact: StructuredArtifactPhase;
  title: string;
  rawText: string;
}): StructuredArtifact {
  return {
    format: 'structured_v1',
    artifact: params.artifact,
    title: params.title,
    summary: '',
    cards: [
      {
        title: 'Model Output',
        body: params.rawText.trim(),
        bullets: []
      }
    ],
    questions: [],
    rawText: params.rawText.trim()
  };
}

function parseStructuredArtifact(params: {
  artifact: StructuredArtifactPhase;
  title: string;
  rawText: string;
}) {
  const jsonCandidate = extractJsonObject(params.rawText);
  if (!jsonCandidate) {
    return fallbackStructured(params);
  }

  try {
    const parsed = JSON.parse(jsonCandidate);
    const validated = structuredArtifactSchema.safeParse(parsed);
    if (!validated.success) {
      return fallbackStructured(params);
    }

    return {
      ...validated.data,
      rawText: validated.data.rawText || params.rawText.trim()
    };
  } catch {
    return fallbackStructured(params);
  }
}

async function callAsText(params: {
  provider: ProviderChoice;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  max_tokens?: number;
}) {
  const { orchestrator } = getProviderSet(params.provider);

  const resp = await callWithRetry(orchestrator, {
    model: orchestrator.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.max_tokens ?? 1400
  });

  if (isAsyncIterable<ChatChunk>(resp)) {
    let out = '';
    for await (const chunk of resp) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      out += delta;
    }
    return out.trim();
  }

  return (resp.choices?.[0]?.message?.content ?? '').trim();
}

function toPriorText(raw?: string) {
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.rawText === 'string' && parsed.rawText.trim()) {
        return parsed.rawText.trim();
      }
      if (Array.isArray(parsed.cards)) {
        const sections = parsed.cards
          .map((card: any) => {
            const title = typeof card?.title === 'string' ? card.title : 'Section';
            const body = typeof card?.body === 'string' ? card.body : '';
            const bullets = Array.isArray(card?.bullets)
              ? card.bullets.filter((item: unknown) => typeof item === 'string')
              : [];
            return [title, body, ...bullets.map((item: string) => `- ${item}`)]
              .filter(Boolean)
              .join('\n');
          })
          .join('\n\n');

        if (sections.trim()) {
          return sections.trim();
        }
      }
    }
  } catch {
    // plain text path
  }

  return raw;
}

export function structuredArtifactToStorageJson(artifact: StructuredArtifact) {
  return JSON.stringify(artifact);
}

export function structuredArtifactToPromptText(raw?: string) {
  return toPriorText(raw);
}

export async function generateHint(params: {
  lens: LensPack['lenses'][number];
  question: string;
  provider: ProviderChoice;
}) {
  const { generation } = getProviderSet(params.provider);
  const messages = [
    { role: 'system' as const, content: params.lens.prompt_template.system },
    {
      role: 'user' as const,
      content: `${params.lens.prompt_template.hint_instruction}\n\nQuestion: ${params.question}`
    }
  ];

  const resp = await callWithRetry(generation, {
    model: generation.model,
    messages,
    temperature: 0.7,
    max_tokens: 300
  });

  if (isAsyncIterable<ChatChunk>(resp)) {
    let out = '';
    for await (const chunk of resp) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      out += delta;
    }
    return out.trim();
  }

  return (resp.choices?.[0]?.message?.content ?? '').trim();
}

export async function generatePositionSummary(params: {
  lensPack: LensPack;
  response: ResponseEntry;
  provider: ProviderChoice;
}) {
  const { orchestrator } = getProviderSet(params.provider);
  const messages = [
    { role: 'system' as const, content: params.lensPack.orchestrator.position_summary_prompt },
    {
      role: 'user' as const,
      content: `Summarize this position in one sentence.\n\n${params.response.content}`
    }
  ];

  const resp = await callWithRetry(orchestrator, {
    model: orchestrator.model,
    messages,
    temperature: 0.4,
    max_tokens: 120
  });

  if (isAsyncIterable<ChatChunk>(resp)) {
    let out = '';
    for await (const chunk of resp) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      out += delta;
    }
    return out.trim();
  }

  return (resp.choices?.[0]?.message?.content ?? '').trim();
}

export function streamClashes(params: {
  lensPack: LensPack;
  question: string;
  responses: ResponseEntry[];
  provider: ProviderChoice;
}) {
  const { orchestrator } = getProviderSet(params.provider);
  const messages = [
    { role: 'system' as const, content: params.lensPack.orchestrator.clash_system_prompt },
    {
      role: 'user' as const,
      content: `Question: ${params.question}\n\n${formatResponses(params.responses)}\n\nIdentify the 2-4 most significant clashes.`
    }
  ];

  return callWithRetry(orchestrator, {
    model: orchestrator.model,
    messages,
    stream: true,
    temperature: 0.5
  });
}

export function streamSynthesis(params: {
  lensPack: LensPack;
  question: string;
  responses: ResponseEntry[];
  artifact: 'consensus' | 'options' | 'paradox' | 'minority';
  prior?: {
    consensus?: string;
    options?: string;
    clashes?: string;
  };
  provider: ProviderChoice;
}) {
  const { orchestrator } = getProviderSet(params.provider);
  const base = `Question: ${params.question}\n\n${formatResponses(params.responses)}`;
  const instructions: Record<string, string> = {
    consensus:
      'Generate the Consensus Core: areas of agreement with confidence levels and endorsing avatars.',
    options:
      'Generate Decision Options: 2-4 distinct forks, each with assumptions, upsides, risks, endorsing avatars, and a quick test.',
    paradox:
      'Generate the Paradox Map: irreducible tensions and how options resolve or embrace them.',
    minority:
      'Generate Minority Reports: strongest dissenting views and what fails if they are correct.'
  };

  let extra = '';
  if (params.artifact === 'options' && params.prior?.consensus) {
    extra = `\n\nConsensus Core:\n${params.prior.consensus}`;
  }
  if (params.artifact === 'paradox' && params.prior?.clashes) {
    extra = `\n\nClashes:\n${params.prior.clashes}`;
  }
  if (params.artifact === 'minority') {
    if (params.prior?.consensus) extra += `\n\nConsensus Core:\n${params.prior.consensus}`;
    if (params.prior?.options) extra += `\n\nDecision Options:\n${params.prior.options}`;
  }

  const messages = [
    { role: 'system' as const, content: params.lensPack.orchestrator.synthesis_system_prompt },
    {
      role: 'user' as const,
      content: `${instructions[params.artifact]}\n\n${base}${extra}`
    }
  ];

  return callWithRetry(orchestrator, {
    model: orchestrator.model,
    messages,
    stream: true,
    temperature: 0.5
  });
}

export async function generateStructuredClashes(params: {
  lensPack: LensPack;
  question: string;
  responses: ResponseEntry[];
  provider: ProviderChoice;
}) {
  const rawText = await callAsText({
    provider: params.provider,
    messages: [
      { role: 'system', content: params.lensPack.orchestrator.clash_system_prompt },
      {
        role: 'user',
        content:
          `Question: ${params.question}\n\n${formatResponses(params.responses)}\n\n` +
          `Return ONLY valid JSON (no markdown, no prose before/after) with schema:\n` +
          `{\n` +
          `  "format":"structured_v1",\n` +
          `  "artifact":"clash",\n` +
          `  "title":"Phase 2: Clash Analysis",\n` +
          `  "summary":"short summary",\n` +
          `  "cards":[\n` +
          `    {"title":"Clash title","body":"core disagreement","bullets":["point 1","point 2"]}\n` +
          `  ],\n` +
          `  "questions":["question 1","question 2"],\n` +
          `  "rawText":"full plain-language explanation"\n` +
          `}`
      }
    ],
    temperature: 0.3,
    max_tokens: 1400
  });

  return parseStructuredArtifact({
    artifact: 'clash',
    title: 'Phase 2: Clash Analysis',
    rawText
  });
}

export async function generateStructuredSynthesis(params: {
  lensPack: LensPack;
  question: string;
  responses: ResponseEntry[];
  artifact: 'consensus' | 'options' | 'paradox' | 'minority';
  prior?: {
    consensus?: string;
    options?: string;
    clashes?: string;
  };
  provider: ProviderChoice;
}) {
  const base = `Question: ${params.question}\n\n${formatResponses(params.responses)}`;
  const instructions: Record<string, string> = {
    consensus:
      'Generate the Consensus Core: areas of agreement with confidence levels and endorsing avatars.',
    options:
      'Generate Decision Options: 2-4 distinct forks, each with assumptions, upsides, risks, endorsing avatars, and a quick test.',
    paradox:
      'Generate the Paradox Map: irreducible tensions and how options resolve or embrace them.',
    minority:
      'Generate Minority Reports: strongest dissenting views and what fails if they are correct.'
  };

  let extra = '';
  if (params.artifact === 'options' && params.prior?.consensus) {
    extra = `\n\nConsensus Core:\n${toPriorText(params.prior.consensus)}`;
  }
  if (params.artifact === 'paradox' && params.prior?.clashes) {
    extra = `\n\nClashes:\n${toPriorText(params.prior.clashes)}`;
  }
  if (params.artifact === 'minority') {
    if (params.prior?.consensus) extra += `\n\nConsensus Core:\n${toPriorText(params.prior.consensus)}`;
    if (params.prior?.options) extra += `\n\nDecision Options:\n${toPriorText(params.prior.options)}`;
  }

  const rawText = await callAsText({
    provider: params.provider,
    messages: [
      { role: 'system', content: params.lensPack.orchestrator.synthesis_system_prompt },
      {
        role: 'user',
        content:
          `${instructions[params.artifact]}\n\n${base}${extra}\n\n` +
          `Return ONLY valid JSON (no markdown, no prose before/after) with schema:\n` +
          `{\n` +
          `  "format":"structured_v1",\n` +
          `  "artifact":"${params.artifact}",\n` +
          `  "title":"human readable section title",\n` +
          `  "summary":"short summary",\n` +
          `  "cards":[\n` +
          `    {"title":"subsection","body":"explanation","bullets":["point 1","point 2"],"confidence":"optional","endorsers":["optional"],"quickTest":"optional","risk":"optional"}\n` +
          `  ],\n` +
          `  "questions":["optional follow-up question"],\n` +
          `  "rawText":"full plain-language explanation"\n` +
          `}`
      }
    ],
    temperature: 0.35,
    max_tokens: 1600
  });

  const titleByArtifact: Record<string, string> = {
    consensus: 'Phase 3: Consensus',
    options: 'Phase 4: Options',
    paradox: 'Phase 5: Paradoxes',
    minority: 'Phase 6: Minority Reports'
  };

  return parseStructuredArtifact({
    artifact: params.artifact,
    title: titleByArtifact[params.artifact],
    rawText
  });
}
