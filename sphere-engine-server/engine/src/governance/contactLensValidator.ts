import type { GovernancePolicies } from './policyLoader.js';

export type ThreadGovernanceState = 'ACTIVE' | 'HALTED' | 'DEGRADED_NO_LLM';

export type BreakGlassContext = {
  actorDid?: string;
  actorRole?: string;
  confirmerDid?: string;
  confirmerRole?: string;
  emergencyCredential?: string;
  reason?: string;
};

export type IntentValidationInput = {
  intent: string;
  agentDid: string;
  threadState: ThreadGovernanceState;
  prismHolderApproved: boolean;
  breakGlass?: BreakGlassContext;
};

export type IntentValidationResult = {
  allowed: boolean;
  code?:
    | 'THREAD_HALTED'
    | 'INTENT_BLOCKED_IN_DEGRADED_MODE'
    | 'LENS_NOT_FOUND'
    | 'LENS_PROHIBITED_ACTION'
    | 'LENS_ACTION_NOT_PERMITTED'
    | 'PRISM_HOLDER_APPROVAL_REQUIRED'
    | 'BREAK_GLASS_AUTH_FAILED';
  message?: string;
  requiresApproval: boolean;
  highRisk: boolean;
};

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

export function createIntentValidator(policies: GovernancePolicies) {
  const blockedInDegraded = new Set(
    policies.highRiskRegistry.degradedConsensusBlockedIntents.map(normalize)
  );

  return function validateIntent(input: IntentValidationInput): IntentValidationResult {
    const normalizedIntent = normalize(input.intent);
    const highRiskRule = policies.highRiskByIntent.get(normalizedIntent);
    const highRisk = Boolean(highRiskRule);
    const lens = policies.contactLensesByDid.get(input.agentDid);
    const isBreakGlassIntent =
      normalize(policies.highRiskRegistry.breakGlassPolicy.intent) === normalizedIntent;

    if (input.threadState === 'HALTED' && normalizedIntent !== 'EMERGENCY_SHUTDOWN') {
      return {
        allowed: false,
        code: 'THREAD_HALTED',
        message: 'Thread is halted and cannot accept this intent.',
        requiresApproval: false,
        highRisk
      };
    }

    if (!lens && !isBreakGlassIntent) {
      return {
        allowed: false,
        code: 'LENS_NOT_FOUND',
        message: `No contact lens configured for agent ${input.agentDid}.`,
        requiresApproval: false,
        highRisk
      };
    }

    if (
      input.threadState === 'DEGRADED_NO_LLM' &&
      blockedInDegraded.has(normalizedIntent) &&
      !isBreakGlassIntent
    ) {
      return {
        allowed: false,
        code: 'INTENT_BLOCKED_IN_DEGRADED_MODE',
        message: `Intent ${input.intent} is blocked while system is in DEGRADED_NO_LLM mode.`,
        requiresApproval: highRisk,
        highRisk
      };
    }

    if (lens) {
      const prohibited = lens.prohibitedActions.map(normalize);
      if (prohibited.includes(normalizedIntent)) {
        return {
          allowed: false,
          code: 'LENS_PROHIBITED_ACTION',
          message: `Intent ${input.intent} is prohibited by contact lens for ${input.agentDid}.`,
          requiresApproval: false,
          highRisk
        };
      }

      const permitted = lens.permittedActivities.map(normalize);
      if (!permitted.includes(normalizedIntent)) {
        return {
          allowed: false,
          code: 'LENS_ACTION_NOT_PERMITTED',
          message: `Intent ${input.intent} is not in permitted activities for ${input.agentDid}.`,
          requiresApproval: false,
          highRisk
        };
      }
    }

    const hasHumanRequirement = Boolean(
      lens?.humanInTheLoopRequirements.some((rule) => normalize(rule.intent) === normalizedIntent)
    );

    const requiresApproval = highRisk || hasHumanRequirement;

    if (isBreakGlassIntent && input.threadState === 'DEGRADED_NO_LLM') {
      const breakGlass = policies.highRiskRegistry.breakGlassPolicy;
      const actorRole = input.breakGlass?.actorRole?.trim();
      const actorAllowed = Boolean(actorRole && breakGlass.authorizedRoles.includes(actorRole));
      const confirmerRole = input.breakGlass?.confirmerRole?.trim();
      const authorizedConfirmer = Boolean(
        input.breakGlass?.confirmerDid?.trim() &&
          confirmerRole &&
          breakGlass.authorizedRoles.includes(confirmerRole)
      );
      const dualControlSatisfied =
        !breakGlass.dualControlRequired ||
        authorizedConfirmer ||
        Boolean(input.breakGlass?.emergencyCredential?.trim());
      const reasonProvided = Boolean(input.breakGlass?.reason?.trim());

      if (!actorAllowed || !dualControlSatisfied || !reasonProvided) {
        return {
          allowed: false,
          code: 'BREAK_GLASS_AUTH_FAILED',
          message:
            'Break-glass authorization failed for EMERGENCY_SHUTDOWN (role, dual-control/credential, or reason missing).',
          requiresApproval: false,
          highRisk
        };
      }

      return {
        allowed: true,
        requiresApproval: false,
        highRisk
      };
    }

    if (requiresApproval && !input.prismHolderApproved) {
      return {
        allowed: false,
        code: 'PRISM_HOLDER_APPROVAL_REQUIRED',
        message: `Intent ${input.intent} requires Prism Holder approval.`,
        requiresApproval,
        highRisk
      };
    }

    return {
      allowed: true,
      requiresApproval,
      highRisk
    };
  };
}
