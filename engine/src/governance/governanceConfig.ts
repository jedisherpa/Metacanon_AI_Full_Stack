import { promises as fs } from 'node:fs';
import path from 'node:path';

export type GovernanceConfig = {
  configPath: string;
  materialImpactIntents: Set<string>;
  quorumCount: number;
};

function normalizeIntent(value: string): string {
  return value.trim().toUpperCase();
}

function stripInlineComment(value: string): string {
  const index = value.indexOf('#');
  return index === -1 ? value : value.slice(0, index);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseGovernanceYaml(raw: string): { materialImpactIntents: string[]; quorumCount: number } {
  const materialImpactIntents: string[] = [];
  let quorumCount: number | null = null;
  let section: 'none' | 'material_impact_intents' | 'quorum_rules' = 'none';

  for (const line of raw.split(/\r?\n/)) {
    const withoutComment = stripInlineComment(line);
    if (!withoutComment.trim()) {
      continue;
    }

    const trimmed = withoutComment.trim();

    if (trimmed === 'material_impact_intents:') {
      section = 'material_impact_intents';
      continue;
    }

    if (trimmed === 'quorum_rules:') {
      section = 'quorum_rules';
      continue;
    }

    if (section === 'material_impact_intents' && trimmed.startsWith('- ')) {
      const intent = normalizeIntent(unquote(trimmed.slice(2)));
      if (intent) {
        materialImpactIntents.push(intent);
      }
      continue;
    }

    if (section === 'quorum_rules' && trimmed.startsWith('value:')) {
      const valueRaw = unquote(trimmed.slice('value:'.length));
      const parsed = Number.parseInt(valueRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        quorumCount = parsed;
      }
      continue;
    }
  }

  if (materialImpactIntents.length === 0) {
    throw new Error('governance.yaml must include at least one material_impact_intents entry.');
  }

  if (quorumCount == null) {
    throw new Error('governance.yaml must define quorum_rules value.');
  }

  return { materialImpactIntents, quorumCount };
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveGovernanceConfigPath(configPath?: string): Promise<string> {
  const cwd = process.cwd();
  const candidates = [
    ...(configPath ? [path.resolve(cwd, configPath)] : []),
    path.resolve(cwd, 'governance/governance.yaml'),
    path.resolve(cwd, '../governance/governance.yaml'),
    path.resolve(cwd, '../../governance/governance.yaml')
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`governance.yaml not found. Checked: ${candidates.join(', ')}`);
}

export async function loadGovernanceConfig(options?: {
  configPath?: string;
}): Promise<GovernanceConfig> {
  const configPath = await resolveGovernanceConfigPath(options?.configPath);
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = parseGovernanceYaml(raw);

  return {
    configPath,
    materialImpactIntents: new Set(parsed.materialImpactIntents),
    quorumCount: parsed.quorumCount
  };
}
