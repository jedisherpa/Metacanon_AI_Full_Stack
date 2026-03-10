import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGovernancePolicies } from './policyLoader.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

type HighRiskRegistryShape = {
  version: string;
  description: string;
  prismHolderApprovalRequired: Array<{
    intent: string;
    rationale: string;
    approvalTimeoutSeconds: number;
    timeoutBehavior: 'REJECT' | 'ALLOW_WITH_LOG';
  }>;
  breakGlassPolicy: {
    intent: string;
    allowedInDegradedConsensus: boolean;
    authorizedRoles: string[];
    dualControlRequired: boolean;
    alternateAuthorization: string;
    auditFieldsRequired: string[];
  };
  degradedConsensusBlockedIntents: string[];
  auditOnlyIntents: string[];
};

type LensUpgradeRegistryShape = {
  version: string;
  description: string;
  rules: Array<{
    ruleId: string;
    fromVersion: string;
    toVersion: string;
    permittedLensIds?: string[];
    rationale?: string;
  }>;
};

function baseRegistry(): HighRiskRegistryShape {
  return {
    version: '1.1',
    description: 'test policy',
    prismHolderApprovalRequired: [
      {
        intent: 'DISPATCH_MISSION',
        rationale: 'high risk',
        approvalTimeoutSeconds: 300,
        timeoutBehavior: 'REJECT'
      },
      {
        intent: 'EMERGENCY_SHUTDOWN',
        rationale: 'break glass',
        approvalTimeoutSeconds: 60,
        timeoutBehavior: 'ALLOW_WITH_LOG'
      }
    ],
    breakGlassPolicy: {
      intent: 'EMERGENCY_SHUTDOWN',
      allowedInDegradedConsensus: true,
      authorizedRoles: ['Prism Holder', 'Commander'],
      dualControlRequired: true,
      alternateAuthorization: 'PRE_APPROVED_EMERGENCY_CREDENTIAL',
      auditFieldsRequired: ['reason', 'actorDid', 'confirmerDid', 'timestamp']
    },
    degradedConsensusBlockedIntents: ['DISPATCH_MISSION'],
    auditOnlyIntents: []
  };
}

function baseLensUpgradeRegistry(): LensUpgradeRegistryShape {
  return {
    version: '1.0',
    description: 'Lens progression rules',
    rules: [
      {
        ruleId: 'rule-lens-upgrade-v1',
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        permittedLensIds: ['1', '2'],
        rationale: 'Baseline upgrade path'
      }
    ]
  };
}

async function writeGovernanceDir(
  registry: HighRiskRegistryShape,
  lensUpgradeRegistry: LensUpgradeRegistryShape = baseLensUpgradeRegistry(),
  options: {
    writeDefaultLens?: boolean;
    lensOverride?: {
      did?: string;
      scope?: string;
      permittedActivities?: string[];
      prohibitedActions?: string[];
      humanInTheLoopRequirements?: Array<{ intent: string; approverRole: string }>;
      interpretiveBoundaries?: string;
    };
  } = {}
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'policy-loader-'));
  tempDirs.push(dir);

  const contactLensesDir = path.join(dir, 'contact_lenses');
  await mkdir(contactLensesDir, { recursive: true });

  await writeFile(path.join(dir, 'contact_lens_schema.json'), JSON.stringify({ type: 'object' }), 'utf8');
  await writeFile(path.join(dir, 'high_risk_intent_registry.json'), JSON.stringify(registry), 'utf8');
  await writeFile(path.join(dir, 'lens_upgrade_rules.json'), JSON.stringify(lensUpgradeRegistry), 'utf8');
  if (options.writeDefaultLens !== false) {
    await writeFile(
      path.join(contactLensesDir, 'alpha.json'),
      JSON.stringify({
        did: options.lensOverride?.did ?? 'did:test:alpha',
        scope: options.lensOverride?.scope ?? 'test',
        permittedActivities:
          options.lensOverride?.permittedActivities ?? ['DISPATCH_MISSION', 'EMERGENCY_SHUTDOWN'],
        prohibitedActions: options.lensOverride?.prohibitedActions ?? [],
        humanInTheLoopRequirements: options.lensOverride?.humanInTheLoopRequirements ?? [],
        interpretiveBoundaries: options.lensOverride?.interpretiveBoundaries ?? 'none'
      }),
      'utf8'
    );
  }

  return dir;
}

describe('loadGovernancePolicies', () => {
  it('loads high-risk rules using normalized intent keys', async () => {
    const governanceDir = await writeGovernanceDir(baseRegistry());
    const policies = await loadGovernancePolicies({ governanceDir });

    expect(policies.highRiskByIntent.has('DISPATCH_MISSION')).toBe(true);
    expect(policies.highRiskByIntent.has('dispatch_mission')).toBe(false);
    expect(policies.highRiskByIntent.has('EMERGENCY_SHUTDOWN')).toBe(true);
    expect(policies.lensUpgradeRuleById.has('rule-lens-upgrade-v1')).toBe(true);
    expect(policies.checksums.lensUpgradeRules).toHaveLength(64);
    expect(policies.checksums.contactLensPack).toHaveLength(64);
  });

  it('throws when breakGlass is not allowed in degraded consensus', async () => {
    const registry = baseRegistry();
    registry.breakGlassPolicy.allowedInDegradedConsensus = false;
    const governanceDir = await writeGovernanceDir(registry);

    await expect(loadGovernancePolicies({ governanceDir })).rejects.toThrow(
      'breakGlassPolicy.allowedInDegradedConsensus must be true'
    );
  });

  it('throws when high-risk registry has duplicate intent rules after normalization', async () => {
    const registry = baseRegistry();
    registry.prismHolderApprovalRequired.push({
      intent: 'dispatch_mission',
      rationale: 'duplicate lowercase',
      approvalTimeoutSeconds: 300,
      timeoutBehavior: 'REJECT'
    });
    const governanceDir = await writeGovernanceDir(registry);

    await expect(loadGovernancePolicies({ governanceDir })).rejects.toThrow(
      'duplicate high-risk intent rule for DISPATCH_MISSION'
    );
  });

  it('throws when breakGlass intent is missing from high-risk rules', async () => {
    const registry = baseRegistry();
    registry.prismHolderApprovalRequired = registry.prismHolderApprovalRequired.filter(
      (rule) => rule.intent !== 'EMERGENCY_SHUTDOWN'
    );
    const governanceDir = await writeGovernanceDir(registry);

    await expect(loadGovernancePolicies({ governanceDir })).rejects.toThrow(
      'breakGlass intent EMERGENCY_SHUTDOWN must appear in prismHolderApprovalRequired'
    );
  });

  it('throws when lens upgrade registry has duplicate rule IDs after normalization', async () => {
    const registry = baseRegistry();
    const lensUpgradeRegistry = baseLensUpgradeRegistry();
    lensUpgradeRegistry.rules.push({
      ruleId: 'RULE-LENS-UPGRADE-V1',
      fromVersion: '1.1.0',
      toVersion: '1.2.0'
    });
    const governanceDir = await writeGovernanceDir(registry, lensUpgradeRegistry);

    await expect(loadGovernancePolicies({ governanceDir })).rejects.toThrow(
      'duplicate lens upgrade ruleId RULE-LENS-UPGRADE-V1'
    );
  });

  it('throws when lens upgrade rule does not advance version', async () => {
    const registry = baseRegistry();
    const lensUpgradeRegistry = baseLensUpgradeRegistry();
    lensUpgradeRegistry.rules = [
      {
        ruleId: 'rule-lens-upgrade-invalid',
        fromVersion: '1.1.0',
        toVersion: '1.1.0'
      }
    ];
    const governanceDir = await writeGovernanceDir(registry, lensUpgradeRegistry);

    await expect(loadGovernancePolicies({ governanceDir })).rejects.toThrow(
      'must advance version (1.1.0 -> 1.1.0)'
    );
  });

  it('throws when no contact lens files are present', async () => {
    const governanceDir = await writeGovernanceDir(baseRegistry(), baseLensUpgradeRegistry(), {
      writeDefaultLens: false
    });

    await expect(loadGovernancePolicies({ governanceDir })).rejects.toThrow(
      'no contact lens files found'
    );
  });

  it('throws when contact lens permittedActivities is empty', async () => {
    const governanceDir = await writeGovernanceDir(baseRegistry(), baseLensUpgradeRegistry(), {
      lensOverride: {
        permittedActivities: []
      }
    });

    await expect(loadGovernancePolicies({ governanceDir })).rejects.toThrow();
  });
});
