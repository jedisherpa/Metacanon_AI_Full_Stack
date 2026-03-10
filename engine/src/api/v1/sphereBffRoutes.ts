import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { telegramAuthMiddleware } from '../../middleware/telegramAuth.js';
import {
  ThreadAccessError,
  type ThreadAccessRegistry
} from '../../sphere/threadAccessRegistry.js';
import { sendSphereError } from './sphereApi.js';

const BFF_SPHERE_BASE = '/api/v1/bff/sphere';
const CANONICAL_SPHERE_BASE = '/api/v1/sphere';
const AGENT_API_KEY_HEADER = 'x-agent-api-key';
const AGENT_PRINCIPAL_HEADER = 'x-sphere-agent-principal';
const CYCLE_INVITE_PREFIX = 'cycle_invite_';

const inviteCreateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  purpose: z.string().trim().min(1).max(500).optional(),
  maxUses: z.coerce.number().int().min(1).max(1000).optional(),
  expiresInMinutes: z.coerce.number().int().min(1).max(60 * 24 * 30).optional()
});

const memberListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});

const inviteListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  includeRevoked: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
});

const inviteRevokeSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional()
});

declare global {
  namespace Express {
    interface Request {
      sphereAgentPrincipal?: string;
    }
  }
}

function forwardPath(url: string): string {
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return `${CANONICAL_SPHERE_BASE}${normalized}`;
}

function isWriteMethod(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS';
}

function parseAgentApiKeyEntries(raw: string): Array<{ principal: string; token: string }> {
  const entries = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const parsed: Array<{ principal: string; token: string }> = [];

  entries.forEach((entry, index) => {
    const equalIndex = entry.indexOf('=');
    if (equalIndex > 0 && equalIndex < entry.length - 1) {
      const principal = entry.slice(0, equalIndex).trim();
      const token = entry.slice(equalIndex + 1).trim();
      if (principal && token) {
        parsed.push({ principal, token });
      }
      return;
    }

    parsed.push({
      principal: `agent_${index + 1}`,
      token: entry
    });
  });

  return parsed;
}

const configuredAgentApiKeys = parseAgentApiKeyEntries(env.SPHERE_BFF_AGENT_API_KEYS);

function tokensMatch(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(actual, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, actualBuf);
}

function resolveAgentPrincipalByToken(token: string): string | null {
  for (const entry of configuredAgentApiKeys) {
    if (tokensMatch(entry.token, token)) {
      return entry.principal;
    }
  }

  return null;
}

function sendThreadAccessError(req: Request, res: Response, error: unknown): Response {
  if (error instanceof ThreadAccessError) {
    return sendSphereError(req, res, error.status, {
      code: error.code,
      message: error.message,
      retryable: false,
      details: error.details
    });
  }

  return sendSphereError(req, res, 500, {
    code: 'BFF_ERR_INTERNAL',
    message: error instanceof Error ? error.message : 'Unexpected thread access error.',
    retryable: true
  });
}

function applyAgentPrincipal(req: Request, res: Response, principal: string): void {
  req.sphereAgentPrincipal = principal;
  res.setHeader(AGENT_PRINCIPAL_HEADER, principal);
}

function resolveAgentPrincipalFromRequest(
  req: Request,
  res: Response,
  options: {
    required: boolean;
  }
): string | null {
  const rawAgentApiKey = req.header(AGENT_API_KEY_HEADER)?.trim();

  if (configuredAgentApiKeys.length === 0) {
    if (options.required || rawAgentApiKey) {
      sendSphereError(req, res, 500, {
        code: 'BFF_ERR_AGENT_API_KEY_CONFIG_MISSING',
        message:
          'Sphere BFF API-key validation was requested but no agent API keys are configured.',
        retryable: false
      });
      return null;
    }
    return null;
  }

  if (!rawAgentApiKey) {
    if (options.required) {
      sendSphereError(req, res, 401, {
        code: 'BFF_ERR_AGENT_API_KEY_REQUIRED',
        message: 'Agent API key is required for this request.',
        retryable: false
      });
      return null;
    }
    return null;
  }

  const principal = resolveAgentPrincipalByToken(rawAgentApiKey);
  if (!principal) {
    sendSphereError(req, res, 401, {
      code: 'BFF_ERR_AGENT_API_KEY_INVALID',
      message: 'Agent API key is invalid.',
      retryable: false
    });
    return null;
  }

  applyAgentPrincipal(req, res, principal);
  return principal;
}

function parseThreadIdFromPath(path: string): string | null {
  const match = /^\/threads\/([^/]+)\/ack$/.exec(path);
  if (!match) {
    return null;
  }

  return decodeURIComponent(match[1]);
}

function readThreadIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const value = (body as Record<string, unknown>).threadId;
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveThreadWriteTarget(req: Request): string | null {
  const path = req.path;
  if (path === '/cycle-events' || path === '/messages' || path === '/missions') {
    return readThreadIdFromBody(req.body);
  }

  return parseThreadIdFromPath(path);
}

export function createSphereBffRoutes(options: {
  sphereRoutes: RequestHandler;
  threadAccessRegistry: ThreadAccessRegistry;
}): Router {
  const router = Router();

  router.post(`${BFF_SPHERE_BASE}/threads/:threadId/invites`, telegramAuthMiddleware, async (req, res) => {
    const principal = resolveAgentPrincipalFromRequest(req, res, { required: true });
    if (!principal) {
      return;
    }

    const parsedBody = inviteCreateSchema.safeParse(req.body ?? {});

    if (!parsedBody.success) {
      sendSphereError(req, res, 400, {
        code: 'BFF_ERR_INVALID_SCHEMA',
        message: 'Invalid invite request payload.',
        retryable: false,
        details: parsedBody.error.flatten()
      });
      return;
    }

    try {
      const invite = await options.threadAccessRegistry.createInvite({
        threadId: req.params.threadId,
        principal,
        label: parsedBody.data.label,
        purpose: parsedBody.data.purpose,
        maxUses: parsedBody.data.maxUses,
        expiresInMinutes: parsedBody.data.expiresInMinutes
      });

      return res.status(201).json({
        invite,
        startParam: `${CYCLE_INVITE_PREFIX}${invite.inviteCode}`
      });
    } catch (error) {
      return sendThreadAccessError(req, res, error);
    }
  });

  router.get(`${BFF_SPHERE_BASE}/threads/:threadId/invites`, telegramAuthMiddleware, async (req, res) => {
    const principal = resolveAgentPrincipalFromRequest(req, res, { required: true });
    if (!principal) {
      return;
    }

    const parsedQuery = inviteListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      sendSphereError(req, res, 400, {
        code: 'BFF_ERR_INVALID_SCHEMA',
        message: 'Invalid invite query.',
        retryable: false,
        details: parsedQuery.error.flatten()
      });
      return;
    }

    try {
      const access = await options.threadAccessRegistry.checkWriteAccess({
        threadId: req.params.threadId,
        principal
      });
      if (!access.allowed || access.bootstrap) {
        return sendSphereError(req, res, 403, {
          code: 'BFF_ERR_THREAD_ACCESS_DENIED',
          message: 'Principal is not a member of this thread.',
          retryable: false,
          details: {
            threadId: req.params.threadId,
            principal
          }
        });
      }

      const invites = await options.threadAccessRegistry.listInvites(req.params.threadId, {
        limit: parsedQuery.data.limit,
        includeRevoked: parsedQuery.data.includeRevoked
      });
      const actorMembership = await options.threadAccessRegistry.getMembership(
        req.params.threadId,
        principal
      );

      return res.json({
        threadId: req.params.threadId,
        requestPrincipal: principal,
        requestRole: actorMembership?.role ?? null,
        invites,
        count: invites.length
      });
    } catch (error) {
      return sendThreadAccessError(req, res, error);
    }
  });

  router.post(
    `${BFF_SPHERE_BASE}/threads/:threadId/invites/:inviteCode/revoke`,
    telegramAuthMiddleware,
    async (req, res) => {
      const principal = resolveAgentPrincipalFromRequest(req, res, { required: true });
      if (!principal) {
        return;
      }

      const parsedBody = inviteRevokeSchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        sendSphereError(req, res, 400, {
          code: 'BFF_ERR_INVALID_SCHEMA',
          message: 'Invalid invite revoke payload.',
          retryable: false,
          details: parsedBody.error.flatten()
        });
        return;
      }

      try {
        const invite = await options.threadAccessRegistry.revokeInvite({
          inviteCode: req.params.inviteCode,
          principal,
          ...(parsedBody.data.reason ? { reason: parsedBody.data.reason } : {})
        });

        if (invite.threadId !== req.params.threadId) {
          return sendSphereError(req, res, 404, {
            code: 'BFF_ERR_INVITE_NOT_FOUND',
            message: 'Invite code not found for this thread.',
            retryable: false
          });
        }

        return res.json({
          invite
        });
      } catch (error) {
        return sendThreadAccessError(req, res, error);
      }
    }
  );

  router.post(`${BFF_SPHERE_BASE}/invites/:inviteCode/accept`, telegramAuthMiddleware, async (req, res) => {
    const principal = resolveAgentPrincipalFromRequest(req, res, { required: true });
    if (!principal) {
      return;
    }

    try {
      const acceptance = await options.threadAccessRegistry.acceptInvite({
        inviteCode: req.params.inviteCode,
        principal
      });

      return res.status(201).json({
        acceptance
      });
    } catch (error) {
      return sendThreadAccessError(req, res, error);
    }
  });

  router.delete(
    `${BFF_SPHERE_BASE}/threads/:threadId/members/:memberPrincipal`,
    telegramAuthMiddleware,
    async (req, res) => {
      const principal = resolveAgentPrincipalFromRequest(req, res, { required: true });
      if (!principal) {
        return;
      }

      const memberPrincipal = req.params.memberPrincipal?.trim();
      if (!memberPrincipal) {
        sendSphereError(req, res, 400, {
          code: 'BFF_ERR_INVALID_SCHEMA',
          message: 'Invalid member principal.',
          retryable: false
        });
        return;
      }

      try {
        const removal = await options.threadAccessRegistry.removeMember({
          threadId: req.params.threadId,
          actorPrincipal: principal,
          memberPrincipal
        });

        return res.json({
          removal
        });
      } catch (error) {
        return sendThreadAccessError(req, res, error);
      }
    }
  );

  router.get(`${BFF_SPHERE_BASE}/threads/:threadId/members`, telegramAuthMiddleware, async (req, res) => {
    const principal = resolveAgentPrincipalFromRequest(req, res, { required: true });
    if (!principal) {
      return;
    }

    const parsedQuery = memberListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      sendSphereError(req, res, 400, {
        code: 'BFF_ERR_INVALID_SCHEMA',
        message: 'Invalid members query.',
        retryable: false,
        details: parsedQuery.error.flatten()
      });
      return;
    }

    try {
      const access = await options.threadAccessRegistry.checkWriteAccess({
        threadId: req.params.threadId,
        principal
      });
      if (!access.allowed || access.bootstrap) {
        return sendSphereError(req, res, 403, {
          code: 'BFF_ERR_THREAD_ACCESS_DENIED',
          message: 'Principal is not a member of this thread.',
          retryable: false,
          details: {
            threadId: req.params.threadId,
            principal
          }
        });
      }

      const members = await options.threadAccessRegistry.listMembers(
        req.params.threadId,
        parsedQuery.data.limit
      );
      const actorMembership = await options.threadAccessRegistry.getMembership(
        req.params.threadId,
        principal
      );

      return res.json({
        threadId: req.params.threadId,
        principal,
        requestPrincipal: principal,
        requestRole: actorMembership?.role ?? null,
        members,
        count: members.length
      });
    } catch (error) {
      return sendThreadAccessError(req, res, error);
    }
  });

  router.use(BFF_SPHERE_BASE, telegramAuthMiddleware, async (req, res, next) => {
    try {
      const requiresAgentApiKey =
        env.SPHERE_BFF_REQUIRE_AGENT_API_KEY_WRITES && isWriteMethod(req.method);
      const principal = resolveAgentPrincipalFromRequest(req, res, {
        required: requiresAgentApiKey
      });
      if (res.headersSent) {
        return;
      }

      const threadWriteTarget = isWriteMethod(req.method) ? resolveThreadWriteTarget(req) : null;
      let bootstrapMembership = false;

      if (threadWriteTarget && principal) {
        const access = await options.threadAccessRegistry.checkWriteAccess({
          threadId: threadWriteTarget,
          principal
        });
        if (!access.allowed) {
          sendSphereError(req, res, 403, {
            code: 'BFF_ERR_THREAD_ACCESS_DENIED',
            message: 'Principal is not a member of this thread.',
            retryable: false,
            details: {
              threadId: threadWriteTarget,
              principal
            }
          });
          return;
        }

        bootstrapMembership = access.bootstrap;
      }

      if (threadWriteTarget && principal && bootstrapMembership) {
        res.once('finish', () => {
          if (res.statusCode < 200 || res.statusCode >= 400) {
            return;
          }

          void options.threadAccessRegistry.grantMembership({
            threadId: threadWriteTarget,
            principal,
            role: 'owner'
          });
        });
      }

      const originalUrl = req.url;
      const originalAuthorization = req.headers.authorization;
      const originalServiceToken = req.headers['x-sphere-service-token'];
      const originalAgentApiKey = req.headers[AGENT_API_KEY_HEADER];
      const originalAgentPrincipalHeader = req.headers[AGENT_PRINCIPAL_HEADER];
      const originalAgentPrincipal = req.sphereAgentPrincipal;

      req.url = forwardPath(req.url);
      req.headers.authorization = `Bearer ${env.SPHERE_BFF_SERVICE_TOKEN}`;
      delete req.headers['x-sphere-service-token'];
      delete req.headers[AGENT_API_KEY_HEADER];
      if (req.sphereAgentPrincipal) {
        req.headers[AGENT_PRINCIPAL_HEADER] = req.sphereAgentPrincipal;
      } else {
        delete req.headers[AGENT_PRINCIPAL_HEADER];
      }

      options.sphereRoutes(req, res, (err?: unknown) => {
        req.url = originalUrl;

        if (originalAuthorization === undefined) {
          delete req.headers.authorization;
        } else {
          req.headers.authorization = originalAuthorization;
        }

        if (originalServiceToken === undefined) {
          delete req.headers['x-sphere-service-token'];
        } else {
          req.headers['x-sphere-service-token'] = originalServiceToken;
        }

        if (originalAgentApiKey === undefined) {
          delete req.headers[AGENT_API_KEY_HEADER];
        } else {
          req.headers[AGENT_API_KEY_HEADER] = originalAgentApiKey;
        }

        if (originalAgentPrincipalHeader === undefined) {
          delete req.headers[AGENT_PRINCIPAL_HEADER];
        } else {
          req.headers[AGENT_PRINCIPAL_HEADER] = originalAgentPrincipalHeader;
        }

        if (originalAgentPrincipal === undefined) {
          delete req.sphereAgentPrincipal;
        } else {
          req.sphereAgentPrincipal = originalAgentPrincipal;
        }

        if (err) {
          next(err);
          return;
        }

        if (!res.headersSent) {
          next();
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
