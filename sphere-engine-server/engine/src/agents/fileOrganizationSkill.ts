import { copyFile, mkdir, readdir, rename, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { type AgentConfig } from './agentConfig.js';
import {
  createBaseExecutor,
  type AgentBoundaryErrorEvent,
  type AgentExecutionAuditEvent,
  type AgentExecutionResult
} from './baseExecutor.js';

const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_INTENT = 'skill.file_organization.run';

export type FileOrganizationRule = {
  name?: string;
  matchExtensions: string[];
  destinationSubdir: string;
};

export type FileOrganizationInput = {
  targetDirectory: string;
  allowedRoots: string[];
  dryRun?: boolean;
  maxDepth?: number;
  rules?: FileOrganizationRule[];
};

export type FileMovePlan = {
  sourcePath: string;
  destinationPath: string;
  category: string;
};

export type FileOrganizationOutput = {
  targetDirectory: string;
  dryRun: boolean;
  maxDepth: number;
  scannedDirectories: number;
  scannedFiles: number;
  skippedSymlinks: number;
  plannedMoves: FileMovePlan[];
  movedFiles: number;
};

export class FileOrganizationSkillError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_EXTENSION_MAP: Record<string, string> = {
  txt: 'documents/text',
  md: 'documents/markdown',
  pdf: 'documents/pdf',
  doc: 'documents/word',
  docx: 'documents/word',
  csv: 'documents/spreadsheets',
  xls: 'documents/spreadsheets',
  xlsx: 'documents/spreadsheets',
  jpg: 'media/images',
  jpeg: 'media/images',
  png: 'media/images',
  gif: 'media/images',
  webp: 'media/images',
  heic: 'media/images',
  mp3: 'media/audio',
  wav: 'media/audio',
  m4a: 'media/audio',
  flac: 'media/audio',
  mp4: 'media/video',
  mov: 'media/video',
  mkv: 'media/video',
  zip: 'archives',
  tar: 'archives',
  gz: 'archives'
};

function normalizeExtension(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\./, '');
}

function normalizeDestinationSubdir(raw: string): string {
  const normalized = raw.replace(/\\/g, '/').trim().replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) {
    throw new FileOrganizationSkillError(
      'INVALID_DESTINATION_SUBDIR',
      `Destination subdir "${raw}" is not allowed.`
    );
  }
  return normalized;
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedRoot = path.resolve(rootPath);
  return (
    resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

function resolveAllowedRoot(targetDirectory: string, allowedRoots: string[]): string {
  const resolvedTarget = path.resolve(targetDirectory);
  const resolvedRoots = allowedRoots.map((root) => path.resolve(root));
  const match = resolvedRoots.find((root) => isWithinRoot(resolvedTarget, root));
  if (!match) {
    throw new FileOrganizationSkillError(
      'PATH_NOT_ALLOWED',
      `Target directory "${targetDirectory}" is outside allowed roots.`
    );
  }
  return resolvedTarget;
}

function resolveRuleDestination(
  filePath: string,
  targetRoot: string,
  rules: FileOrganizationRule[]
): FileMovePlan | null {
  const extension = normalizeExtension(path.extname(filePath));

  let destinationSubdir: string | undefined;
  let category = 'default';
  for (const rule of rules) {
    const extensions = rule.matchExtensions.map(normalizeExtension).filter(Boolean);
    if (extensions.includes(extension)) {
      destinationSubdir = normalizeDestinationSubdir(rule.destinationSubdir);
      category = rule.name?.trim() || destinationSubdir;
      break;
    }
  }

  if (!destinationSubdir) {
    const fallbackSubdir = DEFAULT_EXTENSION_MAP[extension] ?? 'miscellaneous';
    destinationSubdir = normalizeDestinationSubdir(fallbackSubdir);
    category = DEFAULT_EXTENSION_MAP[extension] ? `default:${extension}` : 'default:uncategorized';
  }

  const destinationPath = path.resolve(targetRoot, destinationSubdir, path.basename(filePath));
  if (!isWithinRoot(destinationPath, targetRoot)) {
    throw new FileOrganizationSkillError('DESTINATION_OUTSIDE_SCOPE', 'Resolved destination path escaped target root.', {
      filePath,
      destinationPath,
      targetRoot
    });
  }

  if (path.resolve(filePath) === destinationPath) {
    return null;
  }

  return {
    sourcePath: path.resolve(filePath),
    destinationPath,
    category
  };
}

async function safeMoveFile(sourcePath: string, destinationPath: string): Promise<void> {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    const code =
      typeof error === 'object' && error != null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
    if (code !== 'EXDEV') {
      throw error;
    }
    await copyFile(sourcePath, destinationPath);
    await unlink(sourcePath);
  }
}

export function createFileOrganizationSkill(params: {
  config: AgentConfig;
  auditLog?: (event: AgentExecutionAuditEvent) => Promise<void> | void;
  onBoundaryError?: (event: AgentBoundaryErrorEvent) => Promise<void> | void;
}): {
  execute: (
    input: FileOrganizationInput,
    context?: { traceId?: string; metadata?: Record<string, unknown> }
  ) => Promise<AgentExecutionResult<FileOrganizationOutput>>;
} {
  const executor = createBaseExecutor<FileOrganizationInput, FileOrganizationOutput>({
    validate: async ({ input }) => {
      if (!input.targetDirectory?.trim()) {
        return {
          allowed: false,
          code: 'INVALID_TARGET_DIRECTORY',
          message: 'targetDirectory is required.'
        };
      }
      if (!Array.isArray(input.allowedRoots) || input.allowedRoots.length === 0) {
        return {
          allowed: false,
          code: 'INVALID_ALLOWED_ROOTS',
          message: 'At least one allowed root is required.'
        };
      }

      try {
        const resolvedTarget = resolveAllowedRoot(input.targetDirectory, input.allowedRoots);
        const dirStat = await stat(resolvedTarget);
        if (!dirStat.isDirectory()) {
          return {
            allowed: false,
            code: 'INVALID_TARGET_DIRECTORY',
            message: 'targetDirectory must be a directory.'
          };
        }
      } catch (error) {
        if (error instanceof FileOrganizationSkillError) {
          return {
            allowed: false,
            code: error.code,
            message: error.message
          };
        }
        return {
          allowed: false,
          code: 'TARGET_VALIDATION_FAILED',
          message: 'Unable to validate target directory.'
        };
      }

      return { allowed: true };
    },
    execute: async ({ input }) => {
      const targetDirectory = resolveAllowedRoot(input.targetDirectory, input.allowedRoots);
      const dryRun = input.dryRun ?? true;
      const maxDepth = Math.min(Math.max(input.maxDepth ?? DEFAULT_MAX_DEPTH, 1), DEFAULT_MAX_DEPTH);
      const rules = input.rules ?? [];

      const result: FileOrganizationOutput = {
        targetDirectory,
        dryRun,
        maxDepth,
        scannedDirectories: 0,
        scannedFiles: 0,
        skippedSymlinks: 0,
        plannedMoves: [],
        movedFiles: 0
      };

      const walk = async (currentDir: string, depth: number): Promise<void> => {
        if (depth > maxDepth) {
          return;
        }

        const entries = await readdir(currentDir, { withFileTypes: true });
        result.scannedDirectories += 1;

        for (const entry of entries) {
          const entryPath = path.join(currentDir, entry.name);
          if (entry.isSymbolicLink()) {
            result.skippedSymlinks += 1;
            continue;
          }

          if (entry.isDirectory()) {
            await walk(entryPath, depth + 1);
            continue;
          }

          if (!entry.isFile()) {
            continue;
          }

          result.scannedFiles += 1;
          const movePlan = resolveRuleDestination(entryPath, targetDirectory, rules);
          if (!movePlan) {
            continue;
          }
          result.plannedMoves.push(movePlan);
        }
      };

      await walk(targetDirectory, 0);

      if (!dryRun) {
        for (const plan of result.plannedMoves) {
          await safeMoveFile(plan.sourcePath, plan.destinationPath);
          result.movedFiles += 1;
        }
      }

      return result;
    },
    auditLog: params.auditLog,
    onBoundaryError: params.onBoundaryError
  });

  return {
    execute: async (input, context) =>
      executor.execute({
        config: params.config,
        intent: DEFAULT_INTENT,
        input,
        traceId: context?.traceId,
        metadata: context?.metadata
      })
  };
}

export async function removeDirectoryTree(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}
