# MetaCanon Master Build Plan — Dependencies & Risks Summary
## Tracks 1, 2, 4, and 5 (Rust Core, Node.js Engine, TMA App, Agent Skills)

**Source:** `metacanon_master_build_plan_multi_agent.md`
**Generated:** March 06, 2026
**Agents:** GrokJediSherpaBot (Track 1), WizardJoeBot (Tracks 2 & 4), FeralPharaohBot (Track 5)
**Total Tasks Covered:** 36 tasks across 4 tracks

> This document is the companion to `dependencies_and_risks_summary.md` (Tracks 3 & 6). Together they cover all 45 tasks in the Master Build Plan.

---

## How to Read This Document

Each task entry contains:
- **Depends On:** Tasks that must be fully complete before this task can begin
- **Blocks:** Tasks that cannot start until this one is done
- **Top Risks:** The highest-priority failure modes, security vulnerabilities, and performance concerns
- **Mitigation:** The specific action to take to prevent or contain the risk

---

## TRACK 1 — Rust Core & Constitutional Architecture
**Agent:** GrokJediSherpaBot | **9 Tasks**

The entire Track 1 is a strict linear dependency chain. Task 1.1 is the absolute root. Nothing else in the entire system can be built until it is complete.

### Dependency Chain Diagram

```
1.1 (main.rs async refactor)
  └─► 1.2 (TaskSubSphere struct & lifecycle)
        └─► 1.3 (ActionValidator gate)
              └─► 1.4 (ComputeRouter HTTP pool)
              └─► 1.7 (SoulFile persistence)
                    └─► 1.5 (ObservabilityLogger MerkleDAG+FHE)
                          └─► 1.6 (napi-rs FFI bridge)
                                └─► 1.8 (LiturgyEngine scheduler)
                                      └─► 1.9 (AgentHashing protocol)
```

---

### Task 1.1 — Refactor `main.rs` with `tokio::main` and `SubSphereManager`

| Field | Detail |
|---|---|
| **Depends On** | None — this is the foundational task for the entire system |
| **Blocks** | Every other task in the entire build plan |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Async channel overflow if event queue grows unbounded | High | Use bounded `mpsc::channel(100)` — already specified in the plan |
| Race conditions during `SoulFile` loading if multiple tasks access it concurrently | High | Wrap `SoulFile` in `Arc<RwLock<>>` from the start |
| `WillVector` mutated post-initialization, breaking constitutional invariants | Critical | Mark `WillVector` as non-cloneable and non-`pub` after construction |
| Performance degradation if too many spheres are active without garbage collection | Medium | Implement a `max_active_spheres` limit and a reaper task in the run loop |

---

### Task 1.2 — Create `sub_sphere_manager.rs` with `TaskSubSphere` lifecycle

| Field | Detail |
|---|---|
| **Depends On** | Task 1.1 (SubSphereManager and async main) |
| **Blocks** | Tasks 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9 — and all of Tracks 2, 4, and 5 |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Deadlocks if channels are not properly `await`ed in the process loop | Critical | Use `tokio::select!` to prevent blocking on a single channel |
| State corruption if lifecycle transitions are not atomic | High | Use `tokio::sync::Mutex` to guard `LifecycleState` transitions |
| Inter-sphere messages bypassing `ActionValidator` | Critical | Enforce validation at the `message_queue` receive point, not just at the send point |
| Performance bottleneck if `process_spheres` loop is not truly concurrent | Medium | Use `tokio::spawn` per sphere rather than iterating sequentially |

---

### Task 1.3 — Enforce `ActionValidator` as mandatory pre-execution gate

| Field | Detail |
|---|---|
| **Depends On** | Task 1.1 (WillVector access), Task 1.2 (integration into sphere process) |
| **Blocks** | Tasks 1.4, 1.6, and all of Track 2 (every LLM call and tool invocation) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| False negatives blocking valid actions due to poorly tuned alignment threshold | High | Start with threshold 0.7 during development, raise to 0.85 for production; log all rejections |
| Performance overhead from embedding calculations on every single call | High | Cache embeddings for repeated action patterns using an `LruCache` |
| Validator bypassed via direct function calls that skip the trait | Critical | Make all compute/tool/comms functions `pub(crate)` only; enforce the public API goes through the validator |
| Incorrect Hopf projection math causing misalignment with the Constitution | High | Write unit tests with known-good and known-bad action/WillVector pairs before integrating |

---

### Task 1.4 — Implement `ComputeRouter` as async HTTP client pool

| Field | Detail |
|---|---|
| **Depends On** | Task 1.1 (async runtime), Task 1.3 (ActionValidator wrapping every outbound call) |
| **Blocks** | Task 1.5 (log_event via FFI), Task 2.2 (HybridExecutionRouter calls into this) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Connection pool exhaustion under high concurrency | High | Add `tokio::sync::Semaphore` to cap concurrent outbound connections per provider |
| Fallback infinite loop if all providers fail simultaneously | High | Add `max_retries = 3` per provider and a total timeout of 30 seconds across the chain |
| API keys not securely injected — hardcoded or logged | Critical | Keys must come exclusively from `secrets.rs` via `FhePrivateKey` decryption; never log them |
| Sequential fallback adding unacceptable latency | Medium | For non-critical calls, parallelize the first two providers and take the fastest response |

---

### Task 1.5 — Upgrade `ObservabilityLogger` to MerkleDAG with FHE encryption

| Field | Detail |
|---|---|
| **Depends On** | Task 1.1 (async runtime), Task 1.6 (FFI bridge — Node.js sends events to Rust for logging) |
| **Blocks** | Task 1.7 (SoulFile update events must be logged), Task 1.9 (AgentHashing events logged here) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| DAG growing without bound, causing memory exhaustion | High | Implement a pruning policy: archive nodes older than 90 days to a flat file, keep only the last 1,000 nodes in memory |
| `FhePrivateKey` accidentally cloned or serialized, exposing the sovereign's key | Critical | Implement `!Clone` and `!Serialize` on `FhePrivateKey`; use `#[serde(skip)]` on all structs containing it |
| Hash function weakness (MD5/SHA1) allowing DAG tampering | High | Use SHA3-256 exclusively; add a compile-time assertion that no other hash function is imported |
| Performance slowdown from FHE encryption on every log event | Medium | Batch log events in groups of 10 and encrypt the batch, not each event individually |

---

### Task 1.6 — Build `napi-rs` FFI bridge (6 exposed functions)

| Field | Detail |
|---|---|
| **Depends On** | Task 1.3 (validate_action), Task 1.5 (log_event), Task 1.7 (update_soul_file) |
| **Blocks** | All of Track 2 (Node.js cannot call Rust without this), all of Track 4, all of Track 5 |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Memory leaks from improper NAPI object lifecycle management | High | Use `napi::Env::create_string` for all string returns; never return raw pointers |
| Deserialization errors in JSON payloads crashing the Node.js process | Critical | Wrap all `serde_json::from_str` calls in `Result` and return a structured error to JS rather than panicking |
| Security: unvalidated JSON input allows injection attacks across the FFI boundary | Critical | Sanitize all string inputs before deserialization; enforce a maximum payload size of 64KB |
| Build failures on non-matching platforms (e.g., ARM vs x86) | Medium | Add CI matrix for `linux-x64`, `darwin-arm64`, and `win32-x64` from day one |

---

### Task 1.7 — Implement `SoulFile` persistence and versioning

| Field | Detail |
|---|---|
| **Depends On** | Task 1.1 (SubSphereManager), Task 1.5 (log_event for constitutional events) |
| **Blocks** | Task 1.6 (update_soul_file FFI function), Task 1.8 (LiturgyEngine reads SoulFile on startup) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| File corruption on write leaving the SoulFile in an invalid state | Critical | Use atomic write: write to a `.tmp` file, verify hash, then `rename()` to the real path |
| Concurrent updates causing version conflicts | High | Use a file lock (`flock`) before any write; release after `rename()` completes |
| Reload during active spheres disrupting the live `WillVector` | High | Pause all sphere processing during reload; broadcast a `SubSphereEvent::Pause` before loading |
| User-controlled path allowing directory traversal | Critical | Canonicalize the path and assert it is within the MetaCanon data directory before any file operation |

---

### Task 1.8 — Implement `LiturgyEngine` scheduler

| Field | Detail |
|---|---|
| **Depends On** | Task 1.1 (async runtime), Task 1.2 (spawns TaskSubSpheres), Task 1.6 (FFI for Node.js to add tasks) |
| **Blocks** | Task 1.9 (AgentHashing runs on a liturgy schedule), all of Track 5 (every agent skill has a liturgy schedule) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Cron expression parsing errors causing silent schedule failures | High | Validate all cron expressions at registration time; reject invalid ones immediately |
| Missed tasks during system downtime not being recovered on restart | High | Persist the last-run timestamp for each task; on startup, check for missed windows and run them immediately |
| Task pile-up if a long-running sphere is still active when the next liturgy fires | Medium | Implement a `skip_if_running` flag per task; log the skip as a constitutional event |
| Timezone drift causing tasks to fire at wrong times | Medium | Store all cron schedules in UTC; convert to local time only for display |

---

### Task 1.9 — Implement `AgentHashing` verification protocol

| Field | Detail |
|---|---|
| **Depends On** | Task 1.6 (FFI for verification calls from Node.js), Task 1.8 (hashing runs on a liturgy schedule) |
| **Blocks** | Nothing — this is the final task in Track 1 |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Hash collision allowing a tampered agent to pass verification | Low (SHA3-256) | Use SHA3-256 exclusively; add a second verification pass using BLAKE3 for defense in depth |
| Verification adding unacceptable latency to agent startup | Medium | Pre-compute and cache hashes at agent registration; only recompute on SoulFile version change |
| Verification bypass if the FFI call fails silently | Critical | Treat any FFI error in the verification path as a constitutional violation; halt the agent |

---

## TRACK 2 — Node.js Sphere Engine Server
**Agent:** WizardJoeBot | **8 Tasks**

Track 2 has one foundational task (2.5 — PostgreSQL) and two parallel streams that merge at Task 2.8.

### Dependency Chain Diagram

```
2.5 (PostgreSQL migrations — foundational)
  ├─► 2.1 (SphereConductor hypervisor)
  │     └─► 2.8 (OrchestrationService — merge point)
  ├─► 2.3 (ThreadAccessRegistry)
  │     ├─► 2.6 (BFF API — player-facing)
  │     └─► 2.7 (C2 API — agent-facing)
  └─► 2.2 (HybridExecutionRouter)
        └─► 2.4 (TelegramMessageBridge)
              └─► 2.8 (OrchestrationService — merge point)
```

---

### Task 2.1 — Implement `SphereConductor` as stateful hypervisor

| Field | Detail |
|---|---|
| **Depends On** | Task 2.5 (PostgreSQL `sub_spheres` and `messages` tables must exist) |
| **Blocks** | Task 2.8 (OrchestrationService coordinates through SphereConductor) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| In-memory `sessions` Map loses state on server restart if DB reload fails | Critical | On startup, call `loadSessions()` before accepting any requests; fail hard if DB is unreachable |
| Unvalidated `task` input allowing arbitrary code execution via sub-sphere spawn | Critical | Validate task payload against a strict Zod schema before passing to `spawnSubSphere` |
| Memory bloat from large numbers of active sessions | High | Implement a `max_sessions` cap (e.g., 100); reject new spawns beyond the cap with a 503 response |

---

### Task 2.2 — Build `HybridExecutionRouter`

| Field | Detail |
|---|---|
| **Depends On** | Task 2.1 (SphereConductor for request origination), Task 1.6 (FFI bridge for ActionValidator calls) |
| **Blocks** | Task 2.4 (TelegramMessageBridge uses router for validation), Task 2.8 (OrchestrationService routes through this) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Fallback chain adding high latency if multiple providers fail | High | Set a per-provider timeout of 8 seconds; do not wait for a provider to fully fail before trying the next |
| FFI validation bypassed due to a network error being swallowed | Critical | Treat any FFI error as a constitutional violation; do not fall through to execution |
| Local providers slow on low-spec hardware causing poor UX | Medium | Add a provider health check on startup; skip providers that fail the health check rather than timing out on every call |

---

### Task 2.3 — Secure `ThreadAccessRegistry`

| Field | Detail |
|---|---|
| **Depends On** | Task 2.5 (PostgreSQL schema for threads, api_keys, invite_codes, roles, access_grants) |
| **Blocks** | Task 2.6 (BFF API uses registry for role enforcement), Task 2.7 (C2 API uses registry for key validation) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Role escalation if the hierarchy check has an off-by-one error | Critical | Write exhaustive unit tests for every role pairing (sovereign→admin, admin→agent, etc.) |
| SQL injection if invite code or role inputs are not sanitized | Critical | Use parameterized queries exclusively via Drizzle ORM; never concatenate user input into SQL |
| Performance hit from FFI logging on every schema change | Medium | Batch constitutional event logs in groups of 5; flush every 500ms |

---

### Task 2.4 — Make `TelegramMessageBridge` resilient

| Field | Detail |
|---|---|
| **Depends On** | Task 2.2 (HybridExecutionRouter for constitutional validation of inbound messages) |
| **Blocks** | Task 2.8 (OrchestrationService coordinates Telegram messages through the bridge) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Infinite polling loop consuming 100% CPU when Telegram API is slow | High | Add a `delay(1000)` between polls; implement exponential backoff on consecutive failures |
| Message loss during network failures without retry | High | Persist the last processed `update_id` to the database; resume from that offset on reconnect |
| SHA-256 collision producing duplicate message IDs | Low | Append a `Date.now()` timestamp to the hash input to guarantee uniqueness |

---

### Task 2.5 — Set up PostgreSQL with 10 migration files

| Field | Detail |
|---|---|
| **Depends On** | None — this is the foundational task for all of Track 2 |
| **Blocks** | Tasks 2.1, 2.3, 2.6, 2.7, 2.8 — and all of Track 5 (agent skill schemas) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Migration failure leaving the database in a partially-migrated, inconsistent state | Critical | Wrap each migration in a transaction; roll back the entire migration on any error |
| Schema changes without versioning breaking existing queries | High | Never modify a migration file after it has been applied; always add a new migration file |
| Performance degradation on large `events` and `messages` tables without indexes | High | Add indexes in migration 009 before the tables contain any data; do not add them retroactively |

---

### Task 2.6 — Secure the BFF API (player-facing)

| Field | Detail |
|---|---|
| **Depends On** | Task 2.3 (ThreadAccessRegistry for role enforcement) |
| **Blocks** | Tasks 4.1, 4.2, 4.5 (TMA pages that call the BFF API) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| JWT secret leak compromising all user sessions | Critical | Store `JWT_SECRET` in environment variable only; never commit to version control; rotate on any suspected exposure |
| Rate limiting blocking legitimate high-frequency users | Medium | Implement per-user rate limits (not global); allow the sovereign role to bypass rate limits |
| Joi validation schema incomplete, allowing malformed input to reach the database | High | Use `schema.options({ allowUnknown: false })` to reject any unknown fields |

---

### Task 2.7 — Secure the C2 API (agent-facing)

| Field | Detail |
|---|---|
| **Depends On** | Task 2.3 (ThreadAccessRegistry for API key validation) |
| **Blocks** | Tasks 4.3, 4.4 (Engine Room and Forge pages call the C2 API) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| API key exposure allowing agent impersonation | Critical | Hash API keys with bcrypt before storing; compare hashes, never plaintext |
| Command whitelist omission allowing arbitrary command execution | Critical | Use an allowlist enum, not a string comparison; reject anything not in the enum |
| FHE logging failure leaving audit gaps in the constitutional record | High | Buffer failed log events in a local queue; retry with exponential backoff; alert the sovereign if the queue exceeds 100 items |

---

### Task 2.8 — Implement `OrchestrationService`

| Field | Detail |
|---|---|
| **Depends On** | Task 2.1 (SphereConductor), Task 2.2 (HybridExecutionRouter) |
| **Blocks** | All of Track 5 (every agent skill is orchestrated through this service) |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Deliberation loop running infinitely if PCLs cannot reach consensus | High | Implement a `max_rounds = 5` limit; escalate to HITL (human-in-the-loop) if limit is reached |
| Single component failure (conductor, router, or LLM) halting all orchestration | High | Wrap each component call in a try/catch; degrade gracefully (e.g., skip a PCL rather than halt) |
| Performance bottleneck if many PCLs are assigned to a single deliberation | Medium | Cap PCLs per deliberation at 7; use parallel LLM calls for independent PCLs |

---

## TRACK 4 — Sphere TMA App (Telegram Mini App)
**Agent:** WizardJoeBot | **7 Tasks**

Track 4 has no internal dependencies — all 5 pages can be built in parallel once their respective API dependencies (Tasks 2.6 and 2.7) are complete. The skin system (4.6) and haptics (4.7) are fully independent.

### Dependency Chain Diagram

```
2.6 (BFF API) ──► 4.1 (Atlas page)
               ──► 4.2 (Citadel page)
               ──► 4.5 (Hub page)

2.7 (C2 API)  ──► 4.3 (Engine Room page)
               ──► 4.4 (Forge page)

[None]         ──► 4.6 (Skin system)
[None]         ──► 4.7 (Haptic feedback)
```

---

### Task 4.1 — Atlas page (Living Atlas dashboard)

| Field | Detail |
|---|---|
| **Depends On** | Task 2.6 (BFF API `/threads` endpoint) |
| **Blocks** | Nothing |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Three.js performance degradation on mobile Telegram clients | High | Use `@react-three/fiber` with `performance.current.regress()` to auto-reduce quality on slow frames |
| WebSocket disconnects causing the dashboard to show stale data silently | High | Implement a reconnection indicator in the UI; show a "Reconnecting..." banner when the WS is down |
| Fetch failure leaving the thread list empty with no user feedback | Medium | Show a skeleton loader during fetch; show an error state with a retry button on failure |

---

### Task 4.2 — Citadel page (constitutional voting and governance)

| Field | Detail |
|---|---|
| **Depends On** | Task 2.6 (BFF API `/proposals` endpoint) |
| **Blocks** | Nothing |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Quorum miscalculation allowing a proposal to pass with insufficient votes | Critical | Write unit tests for quorum calculation with edge cases (0 votes, exactly 67%, 66.9%) |
| FFI failure losing a vote record permanently | Critical | Buffer the FFI call result; if it fails, store the vote locally and retry on next app open |
| UI spoofing if proposal text is not sanitized (XSS) | High | Sanitize all proposal text with DOMPurify before rendering |

---

### Task 4.3 — Engine Room page (system commands and constellation deployment)

| Field | Detail |
|---|---|
| **Depends On** | Task 2.7 (C2 API `/command` endpoint) |
| **Blocks** | Nothing |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Command execution without WillVector confirmation bypassing constitutional validation | Critical | The confirmation dialog must be non-dismissable; the API call must not be made until FFI validation returns `true` |
| API failure leaving the system in an ambiguous state (e.g., sphere partially spawned) | High | Implement idempotency keys on all C2 commands; the server must be safe to retry |
| User accidentally selecting the wrong command in the palette | Medium | Add a confirmation step for all destructive commands (terminate, update soul file) |

---

### Task 4.4 — Forge page (agent creation and PCL assignment)

| Field | Detail |
|---|---|
| **Depends On** | Task 2.7 (C2 API `/command` for `create_agent`) |
| **Blocks** | Nothing |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Hash collision allowing duplicate agent identities | Low (SHA-256) | Append a `crypto.randomUUID()` to the hash input to guarantee uniqueness |
| Compliance check false positive blocking valid agent creation | Medium | Log all compliance check rejections; provide the sovereign with an override mechanism |
| Form input tampering allowing an agent to be created with an invalid PCL | High | Validate the PCL selection against the server-side PCL registry, not just the client-side dropdown |

---

### Task 4.5 — Hub page (unified communications)

| Field | Detail |
|---|---|
| **Depends On** | Task 2.6 (BFF API `/messages` endpoint) |
| **Blocks** | Nothing |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Stale data displayed when the query fails silently | Medium | Use `react-query`'s `staleTime` and `refetchOnWindowFocus` to keep data fresh |
| Privacy leak in the daily briefing showing sensitive message content | High | The briefing must show only the LLM-generated summary, never the raw message body |
| Platform selector state loss on page navigation | Low | Persist the selected platform in `sessionStorage` |

---

### Task 4.6 — Skin system (obsidian, aethel, cypher themes)

| Field | Detail |
|---|---|
| **Depends On** | None |
| **Blocks** | Nothing |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| `localStorage` cleared by the user losing their theme preference | Low | Sync preference to the server via a user settings API endpoint as a backup |
| Theme mismatch with Telegram's native UI causing visual glitches | Medium | Always call `Telegram.WebApp.setHeaderColor` and `setBackgroundColor` when theme changes |
| CSS custom property conflicts with Telegram's injected styles | Medium | Scope all theme variables under a `#metacanon-app` root selector to prevent leakage |

---

### Task 4.7 — Haptic feedback system

| Field | Detail |
|---|---|
| **Depends On** | None |
| **Blocks** | Nothing |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| `Telegram.WebApp.HapticFeedback` unavailable in older Telegram versions | Medium | Wrap all haptic calls in a feature detection check: `if (Telegram.WebApp.HapticFeedback)` |
| Excessive haptic calls draining device battery | Medium | Debounce rapid-fire events (e.g., multiple messages arriving simultaneously) to a maximum of 1 haptic per 500ms |
| Toggle preference not persisted across sessions | Low | Use `localStorage` with a fallback to `sessionStorage` |

---

## TRACK 5 — Agent Skills & Contact-Sub-Sphere Runtime
**Agent:** FeralPharaohBot | **19 Tasks**

All 19 agent skill tasks share the same dependency structure. Task 5.19 (the shared `AgentConfig` interface and base executor utilities) is the root that all other tasks depend on. Tasks 5.1–5.18 can then be built in parallel once 5.19 is complete.

### Dependency Chain Diagram

```
2.5 (PostgreSQL) ──► 5.19 (Shared AgentConfig, base utilities)
1.6 (FFI bridge) ──► 5.19
2.8 (OrchestrationService) ──► 5.19
                                  └─► 5.1  (File Organization)
                                  └─► 5.2  (Email Checking)
                                  └─► 5.3  (Transcript Digestion) ──► 5.4
                                  └─► 5.4  (Memory DB Population)
                                  └─► 5.5  (Project Planning)
                                  └─► 5.6  (Code Writing)
                                  └─► 5.7  (API Integration)
                                  └─► 5.8  (Content Generation)
                                  └─► 5.9  (Audio Production — 11 Labs)
                                  └─► 5.10 (Image Generation)
                                  └─► 5.11 (Animation Generation)
                                  └─► 5.12 (Editorial Coordination)
                                  └─► 5.13 (News Monitoring)
                                  └─► 5.14 (Financial Data Watching)
                                  └─► 5.15 (Day Trading Intelligence)
                                  └─► 5.16 (Phone Call Management)
                                  └─► 5.17 (Meeting Scheduling)
                                  └─► 5.18 (Message App Management)
```

**Note:** Task 5.3 (Transcript Digestion) also depends on Task 5.4 (Memory DB Population) because it writes to the memory database. This is the only cross-skill dependency.

---

### Task 5.19 — Shared `AgentConfig` interface and base executor utilities (ROOT TASK)

| Field | Detail |
|---|---|
| **Depends On** | Task 2.5 (PostgreSQL), Task 1.6 (FFI bridge), Task 2.8 (OrchestrationService) |
| **Blocks** | ALL of Tasks 5.1 through 5.18 |

**Top Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| `AgentConfig` interface designed too narrowly, requiring breaking changes later | High | Design the interface with optional fields from the start; use `Partial<AgentConfig>` for skill-specific extensions |
| Base utilities not handling FFI errors gracefully, crashing all skill executors | Critical | Implement a global error boundary in the base executor that catches FFI errors and logs them without crashing |
| Schema changes to base utilities breaking all 18 dependent skills simultaneously | Critical | Treat the base utilities as a stable API; version them (`v1`, `v2`) rather than modifying in place |

---

### Tasks 5.1–5.4 — Core Maintenance Skills (File Organization, Email, Transcript, Memory)

| Task | Skill | Liturgy Schedule | Key Dependency |
|---|---|---|---|
| 5.1 | File Organization | Daily at 2:00 AM | Task 5.19 |
| 5.2 | Email Checking | Every 30 minutes | Task 5.19 |
| 5.3 | Transcript Digestion | Hourly | Tasks 5.19 + 5.4 |
| 5.4 | Memory DB Population | Every hour at :30 | Task 5.19 |

**Shared Risks Across All Maintenance Skills:**

| Risk | Severity | Mitigation |
|---|---|---|
| Sensitive data (emails, transcripts) stored without FHE encryption | Critical | All data written to PostgreSQL must pass through the Rust `ObservabilityLogger` for FHE encryption first |
| Liturgy tasks piling up if the previous run has not completed | High | Implement `skip_if_running` flag; log the skip as a constitutional event |
| IMAP/filesystem credentials stored in plaintext | Critical | Store all credentials via `secrets.rs` using FHE; never write them to the database |

**Task 5.1 — File Organization Specific Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Infinite loop in directory scanning if symlinks are present | High | Use `std::fs::read_dir` with `follow_symlinks: false`; add a max-depth limit of 10 |
| Unauthorized access to sensitive files if `dir_path` is not sanitized | Critical | Validate `dir_path` against a user-defined allowlist of directories; reject anything outside it |

**Task 5.2 — Email Checking Specific Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| IMAP connection timeout causing incomplete fetches | High | Set a 30-second connection timeout; implement exponential backoff on failure |
| High email volume (>1,000 emails) exceeding the LLM token budget | High | Process emails in batches of 50; summarize each batch separately |

**Task 5.3 — Transcript Digestion Specific Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Inaccurate transcription due to background noise | Medium | Use a noise-reduction pre-processing step before passing audio to the STT model |
| Large audio files (>1GB) causing processing timeouts | High | Split files larger than 100MB into 10-minute chunks before processing |

**Task 5.4 — Memory DB Population Specific Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Data corruption during ingestion | High | Use PostgreSQL transactions for all inserts; roll back on any error |
| SQL injection if inputs are not sanitized | Critical | Use Drizzle ORM parameterized queries exclusively |

---

### Tasks 5.5–5.12 — Creative & Technical Production Skills

| Task | Skill | Liturgy Schedule | Key Dependency |
|---|---|---|---|
| 5.5 | Project Planning | Weekdays at 9:00 AM | Task 5.19 |
| 5.6 | Code Writing | On-demand | Task 5.19 |
| 5.7 | API Integration | On-demand | Task 5.19 |
| 5.8 | Content Generation | On-demand | Task 5.19 |
| 5.9 | Audio Production (11 Labs) | On-demand | Task 5.19 |
| 5.10 | Image Generation | On-demand | Task 5.19 |
| 5.11 | Animation Generation | On-demand | Task 5.19 |
| 5.12 | Editorial Coordination | Weekly | Task 5.19 |

**Shared Risks Across All Production Skills:**

| Risk | Severity | Mitigation |
|---|---|---|
| External API rate limits (GitHub, Namecheap, Vercel, 11 Labs) causing skill failures | High | Implement per-API rate limit tracking; queue requests when approaching limits |
| Generated content (code, audio, images) not passing `ActionValidator` before delivery | Critical | Every output from a production skill must pass through `ActionValidator` before being committed or sent |
| Cost overruns from high-volume API calls to paid services | Medium | Implement a monthly cost cap per API; alert the sovereign when 80% of the cap is reached |

**Task 5.6 — Code Writing Specific Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Sandboxed code execution escaping the sandbox | Critical | Use Docker containers with `--network none` and `--read-only` filesystem for all code execution |
| Malicious code committed to GitHub without sovereign review | Critical | All GitHub commits require a `validate_action` FFI call with the diff as the payload; no auto-push |

**Task 5.9 — Audio Production Specific Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| 11 Labs API key exposed in logs | Critical | Store the key in `secrets.rs`; never log it; rotate it quarterly |
| Voice cloning used without sovereign approval | Critical | Require explicit `ActionValidator` approval for any voice cloning request |

---

### Tasks 5.13–5.15 — Intelligence Skills (News, Financial, Trading)

| Task | Skill | Liturgy Schedule | Key Dependency |
|---|---|---|---|
| 5.13 | News Monitoring | Every 2 hours | Task 5.19 |
| 5.14 | Financial Data Watching | Every 15 minutes (market hours) | Task 5.19 |
| 5.15 | Day Trading Intelligence | On-demand (market hours only) | Tasks 5.19 + 5.14 |

**Shared Risks Across Intelligence Skills:**

| Risk | Severity | Mitigation |
|---|---|---|
| Financial data used to make autonomous trades without sovereign approval | Critical | Task 5.15 is **advisory only** — it generates recommendations, never executes trades; all execution requires explicit sovereign approval |
| News sources returning biased or false information | High | Cross-reference at least 3 independent sources before including a story in the briefing |
| Financial API rate limits during high-volatility market periods | High | Cache the last known price; use the cache if the API is rate-limited, with a clear "stale data" indicator |

**Task 5.15 — Day Trading Intelligence Specific Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Recommendation acting on stale financial data | Critical | Timestamp all data points; reject any data older than 60 seconds for trading recommendations |
| Overconfident recommendations leading to financial loss | High | Include confidence intervals and risk scores in every recommendation; never present a recommendation as certain |

---

### Tasks 5.16–5.18 — Communications Skills (Phone, Scheduling, Messaging)

| Task | Skill | Liturgy Schedule | Key Dependency |
|---|---|---|---|
| 5.16 | Phone Call Management | On-demand | Task 5.19 |
| 5.17 | Meeting Scheduling | On-demand | Task 5.19 |
| 5.18 | Message App Management | Every 15 minutes | Task 5.19 |

**Shared Risks Across Communications Skills:**

| Risk | Severity | Mitigation |
|---|---|---|
| Agent sending messages or scheduling meetings without sovereign approval | Critical | All outbound communications require a `validate_action` FFI call; no auto-send |
| Personal contact data (phone numbers, email addresses) stored without encryption | Critical | All contact data stored via FHE; never in plaintext in the database |
| Communications agent impersonating the sovereign without disclosure | Critical | All agent-generated messages must include a disclosure footer: "Sent by MetaCanon Agent on behalf of [Sovereign Name]" |

**Task 5.16 — Phone Call Management Specific Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Call recording without consent violating wiretapping laws | Critical | Display a consent notice at the start of every recorded call; store the consent record |
| Voice synthesis used to impersonate the sovereign on a call | Critical | Voice synthesis on phone calls requires a two-factor confirmation from the sovereign |

---

## Cross-Track Critical Path Summary

The following table shows the minimum set of tasks that must be completed before any agent skill can run end-to-end:

| Step | Task | Track | Estimated Effort |
|---|---|---|---|
| 1 | 1.1 — Async `main.rs` refactor | Rust Core | 2 days |
| 2 | 1.2 — `TaskSubSphere` lifecycle | Rust Core | 3 days |
| 3 | 1.3 — `ActionValidator` gate | Rust Core | 2 days |
| 4 | 2.5 — PostgreSQL migrations | Node.js Engine | 2 days |
| 5 | 1.6 — `napi-rs` FFI bridge | Rust Core | 3 days |
| 6 | 2.1 — `SphereConductor` | Node.js Engine | 3 days |
| 7 | 2.2 — `HybridExecutionRouter` | Node.js Engine | 2 days |
| 8 | 2.8 — `OrchestrationService` | Node.js Engine | 2 days |
| 9 | 5.19 — Shared `AgentConfig` utilities | Agent Skills | 1 day |
| **Total** | | | **~20 developer-days** |

Only after all 9 steps above are complete can any of the 18 individual agent skills (Tasks 5.1–5.18) be implemented. Those 18 tasks can then be parallelized across multiple developers.

---

*This document covers Tracks 1, 2, 4, and 5. For Tracks 3 and 6 (Installer UI and Website Backend), see `dependencies_and_risks_summary.md`.*
