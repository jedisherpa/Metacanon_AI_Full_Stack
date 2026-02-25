import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGovernanceConfig } from './governanceConfig.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function writeGovernanceFile(contents: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'governance-config-'));
  tempDirs.push(dir);

  const file = path.join(dir, 'governance.yaml');
  await writeFile(file, contents, 'utf8');
  return file;
}

describe('loadGovernanceConfig', () => {
  it('loads material-impact intents and quorum count', async () => {
    const configPath = await writeGovernanceFile(`
material_impact_intents:
  - "FORCE_EVICT"
  - "AMEND_CONSTITUTION"

quorum_rules:
  - name: "default_quorum"
    type: "fixed_count"
    value: 3
`);

    const config = await loadGovernanceConfig({ configPath });

    expect(config.materialImpactIntents.has('FORCE_EVICT')).toBe(true);
    expect(config.materialImpactIntents.has('AMEND_CONSTITUTION')).toBe(true);
    expect(config.quorumCount).toBe(3);
  });

  it('throws when quorum is missing', async () => {
    const configPath = await writeGovernanceFile(`
material_impact_intents:
  - "FORCE_EVICT"
`);

    await expect(loadGovernanceConfig({ configPath })).rejects.toThrow(
      'governance.yaml must define quorum_rules value.'
    );
  });
});
