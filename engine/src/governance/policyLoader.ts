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

export type ContactLens = z.infer<typeof contactLensSchema>;
export type HighRiskIntentRule = z.infer<typeof highRiskIntentRuleSchema>;
export type HighRiskRegistry = z.infer<typeof highRiskRegistrySchema>;

export type GovernancePolicies = {
  governanceRoot: string;
  contactLensSchemaPath: string;
  highRiskRegistryPath: string;
  contactLensesPath: string;
  contactLensesByDid: Map<string, ContactLens>;
  highRiskRegistry: HighRiskRegistry;
  highRiskByIntent: Map<string, HighRiskIntentRule>;
  checksums: {
    contactLensSchema: string;
    highRiskRegistry: string;
    contactLenses: Record<string, string>;
  };
};

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeIntent(value: string): string {
  return value.trim().toUpperCase();
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
  const contactLensesPath = path.join(governanceRoot, 'contact_lenses');

  const [{ raw: schemaRaw }, { parsed: highRiskRaw, raw: highRiskRawText }] = await Promise.all([
    readJson(contactLensSchemaPath),
    readJson(highRiskRegistryPath)
  ]);

  const highRiskRegistry = highRiskRegistrySchema.parse(highRiskRaw);
  const breakGlassIntent = normalizeIntent(highRiskRegistry.breakGlassPolicy.intent);
  const blockedIntents = new Set(
    highRiskRegistry.degradedConsensusBlockedIntents.map(normalizeIntent)
  );

  if (blockedIntents.has(breakGlassIntent)) {
    throw new Error(
      `Invalid governance policy: ${highRiskRegistry.breakGlassPolicy.intent} must not be listed in degradedConsensusBlockedIntents.`
    );
  }

  const highRiskByIntent = new Map<string, HighRiskIntentRule>(
    highRiskRegistry.prismHolderApprovalRequired.map((rule) => [rule.intent, rule])
  );

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
    contactLensesPath,
    contactLensesByDid,
    highRiskRegistry,
    highRiskByIntent,
    checksums: {
      contactLensSchema: hashText(schemaRaw),
      highRiskRegistry: hashText(highRiskRawText),
      contactLenses: contactLensesChecksums
    }
  };
}
