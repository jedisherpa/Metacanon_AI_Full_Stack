import path from 'node:path';
import { createRequire } from 'node:module';
import type { Application, NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const require = createRequire(import.meta.url);

type InstallerWebappCommands = {
  getComputeOptions(): unknown;
  setGlobalComputeProvider(providerId: string): unknown;
  setProviderPriority(cloudProviderPriority: string[]): unknown;
  updateProviderConfig(providerId: string, config: Record<string, unknown>): unknown;
  invokeGenesisRite(request: Record<string, unknown>): unknown;
  validateAction(action: Record<string, unknown>, willVector: Record<string, unknown>): boolean;
  createTaskSubSphere(payload: { name: string; objective: string; hitl_required: boolean }): unknown;
  getSubSphereList(): unknown;
  getSubSphereStatus(subSphereId: string): unknown;
  pauseSubSphere(subSphereId: string): unknown;
  dissolveSubSphere(subSphereId: string, reason: string): unknown;
  submitSubSphereQuery(subSphereId: string, query: string, providerOverride?: string | null): unknown;
  updateTelegramIntegration(config: Record<string, unknown>): unknown;
  updateDiscordIntegration(config: Record<string, unknown>): unknown;
  bindAgentCommunicationRoute(payload: Record<string, unknown>): unknown;
  bindSubSpherePrismRoute(payload: Record<string, unknown>): unknown;
  sendAgentMessage(payload: Record<string, unknown>): unknown;
  sendSubSpherePrismMessage(payload: Record<string, unknown>): unknown;
  getCommunicationStatus(): unknown;
};

type CommandsModule = {
  createInstallerWebappCommands: () => InstallerWebappCommands;
};

export type RuntimeControlConfig = {
  controlApiKey?: string;
  commandsModulePath?: string;
};

class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const providerSchema = z.object({
  provider_id: z.string().min(1),
});

const cloudPrioritySchema = z.object({
  cloud_provider_priority: z.array(z.string().min(1)).min(1),
});

const providerConfigSchema = z.object({
  config: z.record(z.unknown()),
});

const validateActionSchema = z.object({
  action: z.record(z.unknown()),
  will_vector: z.record(z.unknown()),
});

const subSphereCreateSchema = z.object({
  name: z.string().min(1),
  objective: z.string().min(1),
  hitl_required: z.boolean().default(false),
});

const subSphereDissolveSchema = z.object({
  reason: z.string().min(1),
});

const subSphereQuerySchema = z.object({
  query: z.string().min(1),
  provider_override: z.string().min(1).nullable().optional(),
});

const agentBindingSchema = z.object({
  agent_id: z.string().min(1),
  telegram_chat_id: z.string().min(1).nullable().optional(),
  discord_thread_id: z.string().min(1).nullable().optional(),
  in_app_thread_id: z.string().min(1).nullable().optional(),
  is_orchestrator: z.boolean().optional(),
});

const prismBindingSchema = z.object({
  sub_sphere_id: z.string().min(1),
  prism_agent_id: z.string().min(1),
  telegram_chat_id: z.string().min(1).nullable().optional(),
  discord_thread_id: z.string().min(1).nullable().optional(),
  in_app_thread_id: z.string().min(1).nullable().optional(),
});

const messageSchema = z.object({
  platform: z.enum(['telegram', 'discord', 'in_app']),
  message: z.string().min(1),
});

const agentMessageSchema = messageSchema.extend({
  agent_id: z.string().min(1),
});

const prismMessageSchema = messageSchema.extend({
  sub_sphere_id: z.string().min(1),
});

const nonNullRecordSchema = z.record(z.unknown()).refine((value) => !Array.isArray(value), {
  message: 'Expected JSON object body',
});

function resolveCommandsModulePath(configuredPath?: string): string {
  const source = configuredPath ?? process.env.METACANON_FFI_NODE_PATH ?? '../ffi-node/commands.js';
  return path.resolve(process.cwd(), source);
}

function parseJsonBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new HttpError(400, `Invalid request payload: ${detail}`);
  }
  return parsed.data;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: message });
}

function controlAuthMiddleware(apiKey?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!apiKey) {
      next();
      return;
    }

    const tokenFromHeader = req.header('x-metacanon-key');
    const authHeader = req.header('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
    const providedToken = tokenFromHeader ?? bearerToken;

    if (providedToken !== apiKey) {
      res.status(401).json({ error: 'Unauthorized runtime control request' });
      return;
    }

    next();
  };
}

function registerRuntimeRoute(
  app: Application,
  method: 'get' | 'post',
  routePath: string,
  handler: (req: Request) => unknown,
): void {
  app[method](routePath, (req, res) => {
    try {
      const result = handler(req);
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });
}

export function registerRuntimeRoutes(app: Application, config: RuntimeControlConfig = {}): void {
  const commandsModulePath = resolveCommandsModulePath(config.commandsModulePath);
  let commands: InstallerWebappCommands | null = null;
  let loadError: string | null = null;

  const loadCommands = (): InstallerWebappCommands => {
    if (commands) {
      return commands;
    }

    try {
      const module = require(commandsModulePath) as CommandsModule;
      if (typeof module.createInstallerWebappCommands !== 'function') {
        throw new Error('Missing createInstallerWebappCommands export');
      }
      commands = module.createInstallerWebappCommands();
      loadError = null;
      return commands;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loadError = message;
      throw new HttpError(503, `Runtime bridge unavailable: ${message}`);
    }
  };

  app.use('/api/v1/runtime', controlAuthMiddleware(config.controlApiKey));

  registerRuntimeRoute(app, 'get', '/api/v1/runtime/healthz', () => {
    try {
      loadCommands();
      return {
        status: 'ok',
        bridge_ready: true,
        commands_module_path: commandsModulePath,
      };
    } catch (error) {
      return {
        status: 'degraded',
        bridge_ready: false,
        commands_module_path: commandsModulePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  registerRuntimeRoute(app, 'get', '/api/v1/runtime/compute/options', () => {
    return loadCommands().getComputeOptions();
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/compute/global-provider', (req) => {
    const payload = parseJsonBody(providerSchema, req.body);
    return loadCommands().setGlobalComputeProvider(payload.provider_id);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/compute/priority', (req) => {
    const payload = parseJsonBody(cloudPrioritySchema, req.body);
    return loadCommands().setProviderPriority(payload.cloud_provider_priority);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/providers/:providerId/config', (req) => {
    const payload = parseJsonBody(providerConfigSchema, req.body);
    return loadCommands().updateProviderConfig(req.params.providerId, payload.config);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/genesis/invoke', (req) => {
    const payload = parseJsonBody(nonNullRecordSchema, req.body);
    return loadCommands().invokeGenesisRite(payload);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/actions/validate', (req) => {
    const payload = parseJsonBody(validateActionSchema, req.body);
    return {
      valid: loadCommands().validateAction(payload.action, payload.will_vector),
    };
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/sub-spheres', (req) => {
    const payload = parseJsonBody(subSphereCreateSchema, req.body);
    return loadCommands().createTaskSubSphere({
      ...payload,
      hitl_required: payload.hitl_required ?? false,
    });
  });

  registerRuntimeRoute(app, 'get', '/api/v1/runtime/sub-spheres', () => {
    return loadCommands().getSubSphereList();
  });

  registerRuntimeRoute(app, 'get', '/api/v1/runtime/sub-spheres/:subSphereId', (req) => {
    return loadCommands().getSubSphereStatus(req.params.subSphereId);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/sub-spheres/:subSphereId/pause', (req) => {
    return loadCommands().pauseSubSphere(req.params.subSphereId);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/sub-spheres/:subSphereId/dissolve', (req) => {
    const payload = parseJsonBody(subSphereDissolveSchema, req.body);
    return loadCommands().dissolveSubSphere(req.params.subSphereId, payload.reason);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/sub-spheres/:subSphereId/query', (req) => {
    const payload = parseJsonBody(subSphereQuerySchema, req.body);
    return loadCommands().submitSubSphereQuery(
      req.params.subSphereId,
      payload.query,
      payload.provider_override ?? null,
    );
  });

  registerRuntimeRoute(app, 'get', '/api/v1/runtime/communications/status', () => {
    return loadCommands().getCommunicationStatus();
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/communications/telegram', (req) => {
    const payload = parseJsonBody(nonNullRecordSchema, req.body);
    return loadCommands().updateTelegramIntegration(payload);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/communications/discord', (req) => {
    const payload = parseJsonBody(nonNullRecordSchema, req.body);
    return loadCommands().updateDiscordIntegration(payload);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/communications/agents/bind', (req) => {
    const payload = parseJsonBody(agentBindingSchema, req.body);
    return loadCommands().bindAgentCommunicationRoute(payload);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/communications/sub-spheres/prism/bind', (req) => {
    const payload = parseJsonBody(prismBindingSchema, req.body);
    return loadCommands().bindSubSpherePrismRoute(payload);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/communications/agents/message', (req) => {
    const payload = parseJsonBody(agentMessageSchema, req.body);
    return loadCommands().sendAgentMessage(payload);
  });

  registerRuntimeRoute(app, 'post', '/api/v1/runtime/communications/sub-spheres/message', (req) => {
    const payload = parseJsonBody(prismMessageSchema, req.body);
    return loadCommands().sendSubSpherePrismMessage(payload);
  });

  app.get('/api/v1/runtime/bridge/state', (_req, res) => {
    res.json({
      commands_module_path: commandsModulePath,
      loaded: Boolean(commands),
      load_error: loadError,
    });
  });
}
