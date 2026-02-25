import { describe, expect, it } from 'vitest';
import { createIntentValidator } from './contactLensValidator.js';
import type { GovernancePolicies } from './policyLoader.js';

function makePolicies(): GovernancePolicies {
  const highRiskRegistry = {
    version: '1.1',
    description: 'test',
    prismHolderApprovalRequired: [
      {
        intent: 'DISPATCH_MISSION',
        rationale: 'high risk',
        approvalTimeoutSeconds: 300,
        timeoutBehavior: 'REJECT' as const
      },
      {
        intent: 'EMERGENCY_SHUTDOWN',
        rationale: 'break glass',
        approvalTimeoutSeconds: 60,
        timeoutBehavior: 'ALLOW_WITH_LOG' as const
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

  const highRiskByIntent = new Map(
    highRiskRegistry.prismHolderApprovalRequired.map((rule) => [rule.intent, rule])
  );

  const contactLensesByDid = new Map([
    [
      'did:test:alpha',
      {
        did: 'did:test:alpha',
        scope: 'test scope',
        permittedActivities: ['DISPATCH_MISSION', 'MISSION_REPORT', 'EMERGENCY_SHUTDOWN'],
        prohibitedActions: ['MODIFY_CONTACT_LENS'],
        humanInTheLoopRequirements: [],
        interpretiveBoundaries: 'none'
      }
    ]
  ]);

  return {
    governanceRoot: '/tmp/governance',
    contactLensSchemaPath: '/tmp/governance/contact_lens_schema.json',
    highRiskRegistryPath: '/tmp/governance/high_risk_intent_registry.json',
    contactLensesPath: '/tmp/governance/contact_lenses',
    checksums: {
      contactLensSchema: 'x',
      highRiskRegistry: 'y',
      contactLenses: {}
    },
    highRiskRegistry,
    highRiskByIntent,
    contactLensesByDid
  };
}

describe('createIntentValidator', () => {
  it('rejects high-risk intent without prism holder approval', () => {
    const validate = createIntentValidator(makePolicies());

    const result = validate({
      intent: 'DISPATCH_MISSION',
      agentDid: 'did:test:alpha',
      threadState: 'ACTIVE',
      prismHolderApproved: false
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('PRISM_HOLDER_APPROVAL_REQUIRED');
  });

  it('allows break-glass emergency shutdown in degraded mode with dual control', () => {
    const validate = createIntentValidator(makePolicies());

    const result = validate({
      intent: 'EMERGENCY_SHUTDOWN',
      agentDid: 'did:test:alpha',
      threadState: 'DEGRADED_NO_LLM',
      prismHolderApproved: false,
      breakGlass: {
        actorDid: 'did:test:commander',
        actorRole: 'Commander',
        confirmerDid: 'did:test:observer',
        confirmerRole: 'Prism Holder',
        reason: 'safety stop'
      }
    });

    expect(result.allowed).toBe(true);
  });

  it('rejects break-glass emergency shutdown in degraded mode without controls', () => {
    const validate = createIntentValidator(makePolicies());

    const result = validate({
      intent: 'EMERGENCY_SHUTDOWN',
      agentDid: 'did:test:alpha',
      threadState: 'DEGRADED_NO_LLM',
      prismHolderApproved: false,
      breakGlass: {
        actorDid: 'did:test:commander',
        actorRole: 'Commander'
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('BREAK_GLASS_AUTH_FAILED');
  });
});
