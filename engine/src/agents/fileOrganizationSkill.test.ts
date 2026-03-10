import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAgentConfig } from './agentConfig.js';
import { createFileOrganizationSkill, removeDirectoryTree } from './fileOrganizationSkill.js';

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createSkillConfig(overrides: Record<string, unknown> = {}) {
  return createAgentConfig({
    agentId: 'agent-alpha',
    skillId: 'skill-file-organization',
    skillKind: 'file_organization',
    ...overrides
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => removeDirectoryTree(dir)));
});

describe('fileOrganizationSkill', () => {
  it('blocks execution when target path is outside allowed roots', async () => {
    const rootA = await createTempDir('file-org-root-a-');
    const rootB = await createTempDir('file-org-root-b-');

    const skill = createFileOrganizationSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      targetDirectory: rootB,
      allowedRoots: [rootA],
      dryRun: true
    });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('PATH_NOT_ALLOWED');
    }
  });

  it('uses max depth of 10 and skips symlink traversal', async () => {
    const root = await createTempDir('file-org-depth-');
    const nestedPath = path.join(
      root,
      'd1',
      'd2',
      'd3',
      'd4',
      'd5',
      'd6',
      'd7',
      'd8',
      'd9',
      'd10',
      'd11'
    );
    await mkdir(nestedPath, { recursive: true });
    await writeFile(path.join(root, 'top-level.txt'), 'top');
    await writeFile(path.join(nestedPath, 'deep.txt'), 'deep');
    await symlink(path.join(root, 'top-level.txt'), path.join(root, 'link-to-top.txt'));

    const skill = createFileOrganizationSkill({
      config: createSkillConfig()
    });

    const result = await skill.execute({
      targetDirectory: root,
      allowedRoots: [root],
      maxDepth: 100,
      dryRun: true
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.maxDepth).toBe(10);
      expect(result.output.skippedSymlinks).toBe(1);
      expect(result.output.scannedFiles).toBe(1);
    }
  });

  it('returns move plan in dry-run mode without changing files', async () => {
    const root = await createTempDir('file-org-dry-run-');
    const sourcePath = path.join(root, 'photo.jpg');
    await writeFile(sourcePath, 'image');

    const skill = createFileOrganizationSkill({
      config: createSkillConfig()
    });
    const result = await skill.execute({
      targetDirectory: root,
      allowedRoots: [root],
      dryRun: true
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.dryRun).toBe(true);
      expect(result.output.plannedMoves.length).toBe(1);
      expect(result.output.movedFiles).toBe(0);
    }
    await expect(readFile(sourcePath, 'utf8')).resolves.toBe('image');
  });

  it('moves files when dry-run is disabled', async () => {
    const root = await createTempDir('file-org-live-run-');
    const sourcePath = path.join(root, 'notes.txt');
    await writeFile(sourcePath, 'hello');

    const skill = createFileOrganizationSkill({
      config: createSkillConfig()
    });
    const result = await skill.execute({
      targetDirectory: root,
      allowedRoots: [root],
      dryRun: false
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.movedFiles).toBe(1);
      expect(result.output.plannedMoves[0]?.destinationPath).toBe(
        path.join(root, 'documents', 'text', 'notes.txt')
      );
    }
    await expect(readFile(path.join(root, 'documents', 'text', 'notes.txt'), 'utf8')).resolves.toBe(
      'hello'
    );
  });

  it('blocks execution when config requires human approval', async () => {
    const root = await createTempDir('file-org-human-approval-');
    await writeFile(path.join(root, 'notes.txt'), 'hello');
    const skill = createFileOrganizationSkill({
      config: createSkillConfig({
        security: {
          requireHumanApproval: true
        }
      })
    });

    const result = await skill.execute({
      targetDirectory: root,
      allowedRoots: [root],
      dryRun: false
    });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.code).toBe('HUMAN_APPROVAL_REQUIRED');
    }
    await expect(readFile(path.join(root, 'notes.txt'), 'utf8')).resolves.toBe('hello');
  });
});
