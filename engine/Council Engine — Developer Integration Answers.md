# Council Engine — Developer Integration Answers

This document answers the specific integration questions raised during build. Each section provides the exact values, rationale, and implementation notes needed to proceed.

---

## 1. Morpheus API Details

### Base URL

```
https://api.mor.org/api/v1
```

This is a fully OpenAI-compatible endpoint. Any OpenAI SDK client works out of the box — just change the base URL and API key.

### Authentication

```
Authorization: Bearer sk-xxxxxxxx
```

Keys are created at [app.mor.org](https://app.mor.org). Keys begin with `sk-`.

### Model for Generation (Perspective Responses)

```
hermes-3-llama-3.1-405b
```

This is the flagship general-purpose model on Morpheus. 128K context window, web search capable. It has the depth and nuance needed for the 12 epistemological lenses — each perspective response needs to feel genuinely distinct, not like the same model wearing different hats. The 405B parameter count gives it the range to convincingly inhabit The Logician's formal deduction versus The Absurdist's paradox-driven chaos.

**Fallback model:** `qwen3-235b` (128K context, strong reasoning, slightly faster).

### Model for Orchestrator (Synthesis, Clash Detection, Summaries)

```
venice-uncensored
```

Venice Uncensored is available directly on Morpheus (same model as Venice AI's standalone service). 32K context window. The orchestrator does not need 128K context — it processes structured inputs (player responses, already summarized) and produces structured outputs (synthesis artifacts, clash detection). The uncensored variant is preferred because the orchestrator must be willing to surface uncomfortable tensions, preserve genuine dissent, and avoid the "helpful assistant" tendency to smooth over real disagreements.

**Important:** This means Morpheus can serve as a single provider for both generation and orchestration. No need for a separate Venice API key if using Morpheus.

### Web Search Variants

Every model on Morpheus has a `:web` variant (e.g., `hermes-3-llama-3.1-405b:web`) that enables real-time web search. Not needed for the Council Engine — all inputs come from players, not the internet — but worth knowing for future extensions.

### Pricing

Morpheus is currently **free during Open Beta**. Billing is coming but not yet active. Build and test now at zero cost.

---

## 2. Groq Model Names

### Generation Model

```
llama-3.3-70b-versatile
```

Confirmed. This is the right model for perspective generation on Groq. Fast inference, good quality, 128K context. The 70B parameter count is smaller than Morpheus's 405B, so expect slightly less nuance in the epistemological differentiation — but Groq's speed advantage (sub-second latency) makes it the better choice for the live deliberation's streaming synthesis.

### Orchestrator Model

Groq should handle the orchestrator too when Groq is the selected provider. Use the same model:

```
llama-3.3-70b-versatile
```

**Rationale:** Keeping the orchestrator on the same provider as generation avoids cross-provider latency during the live deliberation. The orchestrator calls happen in sequence during the three-act stream — Act 1 (position summaries), Act 2 (clash detection), Act 3 (synthesis). Routing these to a different provider would add network hops and potential failure points during the most latency-sensitive moment of the game.

**Exception:** If you want the orchestrator to be uncensored (to avoid smoothing over dissent), and Groq's content filtering is too aggressive, fall back to Venice Uncensored via Morpheus for orchestrator calls only. This is a judgment call during testing.

### Fallback API Key (Groq)

The fallback Groq API key for v2 of the system:

```
gsk_REDACTED
```

This key is used in the retry/fallback protocol: fire the primary key, wait 15 seconds, if no response, switch models and fire again using this fallback key.

---

## 3. Toggle Behavior

### Recommendation: Per-Game via Host Dashboard UI

The provider should be selectable **per game** by the host, not locked globally via env. Here is why:

The host may want to use Morpheus (free, 405B quality) for weekly games where token cost matters over a season, but switch to Groq (fast, sub-second) for instant games where the live deliberation needs to feel snappy. Different games have different performance profiles.

### Implementation

The host's "Create Game" form includes a **Provider** dropdown with three options:

| Option | Generation Model | Orchestrator Model | When to Use |
|---|---|---|---|
| Morpheus | `hermes-3-llama-3.1-405b` | `venice-uncensored` | Weekly games, quality priority, free during beta |
| Groq | `llama-3.3-70b-versatile` | `llama-3.3-70b-versatile` | Instant games, speed priority |
| Auto | Morpheus for generation, Groq for orchestrator | Mixed | Best of both — deep perspectives, fast synthesis |

The **env variable** `LLM_PROVIDER` still exists as the **default** — it sets what the dropdown pre-selects. But the host can override it per game. The game record stores the chosen provider so the deliberation engine knows which adapter to use.

```env
# .env — sets the default, host can override per game
LLM_PROVIDER=morpheus
MORPHEUS_API_KEY=sk-xxxxxxxx
GROQ_API_KEY=gsk_xxxxxxxx
GROQ_FALLBACK_API_KEY=gsk_REDACTED
```

### Firing Protocol

When firing API calls, regardless of provider:

1. Fire the primary key.
2. Wait 15 seconds.
3. If no response, switch to the fallback model on the same provider and fire again.
4. If still no response after another 15 seconds, switch to the alternate provider entirely.

For sequential wave firing (the 12 perspective hints on Monday), fire them **one second apart**, not simultaneously. This avoids rate limiting and allows the 15-second health check to catch failures early.

---

## 4. GoHighLevel Email Integration

### Confirm: Use the GHL API, Not SMTP

**Confirmed — use the GHL Conversations API, not SMTP.** The endpoint is:

```
POST https://services.leadconnectorhq.com/conversations/messages
```

### Authentication

```
Authorization: Bearer <GHL_API_TOKEN>
Version: 2021-04-15
```

The token must be a **Sub-Account Token** (either OAuth Access Token or Private Integration Token) with the `conversations/message.write` scope.

### Required Fields for Sending Email

```json
{
  "type": "Email",
  "contactId": "<ghl_contact_id>",
  "emailFrom": "council@yourdomain.com",
  "subject": "Your Lens Assignment — The Skeptic",
  "html": "<p>HTML email body here</p>",
  "status": "pending"
}
```

### Critical Constraint: Recipients Must Be GHL Contacts

The GHL email API requires a `contactId` — you cannot send to arbitrary email addresses. Every player must exist as a contact in the GHL location. This means the player signup flow must include a GHL contact creation step:

1. Player signs up with their email on the Council Course website.
2. The engine calls the GHL Contacts API to create or find the contact:
   ```
   POST https://services.leadconnectorhq.com/contacts/
   ```
3. The returned `contactId` is stored in the `players` table alongside the player's email and name.
4. All subsequent emails (Monday hints, follow-up instructions, Friday reminders) use this `contactId`.

### Location ID and From Address

These are specific to your GHL account. The developer needs:

| Field | Value | Where to Find |
|---|---|---|
| `locationId` | *(you must provide this)* | GHL Dashboard → Settings → Business Info → Location ID |
| `emailFrom` | *(you must provide this)* | The verified sending email in your GHL location |
| From Name | *(you must provide this)* | e.g., "The Council" or "Council Course" |

**Action required:** Provide your GHL `locationId` and the verified sender email address. The developer cannot proceed with email integration without these two values.

### GHL Base URL

```
https://services.leadconnectorhq.com
```

This is the standard base URL for all GHL API v2 calls. No custom endpoint needed.

### Optional: Email Templates

GHL supports template IDs (`templateId` field). If you want to pre-design the Monday hint email, Friday reminder, and follow-up instruction email as GHL templates with merge fields, the engine can reference them by ID instead of sending raw HTML. This gives you visual control over email design without touching code.

---

## 5. Lens Pack JSON

The complete Hands of the Void lens pack JSON has been generated and is available at:

```
/home/ubuntu/hands-of-the-void.json
```

This file contains all 12 lenses with:

- Seat number, avatar name, epistemology label, and family classification
- Signature color (name and hex)
- Full philosophy (core quote, worldview paragraph, closing quote)
- Visual identity (motifs array and arena presence description)
- Prompt templates (system prompt, hint instruction, follow-up instruction) for each lens
- Orchestrator prompts (synthesis, clash detection, position summary)
- Family groupings (analytical, creative, critical, integrative) with seat assignments

The file is ready to be copied into the engine's `/config/` directory as the default lens pack.

### File Structure

```json
{
  "pack_id": "hands-of-the-void",
  "pack_name": "Hands of the Void — Council of Twelve",
  "total_seats": 12,
  "families": { ... },
  "lenses": [ ... ],
  "orchestrator": { ... }
}
```

### How to Create a New Lens Pack

Duplicate `hands-of-the-void.json`, change the `pack_id`, replace the `lenses` array with new avatar definitions, and update the `families` groupings. The engine reads whichever pack is specified in the game's `config.lens_pack` field. Zero code changes required.

---

## Summary of Action Items

| Item | Status | Who |
|---|---|---|
| Morpheus base URL and models | Answered above | Developer can proceed |
| Groq model names | Confirmed above | Developer can proceed |
| Fallback API key | Provided above | Developer can proceed |
| Toggle behavior | Per-game UI toggle, env as default | Developer can proceed |
| GHL API (not SMTP) | Confirmed above | Developer can proceed |
| GHL `locationId` | **Needed from you** | You must provide |
| GHL verified sender email | **Needed from you** | You must provide |
| GHL API token | **Needed from you** | You must provide or set as env secret |
| Lens pack JSON | Generated, ready at `/home/ubuntu/hands-of-the-void.json` | Developer can copy into `/config/` |

The three items marked "Needed from you" are the only blockers. Everything else is ready to build.
