import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

const lensSchema = z.object({
  seat_number: z.number().int().min(1),
  avatar_name: z.string().min(1),
  epistemology: z.string().min(1),
  family: z.string().min(1),
  signature_color: z.object({
    name: z.string().min(1),
    hex: z.string().min(1)
  }),
  philosophy: z.object({
    core_quote: z.string().min(1),
    worldview: z.string().min(1),
    closing_quote: z.string().min(1)
  }),
  visual_identity: z.object({
    motifs: z.array(z.string()),
    arena_presence: z.string().min(1)
  }),
  prompt_template: z.object({
    system: z.string().min(1),
    hint_instruction: z.string().min(1),
    followup_instruction: z.string().min(1)
  })
});

const packSchema = z.object({
  pack_id: z.string().min(1),
  pack_name: z.string().min(1),
  pack_version: z.string().optional(),
  source: z.string().optional(),
  description: z.string().optional(),
  total_seats: z.number().int().min(1),
  families: z.record(z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    seats: z.array(z.number()).optional()
  }).passthrough()),
  lenses: z.array(lensSchema),
  orchestrator: z.object({
    synthesis_system_prompt: z.string().min(1),
    clash_system_prompt: z.string().min(1),
    position_summary_prompt: z.string().min(1)
  })
});

export type LensPack = z.infer<typeof packSchema>;

export function resolveLensPackPath(value: string): string {
  const candidates: string[] = [];
  const add = (p: string) => candidates.push(p);
  const hasExtension = value.endsWith('.json');
  const looksLikePath = value.includes('/') || value.includes('\\') || value.startsWith('.');

  if (looksLikePath) {
    add(value);
    add(resolve(process.cwd(), value));
    if (!hasExtension) {
      add(`${value}.json`);
      add(resolve(process.cwd(), `${value}.json`));
    }
  }

  const id = value.replace(/\.json$/, '');
  const packFile = `${id}.json`;
  add(resolve(process.cwd(), 'lens-packs', packFile));
  add(resolve(process.cwd(), '..', 'lens-packs', packFile));
  add(resolve(process.cwd(), '..', '..', 'lens-packs', packFile));
  add(resolve(process.cwd(), 'config', packFile));
  add(resolve(process.cwd(), '..', 'config', packFile));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Lens pack not found for "${value}". Tried: ${candidates.join(', ')}`);
}

export async function loadLensPack(pathOrId: string): Promise<LensPack> {
  const resolvedPath = resolveLensPackPath(pathOrId);
  const raw = await readFile(resolvedPath, 'utf-8');
  const json = JSON.parse(raw);
  return packSchema.parse(json);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
