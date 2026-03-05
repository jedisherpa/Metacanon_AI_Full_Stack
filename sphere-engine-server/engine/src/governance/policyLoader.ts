import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const humanInLoopRequirementSchema = z.object({
  intent: z.string().min(1),
  approverRole: z.string().min(1)
});

const contactLensSchema = z.object({
  did: z.string().min(1),
  scope: z.string().min(1),
  permittedActivities: z.array(z.string().min(1)),
  prohibitedActions: z.array(z.string().min(1)),
  humanInTheLoopRequirements: z.array(humanInLoopRequirementSchema),
  interpretiveBoundaries: z.string().min(1)
});

const highRiskIntentRuleSchema = z.object({
  intent: z.string().min(1),
  rationale: z.string().min(1),
  approvalTimeoutSeconds: z.number().int().positive(),
  timeoutBehavior: z.enum(['REJECT', 'ALLOW_WITH_LOG'])
});

const breakGlassPolicySchema = z.object({
  intent: z.string().min(1),
  allowedInDegradedConsensus: z.boolean(),
  authorizedRoles: z.array(z.string().min(1)).min(1),
  dualControlRequired: z.boolean(),
  alternateAuthorization: z.string().min(1),
  auditFieldsRequired: z.array(z.string().min(1)).min(1)
});

const highRiskRegistrySchema = z.object({
  $schema: z.string().min(1).optional(),
  version: z.string().min(1),
  description: z.string().min(1),
  prismHolderApprovalRequired: z.array(highRiskIntentRuleSchema),
  breakGlassPolicy: breakGlassPolicySchema,
  degradedConsensusBlockedIntents: z.array(z.string().min(1)),
  auditOnlyIntents: z.array(z.string().min(1))
});

const semverSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    'Must use semantic version format MAJOR.MINOR.PATCH.'
  );

const lensUpgradeRuleSchema = z.object({
  ruleId: z.string().min(1),
  fromVersion: semverSchema,
  toVersion: semverSchema,
  permittedLensIds: z.array(z.string().min(1)).optional(),
  rationale: z.string().min(1).optional()
});

const lensUpgradeRegistrySchema = z.object({
  $schema: z.string().min(1).optional(),
  version: z.string().min(1),
  description: z.string().min(1),
  rules: z.array(lensUpgradeRuleSchema).min(1)
});

export type ContactLens = z.infer<typeof contactLensSchema>;
export type HighRiskIntentRule = z.infer<typeof highRiskIntentRuleSchema>;
export type HighRiskRegistry = z.infer<typeof highRiskRegistrySchema>;
export type LensUpgradeRule = z.infer<typeof lensUpgradeRuleSchema>;
export type LensUpgradeRegistry = z.infer<typeof lensUpgradeRegistrySchema>;

export type GovernancePolicies = {
  governanceRoot: string;
  contactLensSchemaPath: string;
  highRiskRegistryPath: string;
  lensUpgradeRulesPath: string;
  contactLensesPath: string;
  contactLensesByDid: Map<string, ContactLens>;
  highRiskRegistry: HighRiskRegistry;
  highRiskByIntent: Map<string, HighRiskIntentRule>;
  lensUpgradeRegistry: LensUpgradeRegistry;
  lensUpgradeRuleById: Map<string, LensUpgradeRule>;
  checksums: {
    contactLensSchema: string;
    highRiskRegistry: string;
    lensUpgradeRules: string;
    contactLenses: Record<string, string>;
  };
};

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeIntent(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeRuleId(value: string): string {
  return value.trim().toLowerCase();
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));

  for (let index = 0; index < 3; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(target: string): Promise<{ parsed: unknown; raw: string }> {
  const raw = await fs.readFile(target, 'utf8');
  return { parsed: JSON.parse(raw), raw };
}

async function resolveGovernanceRoot(governanceDir?: string): Promise<string> {
  const cwd = process.cwd();
  const candidates = governanceDir
    ? [path.resolve(cwd, governanceDir)]
    : [
        path.resolve(cwd, 'governance'),
        path.resolve(cwd, '../governance'),
        path.resolve(cwd, '../../governance')
      ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Governance directory not found. Checked: ${candidates.join(', ')}`);
}

export async function loadGovernancePolicies(options?: { governanceDir?: string }): Promise<GovernancePolicies> {
  const governanceRoot = await resolveGovernanceRoot(options?.governanceDir);
  const contactLensSchemaPath = path.join(governanceRoot, 'contact_lens_schema.json');
  const highRiskRegistryPath = path.join(governanceRoot, 'high_risk_intent_registry.json');
  const lensUpgradeRulesPath = path.join(governanceRoot, 'lens_upgrade_rules.json');
  const contactLensesPath = path.join(governanceRoot, 'contact_lenses');

  const [{ raw: schemaRaw }, { parsed: highRiskRaw, raw: highRiskRawText }, { parsed: lensUpgradeRaw, raw: lensUpgradeRawText }] = await Promise.all([
    readJson(contactLensSchemaPath),
    readJson(highRiskRegistryPath),
    readJson(lensUpgradeRulesPath)
  ]);

  const highRiskRegistry = highRiskRegistrySchema.parse(highRiskRaw);
  const breakGlassIntent = normalizeIntent(highRiskRegistry.breakGlassPolicy.intent);
  const blockedIntents = new Set(
    highRiskRegistry.degradedConsensusBlockedIntents.map(normalizeIntent)
  );

  if (!highRiskRegistry.breakGlassPolicy.allowedInDegradedConsensus) {
    throw new Error(
      'Invalid governance policy: breakGlassPolicy.allowedInDegradedConsensus must be true.'
    );
  }

  if (blockedIntents.has(breakGlassIntent)) {
    throw new Error(
      `Invalid governance policy: ${highRiskRegistry.breakGlassPolicy.intent} must not be listed in degradedConsensusBlockedIntents.`
    );
  }

  const highRiskByIntent = new Map<string, HighRiskIntentRule>();
  for (const rule of highRiskRegistry.prismHolderApprovalRequired) {
    const normalizedRuleIntent = normalizeIntent(rule.intent);
    if (highRiskByIntent.has(normalizedRuleIntent)) {
      throw new Error(
        `Invalid governance policy: duplicate high-risk intent rule for ${normalizedRuleIntent}.`
      );
    }
    highRiskByIntent.set(normalizedRuleIntent, rule);
  }

  if (!highRiskByIntent.has(breakGlassIntent)) {
    throw new Error(
      `Invalid governance policy: breakGlass intent ${highRiskRegistry.breakGlassPolicy.intent} must appear in prismHolderApprovalRequired.`
    );
  }

  const lensUpgradeRegistry = lensUpgradeRegistrySchema.parse(lensUpgradeRaw);
  const lensUpgradeRuleById = new Map<string, LensUpgradeRule>();

  for (const rule of lensUpgradeRegistry.rules) {
    const normalizedRuleId = normalizeRuleId(rule.ruleId);
    if (lensUpgradeRuleById.has(normalizedRuleId)) {
      throw new Error(`Invalid governance policy: duplicate lens upgrade ruleId ${rule.ruleId}.`);
    }

    if (compareSemver(rule.toVersion, rule.fromVersion) <= 0) {
      throw new Error(
        `Invalid governance policy: lens upgrade rule ${rule.ruleId} must advance version (${rule.fromVersion} -> ${rule.toVersion}).`
      );
    }

    lensUpgradeRuleById.set(normalizedRuleId, rule);
  }

  const lensFiles = (await fs.readdir(contactLensesPath))
    .filter((entry) => entry.endsWith('.json'))
    .sort();

  const contactLensesByDid = new Map<string, ContactLens>();
  const contactLensesChecksums: Record<string, string> = {};

  for (const fileName of lensFiles) {
    const target = path.join(contactLensesPath, fileName);
    const { parsed, raw } = await readJson(target);
    const lens = contactLensSchema.parse(parsed);

    if (contactLensesByDid.has(lens.did)) {
      throw new Error(`Duplicate contact lens DID found: ${lens.did}`);
    }

    contactLensesByDid.set(lens.did, lens);
    contactLensesChecksums[fileName] = hashText(raw);
  }

  return {
    governanceRoot,
    contactLensSchemaPath,
    highRiskRegistryPath,
    lensUpgradeRulesPath,
    contactLensesPath,
    contactLensesByDid,
    highRiskRegistry,
    highRiskByIntent,
    lensUpgradeRegistry,
    lensUpgradeRuleById,
    checksums: {
      contactLensSchema: hashText(schemaRaw),
      highRiskRegistry: hashText(highRiskRawText),
      lensUpgradeRules: hashText(lensUpgradeRawText),
      contactLenses: contactLensesChecksums
    }
  };
}
