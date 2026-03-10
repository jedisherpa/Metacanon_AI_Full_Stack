import { z } from 'zod';

export const AGENT_CONFIG_VERSION = 'v1' as const;

export type AgentSkillKind =
  | 'file_organization'
  | 'email_checking'
  | 'transcript_digestion'
  | 'memory_population'
  | 'project_planning'
  | 'code_writing'
  | 'api_integration'
  | 'content_generation'
  | 'audio_production'
  | 'image_generation'
  | 'animation_generation'
  | 'editorial_coordination'
  | 'news_monitoring'
  | 'financial_data_watching'
  | 'day_trading_intelligence'
  | 'phone_call_management'
  | 'meeting_scheduling'
  | 'message_app_management'
  | 'mission_reporting'
  | 'custom';

const scheduleSchema = z.object({
  cronUtc: z.string().min(1).optional(),
  intervalMinutes: z.number().int().positive().optional(),
  skipIfRunning: z.boolean().default(true),
  maxRunSeconds: z.number().int().positive().optional(),
  timezone: z.string().min(1).optional()
});

const computePolicySchema = z.object({
  preferredProvider: z.string().min(1).optional(),
  allowFallback: z.boolean().default(true),
  timeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).max(10).default(2)
});

const securityPolicySchema = z.object({
  requireActionValidation: z.boolean().default(true),
  requireHumanApproval: z.boolean().default(false),
  secretsScope: z.array(z.string().min(1)).default([]),
  piiAllowed: z.boolean().default(false),
  outboundCommsAllowed: z.boolean().default(false)
});

export const agentConfigSchema = z.object({
  version: z.literal(AGENT_CONFIG_VERSION).default(AGENT_CONFIG_VERSION),
  agentId: z.string().min(1),
  skillId: z.string().min(1),
  skillKind: z.string().min(1),
  enabled: z.boolean().default(true),
  displayName: z.string().min(1).optional(),
  schedule: scheduleSchema.optional(),
  compute: computePolicySchema.optional(),
  security: securityPolicySchema.optional(),
  metadata: z.record(z.unknown()).default({}),
  extensions: z.record(z.unknown()).default({})
});

export type AgentScheduleConfig = z.infer<typeof scheduleSchema>;
export type AgentComputePolicy = z.infer<typeof computePolicySchema>;
export type AgentSecurityPolicy = z.infer<typeof securityPolicySchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export type AgentConfigPatch = Omit<
  Partial<AgentConfig>,
  'version' | 'agentId' | 'skillId' | 'skillKind' | 'schedule' | 'compute' | 'security' | 'metadata' | 'extensions'
> & {
  schedule?: Partial<AgentScheduleConfig>;
  compute?: Partial<AgentComputePolicy>;
  security?: Partial<AgentSecurityPolicy>;
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

export function createAgentConfig(input: {
  agentId: string;
  skillId: string;
  skillKind: AgentSkillKind;
  enabled?: boolean;
  displayName?: string;
  schedule?: Partial<AgentScheduleConfig>;
  compute?: Partial<AgentComputePolicy>;
  security?: Partial<AgentSecurityPolicy>;
  metadata?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}): AgentConfig {
  return agentConfigSchema.parse({
    version: AGENT_CONFIG_VERSION,
    ...input,
    schedule: input.schedule ? scheduleSchema.parse(input.schedule) : undefined,
    compute: input.compute ? computePolicySchema.parse(input.compute) : undefined,
    security: input.security ? securityPolicySchema.parse(input.security) : undefined
  });
}

export function mergeAgentConfig(base: AgentConfig, patch: AgentConfigPatch): AgentConfig {
  return agentConfigSchema.parse({
    ...base,
    ...patch,
    version: AGENT_CONFIG_VERSION,
    schedule: patch.schedule ? scheduleSchema.parse({ ...base.schedule, ...patch.schedule }) : base.schedule,
    compute: patch.compute ? computePolicySchema.parse({ ...base.compute, ...patch.compute }) : base.compute,
    security: patch.security ? securityPolicySchema.parse({ ...base.security, ...patch.security }) : base.security,
    metadata: {
      ...(base.metadata ?? {}),
      ...(patch.metadata ?? {})
    },
    extensions: {
      ...(base.extensions ?? {}),
      ...(patch.extensions ?? {})
    }
  });
}
