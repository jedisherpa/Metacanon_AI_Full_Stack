import { describe, expect, it } from 'vitest';

import {
  AGENT_CONFIG_VERSION,
  createAgentConfig,
  mergeAgentConfig
} from './agentConfig.js';

describe('agentConfig', () => {
  it('creates a versioned config with safe defaults', () => {
    const config = createAgentConfig({
      agentId: 'agent-alpha',
      skillId: 'skill-file-org',
      skillKind: 'file_organization'
    });

    expect(config.version).toBe(AGENT_CONFIG_VERSION);
    expect(config.enabled).toBe(true);
    expect(config.metadata).toEqual({});
    expect(config.extensions).toEqual({});
  });

  it('merges nested policies and extension fields without breaking version', () => {
    const base = createAgentConfig({
      agentId: 'agent-alpha',
      skillId: 'skill-code',
      skillKind: 'code_writing',
      compute: {
        preferredProvider: 'qwen_local',
        maxRetries: 1
      },
      metadata: {
        team: 'core'
      },
      extensions: {
        profile: 'baseline'
      }
    });

    const merged = mergeAgentConfig(base, {
      displayName: 'Code Writer',
      compute: {
        allowFallback: false
      },
      security: {
        requireHumanApproval: true
      },
      metadata: {
        owner: 'sovereign'
      },
      extensions: {
        profile: 'strict',
        retryPolicy: 'manual'
      }
    });

    expect(merged.version).toBe(AGENT_CONFIG_VERSION);
    expect(merged.displayName).toBe('Code Writer');
    expect(merged.compute?.preferredProvider).toBe('qwen_local');
    expect(merged.compute?.allowFallback).toBe(false);
    expect(merged.compute?.maxRetries).toBe(1);
    expect(merged.security?.requireHumanApproval).toBe(true);
    expect(merged.metadata).toEqual({
      team: 'core',
      owner: 'sovereign'
    });
    expect(merged.extensions).toEqual({
      profile: 'strict',
      retryPolicy: 'manual'
    });
  });

  it('rejects invalid policy values through schema validation', () => {
    const base = createAgentConfig({
      agentId: 'agent-alpha',
      skillId: 'skill-email',
      skillKind: 'email_checking'
    });

    expect(() =>
      mergeAgentConfig(base, {
        compute: {
          maxRetries: 99
        }
      })
    ).toThrowError();
  });
});
