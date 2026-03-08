import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const outputDir = path.join(repoRoot, 'sphere-engine-server', 'governance', 'contact_lenses');
const signerPath = process.env.SPHERE_RUNTIME_SIGNER_PATH || path.join(os.homedir(), '.metacanon_ai', 'runtime_signers.json');

const rolePolicies = {
  prism: {
    permittedActivities: [
      'USER_MESSAGE_RECEIVED',
      'PRISM_MESSAGE_ACCEPTED',
      'PRISM_RESPONSE_READY',
      'TASK_STARTED',
      'TASK_COMPLETED',
      'TASK_FAILED'
    ],
    humanInTheLoopRequirements: [],
    scope: 'Runtime Prism orchestration and task signaling for local development.'
  },
  torus: {
    permittedActivities: ['TORUS_ROUND_OPENED', 'ROUND_CONVERGED'],
    humanInTheLoopRequirements: [],
    scope: 'Runtime Torus round coordination for local development.'
  },
  watcher: {
    permittedActivities: ['LANE_REQUESTED', 'LANE_RESPONSE_RECORDED'],
    humanInTheLoopRequirements: [],
    scope: 'Runtime Watcher lane signaling for local development.'
  },
  synthesis: {
    permittedActivities: ['LANE_REQUESTED', 'LANE_RESPONSE_RECORDED'],
    humanInTheLoopRequirements: [],
    scope: 'Runtime Synthesis lane signaling for local development.'
  },
  auditor: {
    permittedActivities: ['LANE_REQUESTED', 'LANE_RESPONSE_RECORDED'],
    humanInTheLoopRequirements: [],
    scope: 'Runtime Auditor lane signaling for local development.'
  }
};

const prohibitedActions = [
  'BYPASS_CONSTITUTIONAL_GUARDRAILS',
  'EXECUTE_HIGH_RISK_ACTIONS_WITHOUT_REQUIRED_APPROVAL',
  'MUTATE_RUNTIME_POLICY_WITHOUT_AUDIT'
];

async function main() {
  try {
    const raw = await fs.readFile(signerPath, 'utf8');
    const parsed = JSON.parse(raw);
    const signers = parsed?.signers;

    if (!signers || typeof signers !== 'object') {
      throw new Error('runtime signer bundle is missing a signers object');
    }

    await fs.mkdir(outputDir, { recursive: true });

    const existing = await fs.readdir(outputDir);
    await Promise.all(
      existing
        .filter((name) => /^runtime-[a-z]+\.json$/.test(name))
        .map((name) => fs.rm(path.join(outputDir, name), { force: true }))
    );

    const writes = [];
    for (const [role, policy] of Object.entries(rolePolicies)) {
      const signer = signers[role];
      if (!signer?.did || typeof signer.did !== 'string') {
        console.warn(`[runtime-contact-lenses] skipping ${role}: no signer DID in ${signerPath}`);
        continue;
      }

      const lens = {
        did: signer.did,
        scope: policy.scope,
        permittedActivities: policy.permittedActivities,
        prohibitedActions,
        humanInTheLoopRequirements: policy.humanInTheLoopRequirements,
        interpretiveBoundaries:
          'Allow only runtime orchestration events for the assigned role. Preserve auditability, least privilege, and explicit approval for high-risk task execution.'
      };

      writes.push(
        fs.writeFile(
          path.join(outputDir, `runtime-${role}.json`),
          `${JSON.stringify(lens, null, 2)}\n`,
          'utf8'
        )
      );
    }

    await Promise.all(writes);
    console.log(`[runtime-contact-lenses] synced runtime signer contact lenses from ${signerPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[runtime-contact-lenses] skipped: ${message}`);
  }
}

await main();
