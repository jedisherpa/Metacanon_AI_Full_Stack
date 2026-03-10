import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { sendApiError } from '../../lib/apiError.js';

type RuntimeSubSphereStatus = 'active' | 'paused' | 'dissolved';

type RuntimeSubSphereRecord = {
  sub_sphere_id: string;
  name: string;
  objective: string;
  hitl_required: boolean;
  status: RuntimeSubSphereStatus;
  created_at: string;
  updated_at: string;
  dissolved_reason: string | null;
};

type AgentBindingRecord = {
  agent_id: string;
  telegram_chat_id: string | null;
  discord_thread_id: string | null;
  in_app_thread_id: string | null;
  is_orchestrator: boolean;
};

type SubSphereBindingRecord = {
  sub_sphere_id: string;
  prism_agent_id: string;
  telegram_chat_id: string | null;
  discord_thread_id: string | null;
  in_app_thread_id: string | null;
};

type RuntimeBridgeCommands = {
  getComputeOptions(): unknown;
  setGlobalComputeProvider(providerId: string): unknown;
  setProviderPriority(priority: string[]): unknown;
  updateProviderConfig(providerId: string, config: Record<string, unknown>): unknown;
  invokeGenesisRite(request: Record<string, unknown>): unknown;
  validateAction(action: Record<string, unknown>, willVector: Record<string, unknown>): boolean;
  createTaskSubSphere(payload: { name: string; objective: string; hitl_required: boolean }): unknown;
  getSubSphereList(): unknown;
  getSubSphereStatus(subSphereId: string): unknown;
  pauseSubSphere(subSphereId: string): unknown;
  dissolveSubSphere(subSphereId: string, reason: string): unknown;
  submitSubSphereQuery(
    subSphereId: string,
    query: string,
    providerOverride?: string | null
  ): unknown;
  updateTelegramIntegration(config: Record<string, unknown>): unknown;
  updateDiscordIntegration(config: Record<string, unknown>): unknown;
  bindAgentCommunicationRoute(payload: Record<string, unknown>): unknown;
  bindSubSpherePrismRoute(payload: Record<string, unknown>): unknown;
  sendAgentMessage(payload: Record<string, unknown>): unknown;
  sendSubSpherePrismMessage(payload: Record<string, unknown>): unknown;
  getCommunicationStatus(): unknown;
};

type RuntimeRouteOptions = {
  bridgeCommands?: RuntimeBridgeCommands | null;
  bridgeModulePath?: string;
  bridgeLoadError?: string | null;
};

type RuntimeBridgeContext = {
  commands: RuntimeBridgeCommands | null;
  modulePath: string;
  loadError: string | null;
};

const RUNTIME_BASE = '/api/v1/runtime';
const supportedProviderIds = [
  'qwen_local',
  'ollama',
  'morpheus',
  'openai',
  'anthropic',
  'moonshot_kimi',
  'grok'
] as const;

const providerKindById: Record<(typeof supportedProviderIds)[number], 'local' | 'cloud' | 'sovereign'> = {
  qwen_local: 'local',
  ollama: 'local',
  morpheus: 'sovereign',
  openai: 'cloud',
  anthropic: 'cloud',
  moonshot_kimi: 'cloud',
  grok: 'cloud'
};

const defaultProviderLabels: Record<(typeof supportedProviderIds)[number], string> = {
  qwen_local: 'Qwen 3.5 32B Local',
  ollama: 'Ollama Local',
  morpheus: 'Morpheus Sovereign',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  moonshot_kimi: 'Moonshot Kimi',
  grok: 'Grok'
};

const setGlobalProviderSchema = z.object({
  provider_id: z.enum(supportedProviderIds)
});

const setCloudPrioritySchema = z.object({
  cloud_provider_priority: z.array(z.enum(supportedProviderIds)).default([])
});

const updateProviderConfigSchema = z.object({
  config: z.record(z.string(), z.unknown()).default({})
});

const invokeGenesisSchema = z.object({
  vision_core: z.string().trim().min(1).optional(),
  core_values: z.array(z.string()).optional(),
  will_directives: z.array(z.string()).optional(),
  signing_secret: z.string().trim().min(1).optional()
});

const validateActionSchema = z.object({
  action: z.record(z.string(), z.unknown()),
  will_vector: z.record(z.string(), z.unknown())
});

const createSubSphereSchema = z.object({
  name: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  hitl_required: z.boolean().default(false)
});

const dissolveSubSphereSchema = z.object({
  reason: z.string().trim().min(1).optional()
});

const querySubSphereSchema = z.object({
  query: z.string().trim().min(1),
  provider_override: z.string().trim().min(1).nullable().optional()
});

const updateTelegramSchema = z.object({
  enabled: z.boolean().optional(),
  live_api: z.boolean().optional(),
  routing_mode: z.enum(['orchestrator', 'direct']).optional(),
  bot_token: z.string().trim().min(1).nullable().optional(),
  default_chat_id: z.string().trim().min(1).nullable().optional(),
  orchestrator_chat_id: z.string().trim().min(1).nullable().optional(),
  use_webhook: z.boolean().optional(),
  webhook_url: z.string().trim().min(1).nullable().optional(),
  webhook_secret_token: z.string().trim().min(1).nullable().optional()
});

const updateDiscordSchema = z.object({
  enabled: z.boolean().optional(),
  live_api: z.boolean().optional(),
  routing_mode: z.enum(['orchestrator', 'direct']).optional(),
  bot_token: z.string().trim().min(1).nullable().optional(),
  guild_id: z.string().trim().min(1).nullable().optional(),
  default_channel_id: z.string().trim().min(1).nullable().optional(),
  orchestrator_thread_id: z.string().trim().min(1).nullable().optional(),
  auto_spawn_sub_sphere_threads: z.boolean().optional()
});

const bindAgentRouteSchema = z.object({
  agent_id: z.string().trim().min(1),
  telegram_chat_id: z.string().trim().min(1).nullable().optional(),
  discord_thread_id: z.string().trim().min(1).nullable().optional(),
  in_app_thread_id: z.string().trim().min(1).nullable().optional(),
  is_orchestrator: z.boolean().optional()
});

const bindSubSpherePrismRouteSchema = z.object({
  sub_sphere_id: z.string().trim().min(1),
  prism_agent_id: z.string().trim().min(1),
  telegram_chat_id: z.string().trim().min(1).nullable().optional(),
  discord_thread_id: z.string().trim().min(1).nullable().optional(),
  in_app_thread_id: z.string().trim().min(1).nullable().optional()
});

const agentMessageSchema = z.object({
  platform: z.enum(['telegram', 'discord', 'in_app']),
  agent_id: z.string().trim().min(1),
  message: z.string().trim().min(1)
});

const subSphereMessageSchema = z.object({
  platform: z.enum(['telegram', 'discord', 'in_app']),
  sub_sphere_id: z.string().trim().min(1),
  message: z.string().trim().min(1)
});

function normalizeNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function providerExists(providerId: string): providerId is (typeof supportedProviderIds)[number] {
  return supportedProviderIds.includes(providerId as (typeof supportedProviderIds)[number]);
}

function truthyEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return 'unknown runtime bridge error';
}

function loadRuntimeBridgeFromDisk(): RuntimeBridgeContext {
  if (!truthyEnv(process.env.METACANON_RUNTIME_BRIDGE_ENABLED)) {
    return {
      commands: null,
      modulePath: 'metacanon-runtime/memory',
      loadError: null
    };
  }

  const explicit = process.env.METACANON_RUNTIME_BRIDGE_MODULE?.trim();
  const candidates = [
    ...(explicit
      ? [
          explicit.startsWith('.')
            ? path.resolve(process.cwd(), explicit)
            : explicit
        ]
      : []),
    path.resolve(process.cwd(), '../ffi-node/commands.js'),
    path.resolve(process.cwd(), '../../ffi-node/commands.js'),
    path.resolve(process.cwd(), 'ffi-node/commands.js'),
    'ffi-node/commands.js'
  ].filter((value, index, values): value is string => {
    if (!value || value.trim().length === 0) {
      return false;
    }
    return values.indexOf(value) === index;
  });

  const require = createRequire(import.meta.url);
  let lastError: string | null = null;

  for (const candidate of candidates) {
    try {
      // Treat absolute paths and normalized relative file requests as on-disk targets.
      if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) {
        continue;
      }
      const moduleValue = require(candidate) as {
        createInstallerWebappCommands?: () => RuntimeBridgeCommands;
      };
      if (typeof moduleValue.createInstallerWebappCommands !== 'function') {
        lastError = `${candidate} does not export createInstallerWebappCommands()`;
        continue;
      }

      const commands = moduleValue.createInstallerWebappCommands();
      return {
        commands,
        modulePath: candidate,
        loadError: null
      };
    } catch (error) {
      lastError = `${candidate}: ${readErrorMessage(error)}`;
    }
  }

  return {
    commands: null,
    modulePath: explicit || candidates[0] || 'metacanon-runtime/memory',
    loadError:
      lastError ??
      'runtime bridge enabled but no bridge module was found (set METACANON_RUNTIME_BRIDGE_MODULE).'
  };
}

function sendRuntimeBridgeError(
  req: Parameters<typeof sendApiError>[0],
  res: Parameters<typeof sendApiError>[1],
  operation: string,
  error: unknown
): void {
  sendApiError(
    req,
    res,
    502,
    'RUNTIME_BRIDGE_ERROR',
    `Runtime bridge operation '${operation}' failed: ${readErrorMessage(error)}`,
    true
  );
}

export function createRuntimeRoutes(options: RuntimeRouteOptions = {}): Router {
  const router = Router();
  const controlApiKey = process.env.METACANON_CONTROL_API_KEY?.trim() ?? '';
  const bridge =
    options.bridgeCommands === undefined
      ? loadRuntimeBridgeFromDisk()
      : {
          commands: options.bridgeCommands,
          modulePath: options.bridgeModulePath ?? 'metacanon-runtime/injected',
          loadError: options.bridgeLoadError ?? null
        };

  const runtimeState = {
    commandsModulePath: bridge.modulePath,
    loaded: bridge.loadError == null || Boolean(bridge.commands),
    loadError: bridge.loadError as string | null,
    globalProviderId: 'qwen_local',
    cloudProviderPriority: ['openai', 'anthropic', 'moonshot_kimi', 'grok'],
    providerConfigs: new Map<string, Record<string, unknown>>(),
    subSpheres: new Map<string, RuntimeSubSphereRecord>(),
    telegram: {
      enabled: false,
      live_api: false,
      routing_mode: 'orchestrator' as 'orchestrator' | 'direct',
      default_chat_id: null as string | null,
      orchestrator_chat_id: null as string | null,
      use_webhook: false,
      webhook_url: null as string | null
    },
    discord: {
      enabled: false,
      live_api: false,
      routing_mode: 'orchestrator' as 'orchestrator' | 'direct',
      guild_id: null as string | null,
      default_channel_id: null as string | null,
      orchestrator_thread_id: null as string | null,
      auto_spawn_sub_sphere_threads: true
    },
    agentBindings: new Map<string, AgentBindingRecord>(),
    subSphereBindings: new Map<string, SubSphereBindingRecord>()
  };

  function buildComputeOptions() {
    return supportedProviderIds.map((providerId) => ({
      provider_id: providerId,
      display_name: defaultProviderLabels[providerId],
      kind: providerKindById[providerId],
      configured: providerId === 'qwen_local' || runtimeState.providerConfigs.has(providerId),
      available: true,
      selected_global: runtimeState.globalProviderId === providerId,
      default_if_skipped: providerId === 'qwen_local'
    }));
  }

  function buildCommunicationStatus() {
    return {
      ok: true,
      telegram: {
        ...runtimeState.telegram,
        configured: runtimeState.telegram.enabled && Boolean(runtimeState.telegram.default_chat_id)
      },
      discord: {
        ...runtimeState.discord,
        configured: runtimeState.discord.enabled && Boolean(runtimeState.discord.default_channel_id)
      },
      agent_bindings: [...runtimeState.agentBindings.values()],
      sub_sphere_bindings: [...runtimeState.subSphereBindings.values()]
    };
  }

  router.use(RUNTIME_BASE, (req, res, next) => {
    if (!controlApiKey) {
      next();
      return;
    }

    const provided = req.header('x-metacanon-key')?.trim() ?? '';
    if (!provided || provided !== controlApiKey) {
      sendApiError(
        req,
        res,
        401,
        'RUNTIME_AUTH_REQUIRED',
        'Runtime control API key is missing or invalid.',
        false
      );
      return;
    }

    next();
  });

  router.get(`${RUNTIME_BASE}/healthz`, (_req, res) => {
    res.json({
      status: runtimeState.loaded ? 'ok' : 'degraded',
      bridge_ready: runtimeState.loaded,
      bridge_mode: bridge.commands ? 'ffi' : 'memory',
      commands_module_path: runtimeState.commandsModulePath,
      ...(runtimeState.loadError ? { error: runtimeState.loadError } : {})
    });
  });

  router.get(`${RUNTIME_BASE}/bridge/state`, (_req, res) => {
    res.json({
      commands_module_path: runtimeState.commandsModulePath,
      loaded: runtimeState.loaded,
      load_error: runtimeState.loadError,
      mode: bridge.commands ? 'ffi' : 'memory'
    });
  });

  router.get(`${RUNTIME_BASE}/compute/options`, (_req, res) => {
    if (bridge.commands) {
      try {
        const options = bridge.commands.getComputeOptions();
        res.json(options);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(_req, res, 'getComputeOptions', error);
      }
      return;
    }

    res.json(buildComputeOptions());
  });

  router.post(`${RUNTIME_BASE}/compute/global-provider`, (req, res) => {
    const parsed = setGlobalProviderSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid global provider payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.setGlobalComputeProvider(parsed.data.provider_id);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'setGlobalComputeProvider', error);
      }
      return;
    }

    runtimeState.globalProviderId = parsed.data.provider_id;
    res.json({
      ok: true,
      provider_id: runtimeState.globalProviderId
    });
  });

  router.post(`${RUNTIME_BASE}/compute/priority`, (req, res) => {
    const parsed = setCloudPrioritySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid compute priority payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.setProviderPriority(parsed.data.cloud_provider_priority);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'setProviderPriority', error);
      }
      return;
    }

    const normalized = parsed.data.cloud_provider_priority.filter(
      (providerId, index, values) =>
        providerKindById[providerId] === 'cloud' && values.indexOf(providerId) === index
    );
    runtimeState.cloudProviderPriority = normalized;

    res.json({
      ok: true,
      cloud_provider_priority: runtimeState.cloudProviderPriority
    });
  });

  router.post(`${RUNTIME_BASE}/providers/:providerId/config`, (req, res) => {
    const providerId = req.params.providerId;
    if (!providerExists(providerId)) {
      sendApiError(req, res, 404, 'RUNTIME_PROVIDER_NOT_FOUND', `Unknown provider '${providerId}'.`, false);
      return;
    }

    const parsed = updateProviderConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid provider config payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.updateProviderConfig(providerId, parsed.data.config);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'updateProviderConfig', error);
      }
      return;
    }

    runtimeState.providerConfigs.set(providerId, parsed.data.config);
    res.json({
      ok: true,
      provider_id: providerId,
      config: parsed.data.config
    });
  });

  router.post(`${RUNTIME_BASE}/genesis/invoke`, (req, res) => {
    const parsed = invokeGenesisSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid genesis invocation payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.invokeGenesisRite({
          vision_core: parsed.data.vision_core ?? 'MetaCanon runtime bridge genesis invocation',
          core_values: parsed.data.core_values ?? ['Sovereignty'],
          soul_facets: [],
          human_in_loop: true,
          interpretive_boundaries: [],
          drift_prevention: 'strict',
          enable_morpheus_compute: false,
          morpheus: {},
          will_directives: parsed.data.will_directives ?? [],
          signing_secret: parsed.data.signing_secret ?? 'runtime-bridge-signing-secret'
        });
        res.status(201).json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'invokeGenesisRite', error);
      }
      return;
    }

    const createdAt = nowIso();
    res.status(201).json({
      ok: true,
      genesis_id: randomUUID(),
      created_at: createdAt,
      summary: {
        vision_core: parsed.data.vision_core ?? null,
        core_values_count: parsed.data.core_values?.length ?? 0,
        will_directives_count: parsed.data.will_directives?.length ?? 0
      }
    });
  });

  router.post(`${RUNTIME_BASE}/actions/validate`, (req, res) => {
    const parsed = validateActionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid action validation payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const valid = bridge.commands.validateAction(parsed.data.action, parsed.data.will_vector);
        res.json({
          valid,
          reason: valid ? null : 'action blocked by bridge validation'
        });
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'validateAction', error);
      }
      return;
    }

    const actionContent = parsed.data.action.content;
    const valid = typeof actionContent === 'string' && actionContent.trim().length > 0;
    res.json({
      valid,
      reason: valid ? null : 'action.content must be a non-empty string'
    });
  });

  router.post(`${RUNTIME_BASE}/sub-spheres`, (req, res) => {
    const parsed = createSubSphereSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid sub-sphere payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.createTaskSubSphere({
          name: parsed.data.name,
          objective: parsed.data.objective,
          hitl_required: parsed.data.hitl_required
        });
        res.status(201).json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'createTaskSubSphere', error);
      }
      return;
    }

    const timestamp = nowIso();
    const record: RuntimeSubSphereRecord = {
      sub_sphere_id: randomUUID(),
      name: parsed.data.name,
      objective: parsed.data.objective,
      hitl_required: parsed.data.hitl_required,
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
      dissolved_reason: null
    };

    runtimeState.subSpheres.set(record.sub_sphere_id, record);
    res.status(201).json(record);
  });

  router.get(`${RUNTIME_BASE}/sub-spheres`, (_req, res) => {
    if (bridge.commands) {
      try {
        const result = bridge.commands.getSubSphereList();
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(_req, res, 'getSubSphereList', error);
      }
      return;
    }

    res.json([...runtimeState.subSpheres.values()]);
  });

  router.get(`${RUNTIME_BASE}/sub-spheres/:subSphereId`, (req, res) => {
    if (bridge.commands) {
      try {
        const result = bridge.commands.getSubSphereStatus(req.params.subSphereId);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'getSubSphereStatus', error);
      }
      return;
    }

    const record = runtimeState.subSpheres.get(req.params.subSphereId);
    if (!record) {
      sendApiError(req, res, 404, 'RUNTIME_SUB_SPHERE_NOT_FOUND', 'Sub-sphere was not found.', false);
      return;
    }

    res.json(record);
  });

  router.post(`${RUNTIME_BASE}/sub-spheres/:subSphereId/pause`, (req, res) => {
    if (bridge.commands) {
      try {
        const result = bridge.commands.pauseSubSphere(req.params.subSphereId);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'pauseSubSphere', error);
      }
      return;
    }

    const record = runtimeState.subSpheres.get(req.params.subSphereId);
    if (!record) {
      sendApiError(req, res, 404, 'RUNTIME_SUB_SPHERE_NOT_FOUND', 'Sub-sphere was not found.', false);
      return;
    }

    record.status = 'paused';
    record.updated_at = nowIso();
    runtimeState.subSpheres.set(record.sub_sphere_id, record);
    res.json(record);
  });

  router.post(`${RUNTIME_BASE}/sub-spheres/:subSphereId/dissolve`, (req, res) => {
    if (bridge.commands) {
      const parsed = dissolveSubSphereSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid dissolve payload.', false, {
          errors: parsed.error.flatten()
        });
        return;
      }

      try {
        const result = bridge.commands.dissolveSubSphere(req.params.subSphereId, parsed.data.reason ?? '');
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'dissolveSubSphere', error);
      }
      return;
    }

    const record = runtimeState.subSpheres.get(req.params.subSphereId);
    if (!record) {
      sendApiError(req, res, 404, 'RUNTIME_SUB_SPHERE_NOT_FOUND', 'Sub-sphere was not found.', false);
      return;
    }

    const parsed = dissolveSubSphereSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid dissolve payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    record.status = 'dissolved';
    record.updated_at = nowIso();
    record.dissolved_reason = parsed.data.reason ?? null;
    runtimeState.subSpheres.set(record.sub_sphere_id, record);
    res.json(record);
  });

  router.post(`${RUNTIME_BASE}/sub-spheres/:subSphereId/query`, (req, res) => {
    if (bridge.commands) {
      const parsed = querySubSphereSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid query payload.', false, {
          errors: parsed.error.flatten()
        });
        return;
      }

      try {
        const result = bridge.commands.submitSubSphereQuery(
          req.params.subSphereId,
          parsed.data.query,
          parsed.data.provider_override ?? null
        );
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'submitSubSphereQuery', error);
      }
      return;
    }

    const record = runtimeState.subSpheres.get(req.params.subSphereId);
    if (!record) {
      sendApiError(req, res, 404, 'RUNTIME_SUB_SPHERE_NOT_FOUND', 'Sub-sphere was not found.', false);
      return;
    }

    const parsed = querySubSphereSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid query payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (record.status !== 'active') {
      sendApiError(
        req,
        res,
        409,
        'RUNTIME_SUB_SPHERE_NOT_ACTIVE',
        'Sub-sphere must be active to process queries.',
        false
      );
      return;
    }

    const providerId = normalizeNullable(parsed.data.provider_override) ?? runtimeState.globalProviderId;
    res.json({
      ok: true,
      sub_sphere_id: record.sub_sphere_id,
      query: parsed.data.query,
      provider_id: providerId,
      output_text: `Runtime query routed via ${providerId}.`
    });
  });

  router.get(`${RUNTIME_BASE}/communications/status`, (_req, res) => {
    if (bridge.commands) {
      try {
        const result = bridge.commands.getCommunicationStatus();
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(_req, res, 'getCommunicationStatus', error);
      }
      return;
    }

    res.json(buildCommunicationStatus());
  });

  router.post(`${RUNTIME_BASE}/communications/telegram`, (req, res) => {
    const parsed = updateTelegramSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid telegram integration payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.updateTelegramIntegration(parsed.data as Record<string, unknown>);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'updateTelegramIntegration', error);
      }
      return;
    }

    const next = parsed.data;
    if (next.enabled !== undefined) runtimeState.telegram.enabled = next.enabled;
    if (next.live_api !== undefined) runtimeState.telegram.live_api = next.live_api;
    if (next.routing_mode) runtimeState.telegram.routing_mode = next.routing_mode;
    if (next.default_chat_id !== undefined) runtimeState.telegram.default_chat_id = normalizeNullable(next.default_chat_id);
    if (next.orchestrator_chat_id !== undefined) {
      runtimeState.telegram.orchestrator_chat_id = normalizeNullable(next.orchestrator_chat_id);
    }
    if (next.use_webhook !== undefined) runtimeState.telegram.use_webhook = next.use_webhook;
    if (next.webhook_url !== undefined) runtimeState.telegram.webhook_url = normalizeNullable(next.webhook_url);

    res.json(buildCommunicationStatus());
  });

  router.post(`${RUNTIME_BASE}/communications/discord`, (req, res) => {
    const parsed = updateDiscordSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid discord integration payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.updateDiscordIntegration(parsed.data as Record<string, unknown>);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'updateDiscordIntegration', error);
      }
      return;
    }

    const next = parsed.data;
    if (next.enabled !== undefined) runtimeState.discord.enabled = next.enabled;
    if (next.live_api !== undefined) runtimeState.discord.live_api = next.live_api;
    if (next.routing_mode) runtimeState.discord.routing_mode = next.routing_mode;
    if (next.guild_id !== undefined) runtimeState.discord.guild_id = normalizeNullable(next.guild_id);
    if (next.default_channel_id !== undefined) {
      runtimeState.discord.default_channel_id = normalizeNullable(next.default_channel_id);
    }
    if (next.orchestrator_thread_id !== undefined) {
      runtimeState.discord.orchestrator_thread_id = normalizeNullable(next.orchestrator_thread_id);
    }
    if (next.auto_spawn_sub_sphere_threads !== undefined) {
      runtimeState.discord.auto_spawn_sub_sphere_threads = next.auto_spawn_sub_sphere_threads;
    }

    res.json(buildCommunicationStatus());
  });

  router.post(`${RUNTIME_BASE}/communications/agents/bind`, (req, res) => {
    const parsed = bindAgentRouteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid agent bind payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.bindAgentCommunicationRoute(parsed.data as Record<string, unknown>);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'bindAgentCommunicationRoute', error);
      }
      return;
    }

    const binding: AgentBindingRecord = {
      agent_id: parsed.data.agent_id,
      telegram_chat_id: normalizeNullable(parsed.data.telegram_chat_id),
      discord_thread_id: normalizeNullable(parsed.data.discord_thread_id),
      in_app_thread_id: normalizeNullable(parsed.data.in_app_thread_id),
      is_orchestrator: parsed.data.is_orchestrator ?? false
    };
    runtimeState.agentBindings.set(binding.agent_id, binding);
    res.json({
      ok: true,
      binding
    });
  });

  router.post(`${RUNTIME_BASE}/communications/sub-spheres/prism/bind`, (req, res) => {
    const parsed = bindSubSpherePrismRouteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid sub-sphere prism bind payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.bindSubSpherePrismRoute(parsed.data as Record<string, unknown>);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'bindSubSpherePrismRoute', error);
      }
      return;
    }

    const binding: SubSphereBindingRecord = {
      sub_sphere_id: parsed.data.sub_sphere_id,
      prism_agent_id: parsed.data.prism_agent_id,
      telegram_chat_id: normalizeNullable(parsed.data.telegram_chat_id),
      discord_thread_id: normalizeNullable(parsed.data.discord_thread_id),
      in_app_thread_id: normalizeNullable(parsed.data.in_app_thread_id)
    };
    runtimeState.subSphereBindings.set(binding.sub_sphere_id, binding);
    res.json({
      ok: true,
      binding
    });
  });

  router.post(`${RUNTIME_BASE}/communications/agents/message`, (req, res) => {
    const parsed = agentMessageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid agent message payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.sendAgentMessage(parsed.data as Record<string, unknown>);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'sendAgentMessage', error);
      }
      return;
    }

    const agentBinding = runtimeState.agentBindings.get(parsed.data.agent_id);
    res.json({
      ok: true,
      delivered: true,
      message_id: randomUUID(),
      platform: parsed.data.platform,
      agent_id: parsed.data.agent_id,
      route_resolved: Boolean(agentBinding),
      output_text: `Delivered to ${parsed.data.agent_id} on ${parsed.data.platform}.`
    });
  });

  router.post(`${RUNTIME_BASE}/communications/sub-spheres/message`, (req, res) => {
    const parsed = subSphereMessageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendApiError(req, res, 400, 'RUNTIME_INVALID_SCHEMA', 'Invalid sub-sphere message payload.', false, {
        errors: parsed.error.flatten()
      });
      return;
    }

    if (bridge.commands) {
      try {
        const result = bridge.commands.sendSubSpherePrismMessage(parsed.data as Record<string, unknown>);
        res.json(result);
      } catch (error) {
        runtimeState.loadError = readErrorMessage(error);
        sendRuntimeBridgeError(req, res, 'sendSubSpherePrismMessage', error);
      }
      return;
    }

    const binding = runtimeState.subSphereBindings.get(parsed.data.sub_sphere_id);
    res.json({
      ok: true,
      delivered: true,
      message_id: randomUUID(),
      platform: parsed.data.platform,
      sub_sphere_id: parsed.data.sub_sphere_id,
      route_resolved: Boolean(binding),
      output_text: `Delivered to sub-sphere ${parsed.data.sub_sphere_id} on ${parsed.data.platform}.`
    });
  });

  return router;
}
