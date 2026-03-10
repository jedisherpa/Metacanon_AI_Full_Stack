export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type CommandScope =
  | 'atlas'
  | 'citadel'
  | 'forge'
  | 'hub'
  | 'engine-room'
  | 'sphere'
  | 'runtime';

export type CommandTemplate = Record<string, unknown>;

export type CommandDefinition = {
  id: string;
  label: string;
  scope: CommandScope;
  method: ApiMethod;
  path: string;
  description: string;
  pathParams?: string[];
  queryTemplate?: CommandTemplate;
  bodyTemplate?: CommandTemplate;
};

const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

export const commandCatalog: CommandDefinition[] = [
  // Open Claw launcher + Atlas (2 endpoints)
  {
    id: 'open_claw',
    label: 'Open Claw',
    scope: 'atlas',
    method: 'GET',
    path: '/api/v1/atlas/state',
      description: 'Load the full Living Atlas bootstrap state for the Telegram app.'
  },
  {
    id: 'atlas_state',
    label: 'Get Atlas State',
    scope: 'atlas',
    method: 'GET',
    path: '/api/v1/atlas/state',
    description: 'Fetch the bootstrap state payload for current user.'
  },
  {
    id: 'atlas_update_profile',
    label: 'Update Active Lens',
    scope: 'atlas',
    method: 'PATCH',
    path: '/api/v1/atlas/profile',
    description: 'Update the authenticated user profile (active lens selection).',
    bodyTemplate: { activeLensId: '1' }
  },

  // Sphere Boundary (18)
  {
    id: 'sphere_capabilities',
    label: 'Sphere Capabilities',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/capabilities',
    description: 'Fetch Sphere boundary capabilities contract for feature gating.'
  },
  {
    id: 'sphere_status',
    label: 'Sphere Status',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/status',
    description: 'Fetch Sphere system and thread state metrics.'
  },
  {
    id: 'sphere_lens_upgrade_rules',
    label: 'Lens Upgrade Rules',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/lens-upgrade-rules',
    description: 'Fetch deterministic lens upgrade rule registry for rule-bound progression.'
  },
  {
    id: 'sphere_dids_list',
    label: 'List DIDs',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/dids',
    description: 'List registered DID identities for signature verification.',
    queryTemplate: { limit: 100 }
  },
  {
    id: 'sphere_did_get',
    label: 'Get DID',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/dids/:did',
    pathParams: ['did'],
    description: 'Fetch one DID identity by DID string.',
    queryTemplate: { did: 'did:key:zExampleDid' }
  },
  {
    id: 'sphere_thread_get',
    label: 'Get Thread',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/threads/:threadId',
    pathParams: ['threadId'],
    description: 'Fetch one Sphere thread ledger snapshot.',
    queryTemplate: { threadId: '11111111-1111-4111-8111-111111111111' }
  },
  {
    id: 'sphere_thread_lens_progression',
    label: 'Thread Lens Progression',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/threads/:threadId/lens-progression',
    pathParams: ['threadId'],
    description: 'Fetch deterministic lens progression state derived from thread ledger entries.',
    queryTemplate: { threadId: '11111111-1111-4111-8111-111111111111' }
  },
  {
    id: 'sphere_thread_replay',
    label: 'Replay Thread',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/threads/:threadId/replay',
    pathParams: ['threadId'],
    description: 'Replay thread log entries from a cursor.',
    queryTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      cursor: 0
    }
  },
  {
    id: 'sphere_thread_acks',
    label: 'Replay ACKs',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/threads/:threadId/acks',
    pathParams: ['threadId'],
    description: 'Replay ACK records for a thread.',
    queryTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      cursor: 0,
      limit: 100
    }
  },
  {
    id: 'sphere_cycle_event_write',
    label: 'Write Cycle Event',
    scope: 'sphere',
    method: 'POST',
    path: '/api/v1/sphere/cycle-events',
    description: 'Submit a signed cycle-event envelope (seat/perspective/synthesis/lens).',
    bodyTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      messageId: '22222222-2222-4222-8222-222222222222',
      traceId: '33333333-3333-4333-8333-333333333333',
      authorAgentId: 'did:key:zExampleDid',
      eventType: 'seat_taken',
      attestation: ['did:example:counselor-1'],
      schemaVersion: '3.0',
      protocolVersion: '3.0',
      causationId: [],
      agentSignature: 'compact-jws-signature',
      payload: {
        objective: 'Cycle objective',
        cycleId: 'cycle-001'
      }
    }
  },
  {
    id: 'sphere_message_write',
    label: 'Write Message',
    scope: 'sphere',
    method: 'POST',
    path: '/api/v1/sphere/messages',
    description: 'Submit a signed free-form message envelope for agent-to-agent communication.',
    bodyTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      messageId: '22222222-2222-4222-8222-222222222222',
      traceId: '33333333-3333-4333-8333-333333333333',
      authorAgentId: 'did:key:zExampleDid',
      intent: 'AGENT_MESSAGE',
      attestation: ['did:example:counselor-1'],
      schemaVersion: '3.0',
      protocolVersion: '3.0',
      causationId: [],
      agentSignature: 'compact-jws-signature',
      payload: {
        text: 'Hello from my agent'
      }
    }
  },
  {
    id: 'sphere_ack_write',
    label: 'Write ACK',
    scope: 'sphere',
    method: 'POST',
    path: '/api/v1/sphere/threads/:threadId/ack',
    pathParams: ['threadId'],
    description: 'Persist a signed ACK for a thread entry.',
    bodyTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      actorDid: 'did:key:zExampleDid',
      targetSequence: 1,
      targetMessageId: '22222222-2222-4222-8222-222222222222',
      ackMessageId: '44444444-4444-4444-8444-444444444444',
      traceId: '55555555-5555-4555-8555-555555555555',
      intent: 'ACK_ENTRY',
      schemaVersion: '3.0',
      attestation: ['did:example:counselor-1'],
      agentSignature: 'compact-jws-signature'
    }
  },
  {
    id: 'sphere_thread_members',
    label: 'List Thread Members',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/threads/:threadId/members',
    pathParams: ['threadId'],
    description: 'List membership principals for a thread.',
    queryTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      limit: 100
    }
  },
  {
    id: 'sphere_thread_invite_create',
    label: 'Create Thread Invite',
    scope: 'sphere',
    method: 'POST',
    path: '/api/v1/sphere/threads/:threadId/invites',
    pathParams: ['threadId'],
    description: 'Create an invite token for thread membership.',
    bodyTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      label: 'Launch cohort',
      purpose: 'Invite early testers',
      maxUses: 25,
      expiresInMinutes: 10080
    }
  },
  {
    id: 'sphere_thread_invite_accept',
    label: 'Accept Thread Invite',
    scope: 'sphere',
    method: 'POST',
    path: '/api/v1/sphere/invites/:inviteCode/accept',
    pathParams: ['inviteCode'],
    description: 'Accept an invite and join a thread membership ACL.',
    queryTemplate: {
      inviteCode: 'replace_with_invite_code'
    },
    bodyTemplate: {}
  },
  {
    id: 'sphere_thread_invites',
    label: 'List Thread Invites',
    scope: 'sphere',
    method: 'GET',
    path: '/api/v1/sphere/threads/:threadId/invites',
    pathParams: ['threadId'],
    description: 'List invite tokens for a thread (optionally including revoked invites).',
    queryTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      limit: 100,
      includeRevoked: false
    }
  },
  {
    id: 'sphere_thread_invite_revoke',
    label: 'Revoke Thread Invite',
    scope: 'sphere',
    method: 'POST',
    path: '/api/v1/sphere/threads/:threadId/invites/:inviteCode/revoke',
    pathParams: ['threadId', 'inviteCode'],
    description: 'Revoke an existing thread invite token.',
    queryTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      inviteCode: 'replace_with_invite_code'
    },
    bodyTemplate: {
      reason: 'membership rotation'
    }
  },
  {
    id: 'sphere_thread_member_remove',
    label: 'Remove Thread Member',
    scope: 'sphere',
    method: 'DELETE',
    path: '/api/v1/sphere/threads/:threadId/members/:memberPrincipal',
    pathParams: ['threadId', 'memberPrincipal'],
    description: 'Remove a member principal from thread ACL (owner only).',
    queryTemplate: {
      threadId: '11111111-1111-4111-8111-111111111111',
      memberPrincipal: 'agent_2'
    }
  },

  // Citadel (12)
  {
    id: 'citadel_propose',
    label: 'Create Proposal',
    scope: 'citadel',
    method: 'POST',
    path: '/api/v1/citadel/propose',
    description: 'Create a governance proposal in a sphere.',
    bodyTemplate: {
      sphereId: 'global',
      title: 'Proposal title',
      description: 'Proposal details',
      closesAt: tomorrowIso
    }
  },
  {
    id: 'citadel_vote',
    label: 'Cast Vote',
    scope: 'citadel',
    method: 'POST',
    path: '/api/v1/citadel/vote',
    description: 'Cast or update a vote choice on a proposal.',
    bodyTemplate: {
      voteId: 'vote-id',
      choice: 'yes',
      rationale: 'Reasoning for this choice'
    }
  },
  {
    id: 'citadel_constitution',
    label: 'Get Constitution',
    scope: 'citadel',
    method: 'GET',
    path: '/api/v1/citadel/constitution',
    description: 'Fetch governance events for the selected sphere.',
    queryTemplate: { sphereId: 'global' }
  },
  {
    id: 'citadel_advice_process',
    label: 'Mark Advice Process',
    scope: 'citadel',
    method: 'POST',
    path: '/api/v1/citadel/advice-process',
    description: 'Attach advice-process notes to a proposal.',
    bodyTemplate: { voteId: 'vote-id', notes: 'Stakeholder feedback notes' }
  },
  {
    id: 'citadel_ai_governance_review',
    label: 'Queue AI Review',
    scope: 'citadel',
    method: 'POST',
    path: '/api/v1/citadel/ai-governance-review',
    description: 'Queue AI governance review for a proposal.',
    bodyTemplate: { voteId: 'vote-id' }
  },
  {
    id: 'citadel_emergency_shutdown',
    label: 'Emergency Shutdown',
    scope: 'citadel',
    method: 'POST',
    path: '/api/v1/citadel/emergency-shutdown',
    description: 'Issue an emergency shutdown event for a sphere.',
    bodyTemplate: {
      sphereId: 'global',
      reason: 'Critical governance incident'
    }
  },
  {
    id: 'citadel_flag_impact',
    label: 'Flag Impact',
    scope: 'citadel',
    method: 'POST',
    path: '/api/v1/citadel/flag-impact',
    description: 'Flag a proposal for impact review.',
    bodyTemplate: {
      voteId: 'vote-id',
      notes: 'Potential high-impact outcome'
    }
  },
  {
    id: 'citadel_governance_meeting',
    label: 'Schedule Meeting',
    scope: 'citadel',
    method: 'POST',
    path: '/api/v1/citadel/governance-meeting',
    description: 'Schedule a governance meeting event.',
    bodyTemplate: {
      sphereId: 'global',
      agenda: 'Weekly governance sync',
      scheduledAt: tomorrowIso
    }
  },
  {
    id: 'citadel_governance_report',
    label: 'Get Governance Report',
    scope: 'citadel',
    method: 'GET',
    path: '/api/v1/citadel/governance-report',
    description: 'Fetch votes/events report for a sphere.',
    queryTemplate: { sphereId: 'global' }
  },
  {
    id: 'citadel_log_event',
    label: 'Log Governance Event',
    scope: 'citadel',
    method: 'POST',
    path: '/api/v1/citadel/log-event',
    description: 'Write a custom governance event entry.',
    bodyTemplate: {
      sphereId: 'global',
      eventType: 'manual_note',
      payload: { note: 'Operator event' }
    }
  },
  {
    id: 'citadel_ratchet',
    label: 'Advance Ratchet',
    scope: 'citadel',
    method: 'POST',
    path: '/api/v1/citadel/ratchet',
    description: 'Lock in a governance decision.',
    bodyTemplate: { voteId: 'vote-id', decision: 'approve' }
  },
  {
    id: 'citadel_proposals',
    label: 'List Proposals',
    scope: 'citadel',
    method: 'GET',
    path: '/api/v1/citadel/proposals',
    description: 'List proposals for a sphere.',
    queryTemplate: { sphereId: 'global' }
  },

  // Forge (11)
  {
    id: 'forge_passport',
    label: 'Get Passport',
    scope: 'forge',
    method: 'GET',
    path: '/api/v1/forge/passport',
    description: 'Return user passport, stats, and earned lenses.'
  },
  {
    id: 'forge_lenses',
    label: 'List Lenses',
    scope: 'forge',
    method: 'GET',
    path: '/api/v1/forge/lens',
    description: 'Return the full lens pack.'
  },
  {
    id: 'forge_my_lens',
    label: 'Get Active Lens',
    scope: 'forge',
    method: 'GET',
    path: '/api/v1/forge/my-lens',
    description: 'Return the authenticated user active lens.'
  },
  {
    id: 'forge_cxp',
    label: 'Get CXP Breakdown',
    scope: 'forge',
    method: 'GET',
    path: '/api/v1/forge/cxp',
    description: 'Return CXP score breakdown for the user.'
  },
  {
    id: 'forge_perspective',
    label: 'Submit Perspective',
    scope: 'forge',
    method: 'POST',
    path: '/api/v1/forge/perspective',
    description: 'Queue a player perspective submission.',
    bodyTemplate: {
      gameId: 'game-id',
      content: 'My perspective for this round'
    }
  },
  {
    id: 'forge_ask',
    label: 'Ask Lens Hint',
    scope: 'forge',
    method: 'POST',
    path: '/api/v1/forge/ask',
    description: 'Generate a hint from selected lens for a game.',
    bodyTemplate: { gameId: 'game-id', lensId: '1' }
  },
  {
    id: 'forge_converge',
    label: 'Trigger Convergence',
    scope: 'forge',
    method: 'POST',
    path: '/api/v1/forge/converge',
    description: 'Queue convergence transition for a game.',
    bodyTemplate: { gameId: 'game-id' }
  },
  {
    id: 'forge_prism',
    label: 'Get Prism Artifacts',
    scope: 'forge',
    method: 'GET',
    path: '/api/v1/forge/prism',
    description: 'Fetch synthesis artifacts for a game.',
    queryTemplate: { gameId: 'game-id' }
  },
  {
    id: 'forge_run_drill',
    label: 'Run Drill',
    scope: 'forge',
    method: 'POST',
    path: '/api/v1/forge/run-drill',
    description: 'Run a lens drill prompt.',
    bodyTemplate: {
      question: 'What governance model fits this scenario?',
      lensId: '1'
    }
  },
  {
    id: 'forge_story',
    label: 'Get Story',
    scope: 'forge',
    method: 'GET',
    path: '/api/v1/forge/story',
    description: 'Fetch narrative story for a game.',
    queryTemplate: { gameId: 'game-id' }
  },
  {
    id: 'forge_summarize',
    label: 'Summarize Game',
    scope: 'forge',
    method: 'GET',
    path: '/api/v1/forge/summarize',
    description: 'Fetch game summary artifact.',
    queryTemplate: { gameId: 'game-id' }
  },

  // Hub (8)
  {
    id: 'hub_broadcast',
    label: 'Broadcast Message',
    scope: 'hub',
    method: 'POST',
    path: '/api/v1/hub/broadcast',
    description: 'Broadcast a message to a sphere.',
    bodyTemplate: {
      sphereId: 'global',
      message: 'Message to sphere',
      messageType: 'info'
    }
  },
  {
    id: 'hub_cancel_invite',
    label: 'Cancel Invite',
    scope: 'hub',
    method: 'POST',
    path: '/api/v1/hub/cancel-invite',
    description: 'Cancel a pending game invite.',
    bodyTemplate: { gameId: 'game-id' }
  },
  {
    id: 'hub_decline',
    label: 'Decline Invite',
    scope: 'hub',
    method: 'POST',
    path: '/api/v1/hub/decline',
    description: 'Decline an invite for a game.',
    bodyTemplate: { gameId: 'game-id' }
  },
  {
    id: 'hub_defer',
    label: 'Defer Decision',
    scope: 'hub',
    method: 'POST',
    path: '/api/v1/hub/defer',
    description: 'Queue defer decision command for a game.',
    bodyTemplate: {
      gameId: 'game-id',
      deferUntil: tomorrowIso,
      reason: 'Need more data'
    }
  },
  {
    id: 'hub_escalations',
    label: 'Get Escalations',
    scope: 'hub',
    method: 'GET',
    path: '/api/v1/hub/escalations',
    description: 'List current escalations.'
  },
  {
    id: 'hub_everyone',
    label: 'List Members',
    scope: 'hub',
    method: 'GET',
    path: '/api/v1/hub/everyone',
    description: 'List players for a game.',
    queryTemplate: { gameId: 'game-id' }
  },
  {
    id: 'hub_sync',
    label: 'Force Sync',
    scope: 'hub',
    method: 'POST',
    path: '/api/v1/hub/sync',
    description: 'Trigger game state sync broadcast.',
    bodyTemplate: { gameId: 'game-id' }
  },
  {
    id: 'hub_who_sees_what',
    label: 'Visibility Map',
    scope: 'hub',
    method: 'GET',
    path: '/api/v1/hub/who-sees-what',
    description: 'Fetch visibility matrix for game state.',
    queryTemplate: { gameId: 'game-id' }
  },

  // Engine Room (19)
  {
    id: 'engine_status_all',
    label: 'Status All',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/status-all',
    description: 'Fetch game/command/user runtime stats.'
  },
  {
    id: 'engine_db_health',
    label: 'DB Health',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/db-health',
    description: 'Check database health probe.'
  },
  {
    id: 'engine_db_view',
    label: 'DB View',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/db-view',
    description: 'Read a table slice from db view endpoint.',
    queryTemplate: { table: 'games', limit: 20 }
  },
  {
    id: 'engine_deploy_constellation',
    label: 'Deploy Constellation',
    scope: 'engine-room',
    method: 'POST',
    path: '/api/v1/engine-room/deploy-constellation',
    description: 'Queue deployment command for a constellation.',
    bodyTemplate: {
      constellationId: 'constellation-id',
      question: 'What is the best path forward?',
      groupSize: 12
    }
  },
  {
    id: 'engine_drills',
    label: 'List Drills',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/drills',
    description: 'List available drills.'
  },
  {
    id: 'engine_export',
    label: 'Export Game',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/export',
    description: 'Queue game export command.',
    queryTemplate: { gameId: 'game-id' }
  },
  {
    id: 'engine_fallback_report',
    label: 'Fallback Report',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/fallback-report',
    description: 'List failed commands for fallback analysis.'
  },
  {
    id: 'engine_glossary',
    label: 'Glossary',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/glossary',
    description: 'Get system glossary definitions.'
  },
  {
    id: 'engine_heartbeat_mute',
    label: 'Heartbeat Mute',
    scope: 'engine-room',
    method: 'POST',
    path: '/api/v1/engine-room/heartbeat-mute',
    description: 'Temporarily mute heartbeats.',
    bodyTemplate: { gameId: 'game-id', durationMinutes: 5 }
  },
  {
    id: 'engine_list_constellations',
    label: 'List Constellations',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/list-constellations',
    description: 'List available constellation archetypes.'
  },
  {
    id: 'engine_pause_drills',
    label: 'Pause Drills',
    scope: 'engine-room',
    method: 'POST',
    path: '/api/v1/engine-room/pause-drills',
    description: 'Queue pause drills command.',
    bodyTemplate: {}
  },
  {
    id: 'engine_resume_drills',
    label: 'Resume Drills',
    scope: 'engine-room',
    method: 'POST',
    path: '/api/v1/engine-room/resume-drills',
    description: 'Queue resume drills command.',
    bodyTemplate: {}
  },
  {
    id: 'engine_sphere',
    label: 'Get Sphere',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/sphere',
    description: 'Fetch sphere metadata and recent games.',
    queryTemplate: { sphereId: 'global' }
  },
  {
    id: 'engine_what_is_a_sphere',
    label: 'What Is A Sphere',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/what-is-a-sphere',
    description: 'Fetch long-form sphere definition.'
  },
  {
    id: 'engine_config_get',
    label: 'Get Config',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/config',
    description: 'Get runtime config values.'
  },
  {
    id: 'engine_config_patch',
    label: 'Patch Config',
    scope: 'engine-room',
    method: 'PATCH',
    path: '/api/v1/engine-room/config',
    description: 'Patch runtime config values.',
    bodyTemplate: {
      defaultGroupSize: 12,
      positionRevealSeconds: 30
    }
  },
  {
    id: 'engine_skills',
    label: 'List Skills',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/skills',
    description: 'List runtime skill execution states.'
  },
  {
    id: 'engine_skill_status',
    label: 'Skill Status',
    scope: 'engine-room',
    method: 'GET',
    path: '/api/v1/engine-room/skills/:skillId/status',
    pathParams: ['skillId'],
    description: 'Fetch the status of one runtime skill.',
    queryTemplate: { skillId: 'email_checking' }
  },
  {
    id: 'engine_skill_run',
    label: 'Run Skill',
    scope: 'engine-room',
    method: 'POST',
    path: '/api/v1/engine-room/skills/run',
    description: 'Execute one runtime skill with payload input.',
    bodyTemplate: {
      skillId: 'email_checking',
      payload: {}
    }
  },

  // MetaCanon Runtime Control (19)
  {
    id: 'runtime_health',
    label: 'Runtime Health',
    scope: 'runtime',
    method: 'GET',
    path: '/api/v1/runtime/healthz',
    description: 'Check runtime bridge readiness and command-module availability.'
  },
  {
    id: 'runtime_bridge_state',
    label: 'Runtime Bridge State',
    scope: 'runtime',
    method: 'GET',
    path: '/api/v1/runtime/bridge/state',
    description: 'Inspect runtime bridge load state and last load error.'
  },
  {
    id: 'runtime_compute_options',
    label: 'Runtime Compute Options',
    scope: 'runtime',
    method: 'GET',
    path: '/api/v1/runtime/compute/options',
    description: 'List runtime compute providers and status.'
  },
  {
    id: 'runtime_compute_global',
    label: 'Runtime Set Global Provider',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/compute/global-provider',
    description: 'Set active runtime compute provider.',
    bodyTemplate: { provider_id: 'qwen_local' }
  },
  {
    id: 'runtime_compute_priority',
    label: 'Runtime Set Cloud Priority',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/compute/priority',
    description: 'Set cloud fallback priority list.',
    bodyTemplate: { cloud_provider_priority: ['openai', 'anthropic', 'moonshot_kimi', 'grok'] }
  },
  {
    id: 'runtime_provider_config',
    label: 'Runtime Provider Config',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/providers/:providerId/config',
    pathParams: ['providerId'],
    description: 'Update provider configuration for a runtime provider.',
    queryTemplate: { providerId: 'openai' },
    bodyTemplate: { config: { api_key: 'sk-...', live_api: true } }
  },
  {
    id: 'runtime_genesis_invoke',
    label: 'Runtime Invoke Genesis',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/genesis/invoke',
    description: 'Run guided Genesis rite through runtime bridge.',
    bodyTemplate: {
      vision_core: 'MetaCanon sovereign operation',
      core_values: ['Sovereignty', 'Clarity'],
      will_directives: ['Protect private thoughts'],
      signing_secret: 'replace-with-secret'
    }
  },
  {
    id: 'runtime_action_validate',
    label: 'Runtime Validate Action',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/actions/validate',
    description: 'Validate an action against current Will Vector.',
    bodyTemplate: {
      action: { target: 'llm_call', content: 'protect private thoughts' },
      will_vector: { directives: ['protect private thoughts'] }
    }
  },
  {
    id: 'runtime_subsphere_create',
    label: 'Runtime Create Sub-Sphere',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/sub-spheres',
    description: 'Create a runtime task sub-sphere.',
    bodyTemplate: {
      name: 'Research Pod',
      objective: 'Compile source-of-truth references',
      hitl_required: true
    }
  },
  {
    id: 'runtime_subsphere_list',
    label: 'Runtime List Sub-Spheres',
    scope: 'runtime',
    method: 'GET',
    path: '/api/v1/runtime/sub-spheres',
    description: 'List active/paused/dissolved runtime sub-spheres.'
  },
  {
    id: 'runtime_subsphere_get',
    label: 'Runtime Get Sub-Sphere',
    scope: 'runtime',
    method: 'GET',
    path: '/api/v1/runtime/sub-spheres/:subSphereId',
    pathParams: ['subSphereId'],
    description: 'Get one runtime sub-sphere status.',
    queryTemplate: { subSphereId: 'replace-sub-sphere-id' }
  },
  {
    id: 'runtime_subsphere_pause',
    label: 'Runtime Pause Sub-Sphere',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/sub-spheres/:subSphereId/pause',
    pathParams: ['subSphereId'],
    description: 'Pause a runtime sub-sphere.',
    queryTemplate: { subSphereId: 'replace-sub-sphere-id' },
    bodyTemplate: {}
  },
  {
    id: 'runtime_subsphere_dissolve',
    label: 'Runtime Dissolve Sub-Sphere',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/sub-spheres/:subSphereId/dissolve',
    pathParams: ['subSphereId'],
    description: 'Dissolve a runtime sub-sphere.',
    queryTemplate: { subSphereId: 'replace-sub-sphere-id' },
    bodyTemplate: { reason: 'objective completed' }
  },
  {
    id: 'runtime_subsphere_query',
    label: 'Runtime Query Sub-Sphere',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/sub-spheres/:subSphereId/query',
    pathParams: ['subSphereId'],
    description: 'Submit a query to a runtime sub-sphere deliberation path.',
    queryTemplate: { subSphereId: 'replace-sub-sphere-id' },
    bodyTemplate: { query: 'Summarize current risks', provider_override: null }
  },
  {
    id: 'runtime_comms_status',
    label: 'Runtime Comms Status',
    scope: 'runtime',
    method: 'GET',
    path: '/api/v1/runtime/communications/status',
    description: 'Fetch runtime Telegram/Discord/In-App communication status.'
  },
  {
    id: 'runtime_comms_agent_bind',
    label: 'Runtime Bind Agent Route',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/communications/agents/bind',
    description: 'Bind an agent route for Telegram/Discord/In-App.',
    bodyTemplate: {
      agent_id: 'agent-genesis',
      telegram_chat_id: null,
      discord_thread_id: null,
      in_app_thread_id: 'inapp-agent-genesis',
      is_orchestrator: true
    }
  },
  {
    id: 'runtime_comms_subsphere_bind',
    label: 'Runtime Bind Sub-Sphere Prism',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/communications/sub-spheres/prism/bind',
    description: 'Bind prism route for a sub-sphere.',
    bodyTemplate: {
      sub_sphere_id: 'replace-sub-sphere-id',
      prism_agent_id: 'agent-synthesis',
      in_app_thread_id: 'inapp-prism-sphere-1'
    }
  },
  {
    id: 'runtime_comms_agent_message',
    label: 'Runtime Send Agent Message',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/communications/agents/message',
    description: 'Dispatch message to an agent route.',
    bodyTemplate: {
      platform: 'in_app',
      agent_id: 'agent-genesis',
      message: 'Runtime command deck ping'
    }
  },
  {
    id: 'runtime_comms_subsphere_message',
    label: 'Runtime Send Sub-Sphere Message',
    scope: 'runtime',
    method: 'POST',
    path: '/api/v1/runtime/communications/sub-spheres/message',
    description: 'Dispatch message to a sub-sphere prism route.',
    bodyTemplate: {
      platform: 'in_app',
      sub_sphere_id: 'replace-sub-sphere-id',
      message: 'Prism channel ping'
    }
  }
];

export const commandCatalogById: Record<string, CommandDefinition> = Object.fromEntries(
  commandCatalog.map((command) => [command.id, command])
) as Record<string, CommandDefinition>;

export function getCommandById(commandId: string | null | undefined): CommandDefinition | null {
  if (!commandId) return null;
  return commandCatalogById[commandId] ?? null;
}

export function normalizeCommandToken(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isOpenClawTrigger(value: string | null | undefined): boolean {
  const normalized = normalizeCommandToken(value);
  if (!normalized) return false;
  return normalized === 'openclaw' || normalized.startsWith('openclaw') || normalized.startsWith('claw');
}

export function resolveCommandIdFromValue(value: string | null | undefined): string | null {
  const normalized = normalizeCommandToken(value);
  if (!normalized) return null;

  const exact = commandCatalog.find((command) => normalizeCommandToken(command.id) === normalized);
  if (exact) return exact.id;

  return null;
}

export function getOpenClawCommandId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  // Supported formats: open_claw, open_claw:command_id, open_claw__command_id, claw:command_id.
  const separators = [':', '__'];
  for (const separator of separators) {
    const [prefix, remainder] = trimmed.split(separator, 2);
    if (!remainder) continue;
    if (!isOpenClawTrigger(prefix)) continue;
    const resolved = resolveCommandIdFromValue(remainder);
    if (resolved) return resolved;
  }

  if (isOpenClawTrigger(trimmed)) return 'open_claw';
  return resolveCommandIdFromValue(trimmed);
}
