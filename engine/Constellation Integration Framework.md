# Constellation Integration Framework
### How the 21 Constellation Definitions Connect to the Manus Skill Development System

---

## 1. The Core Principle: Separation of Data and Logic

The entire Constellation System is built on a single, fundamental principle: **data and logic must be kept separate.** This is not merely a technical preference — it is the architectural decision that makes the system extensible, maintainable, and safe.

**Logic** lives in the **Skills** (`constellation-designer`, `constitutional-orchestrator`). These skills contain procedural instructions for *how* to do things: how to scan a directory, how to recommend a council, how to assemble a deliberation prompt, how to enforce constitutional governance.

**Data** lives in the **files** — the 21 JSON constellation definitions in `/home/ubuntu/constellations/`, the 64 agent persona files in `/home/ubuntu/councils/`, and the governance documents in `/home/ubuntu/constitution/`. These files contain declarative information about *what* exists: what councils are available, who is in them, what their purpose is, and what rules govern their operation.

The practical consequence of this separation is significant: you can add a new constellation, modify an agent persona, or create an entirely new council pack without ever touching the code or instructions inside the skills themselves. The skills treat the data directories as a live database, reading from them fresh on every invocation.

---

## 2. The Three-Layer Architecture

The system is organized into three distinct layers, each with a specific responsibility.

| Layer | Location | Contents | Responsibility |
|---|---|---|---|
| **Governance Layer** | `/home/ubuntu/constitution/` | `v3.0_Metacanon_Constitution.md` and supporting docs | Defines the rules under which all deliberations operate |
| **Data Layer** | `/home/ubuntu/councils/` and `/home/ubuntu/constellations/` | 64 agent persona files and 21 JSON constellation definitions | Defines who the agents are and how they are grouped |
| **Logic Layer** | `/home/ubuntu/skills/` | `constellation-designer`, `constitutional-orchestrator`, `council-pack-creator` | Defines how to navigate, assemble, and run deliberations |

These layers interact in a strict one-way dependency: the Logic Layer reads from the Data Layer, and the Data Layer is governed by the Governance Layer. No layer modifies the layer above it.

---

## 3. The JSON Schema: The System's Lingua Franca

The 21 JSON files are the connective tissue of the entire system. They are the single artifact that both the user-facing designer skill and the back-end orchestrator skill read from. Understanding the schema is essential to understanding how the integration works.

Every JSON file adheres to this structure:

```json
{
  "name": "Octahedron 1: The \"Brand Soul\" Council",
  "type": "Octahedron",
  "purpose": "To define the deep, authentic, and resonant soul of a new brand — from its core purpose to its visual expression.",
  "project_manager": "/home/ubuntu/councils/project-managers-board/07_Servant_Leadership_Facilitator_Lens.md",
  "members": [
    {
      "role": "The Why-Finder",
      "lens_path": "/home/ubuntu/councils/marketing-branding-board/01_Start_With_Why_And_Golden_Circle_Lens.docx"
    },
    {
      "role": "The Storyteller",
      "lens_path": "/home/ubuntu/councils/marketing-branding-board/08_Resonate_And_Storytelling_Lens.docx"
    }
  ]
}
```

Each field serves a distinct function in the integration:

| Field | Type | Used By | Purpose in Integration |
|---|---|---|---|
| `name` | String | Designer (display), Orchestrator (lookup) | The unique identifier for the council. The orchestrator finds the right JSON file by matching this field against the user's request. |
| `type` | String | Designer (display) | The geometric classification. Used for filtering and display in the `list` command. |
| `purpose` | String | Designer (recommendation engine) | The semantic payload for the LLM-powered recommendation command. This one sentence is what the LLM reads to determine if this council fits the user's problem. |
| `project_manager` | String (file path) | Orchestrator (execution) | An absolute file path pointer to the PM persona file. The orchestrator reads this file to load the PM's full persona text into the deliberation prompt. |
| `members[].role` | String | Orchestrator (display), Designer (detail view) | The human-readable title for this agent within this specific council. Used in the deliberation prompt header and in the `show` command output. |
| `members[].lens_path` | String (file path) | Orchestrator (execution) | An absolute file path pointer to the agent's persona file. The orchestrator reads this file to load the agent's full persona text into the deliberation prompt. |

The `purpose` field and the `lens_path` fields are the two most critical. The `purpose` field is the key to intelligent recommendation; the `lens_path` fields are the keys to execution.

---

## 4. Integration with the `constellation-designer` Skill

The `constellation-designer` skill is the **read-only interface** to the constellation database. It never modifies the JSON files; it only reads them to help the user navigate the system.

### 4.1. The `list constellations` Command

When a user asks to see all available councils, the skill performs a directory scan of `/home/ubuntu/constellations/`, reads every JSON file it finds, and extracts the `name`, `type`, and `purpose` fields from each one. The result is a table that gives the user a complete map of the system at a glance. Because the scan is live, any new JSON file added to the directory will appear in this list automatically.

### 4.2. The `show constellation` Command

When a user asks for details about a specific council, the skill finds the matching JSON file by comparing the user's input against the `name` field of each file. It then reads the full JSON and formats it into a detailed summary: the council's purpose, the PM's role and lens, and the full list of member roles and their lens names. This command is the bridge between the abstract constellation name and the concrete list of agents it contains.

### 4.3. The `recommend constellation for` Command

This is the most sophisticated integration point. The skill reads all 21 JSON files and extracts the `name` and `purpose` fields from each one. It then constructs a prompt for an LLM that contains the user's problem description alongside all 21 name-purpose pairs. The LLM is instructed to identify which `purpose` statement is the best semantic match for the user's problem and to return the corresponding `name`. The skill then presents this recommendation to the user with a one-sentence justification.

The critical insight here is that the `purpose` field in the JSON schema is not just metadata — it is the training data for the recommendation engine. Writing a precise, specific `purpose` statement for each constellation directly improves the quality of the recommendations the system produces.

---

## 5. Integration with the `constitutional-orchestrator` Skill

If the designer is the interface, the orchestrator is the **execution engine**. It takes a constellation definition and brings it to life as a structured, constitutionally-governed multi-agent deliberation.

### 5.1. Invocation by Constellation Name

The most common invocation path begins with the user accepting a recommendation from the designer skill. The orchestrator receives the constellation's `name` and the user's deliberation topic.

The execution sequence is as follows:

1. **JSON Lookup:** The orchestrator scans `/home/ubuntu/constellations/` for the JSON file whose `name` field matches the provided name.
2. **Manifest Extraction:** It parses the JSON and builds a complete list of file paths — one from `project_manager` and one from each `members[].lens_path` entry. This list is the council's "manifest."
3. **Constitution Load:** It reads the full text of `/home/ubuntu/constitution/v3.0_Metacanon_Constitution.md` into memory.
4. **Persona Load:** It iterates through the manifest, reading the full text content of each agent persona file. Both `.md` and `.docx` formats are supported.
5. **Prompt Assembly:** It constructs a master prompt that includes the full constitution text, the full text of every agent persona (labeled with their `role`), and the user's deliberation topic.
6. **Deliberation Execution:** It sends the master prompt to the LLM processing engine and streams the structured deliberation output back to the user.

The JSON file acts as a **manifest** in this process — a compact, machine-readable bill of materials that tells the orchestrator exactly which persona files to load, in what roles, and under what governance framework.

### 5.2. Invocation by Custom Agent List

The orchestrator also supports a second invocation path: the user provides a custom list of agent persona file paths directly, bypassing the JSON constellation system entirely. This path is used when the user wants to assemble a one-off council that does not correspond to any pre-designed constellation. In this case, the orchestrator skips the JSON lookup step and proceeds directly to the constitution load and persona load steps with the user-provided file paths.

This dual invocation design means the JSON constellations are a convenience layer, not a constraint. The system is fully open.

---

## 6. Integration with the `council-pack-creator` Skill

The `council-pack-creator` skill sits alongside the constellation system as a **custom assembly tool**. While the constellation JSON files define 21 pre-designed councils, the `council-pack-creator` allows a user to design their own council from scratch and save it as a reusable project folder.

The integration point is indirect but important: the `council-pack-creator` produces a project folder containing agent persona files and a `MANUS_INSTRUCTIONS.md` file. This output is compatible with the `constitutional-orchestrator`'s custom invocation path. A user can also, after using the `council-pack-creator`, manually create a new JSON constellation definition file for their custom council, adding it to `/home/ubuntu/constellations/` and making it a permanent, named part of the system.

This creates a **feedback loop** between the custom assembly tool and the constellation library: user-designed councils can be promoted into the canonical constellation system by formalizing them as JSON definitions.

---

## 7. The Skill Development Framework: How This System Extends Manus

Within the Manus skill development framework, the Constellation System represents a specific and replicable architectural pattern. The `skill-creator` framework defines three types of bundled resources: `scripts/` for executable code, `references/` for documentation, and `templates/` for output assets. The Constellation System uses all three in a coordinated way.

The **constellation JSON files** function as a form of `references/` — structured data that the skill reads at runtime rather than embedding in the `SKILL.md` body. This is the progressive disclosure principle applied to data: the `SKILL.md` stays lean and focused on logic, while the detailed council configurations live in external files that are loaded only when needed.

The **agent persona files** function as `templates/` — pre-built content assets that are assembled into the final output (the deliberation prompt) at execution time.

The **orchestration logic** in the `SKILL.md` files functions as the procedural `scripts/` equivalent — the step-by-step instructions that tell Manus how to combine the data assets into a coherent output.

The key contribution of this architecture to the skill development framework is the demonstration that **a skill's capabilities can be extended without modifying the skill itself**, simply by adding new data files to the directories the skill reads from. This is the principle of **open extension, closed modification** — and it is what makes the Constellation System genuinely scalable.

---

## 8. Extending the System: How to Add a New Constellation

Because of the data-logic separation, extending the system is straightforward. To add a new constellation, a developer or user needs to perform only three steps:

**Step 1 — Identify the agents.** Choose the agent persona files from the existing council packs (or create new ones) that will form the new council.

**Step 2 — Write the JSON definition.** Create a new `.json` file in `/home/ubuntu/constellations/` following the schema defined in Section 3. The most important fields to write carefully are `purpose` (for recommendation quality) and the `lens_path` entries (for execution accuracy).

**Step 3 — Verify.** Run `python3 -c "import json; json.load(open('path/to/new-file.json'))"` to validate the JSON syntax. The new constellation will be immediately discoverable by the `list` and `recommend` commands with no further action required.

No skill files need to be modified. No scripts need to be rerun. The system discovers and integrates the new constellation automatically on the next invocation.

---

## 9. Summary: The Integration Map

The following diagram describes the complete flow from a user's question to a completed deliberation, showing exactly where the JSON files are read and how they connect the three layers of the system.

```
USER: "I need help designing a brand for a new company."
        │
        ▼
[constellation-designer: recommend]
  ├── Reads all 21 JSON files from /constellations/
  ├── Extracts "name" + "purpose" from each
  ├── Sends to LLM: "Which purpose best matches the user's problem?"
  └── Returns: "Octahedron 1: The Brand Soul Council"
        │
        ▼
USER: "Yes, proceed."
        │
        ▼
[constitutional-orchestrator: run by name]
  ├── Finds octahedron-1-brand-soul.json in /constellations/
  ├── Parses JSON → extracts project_manager path + 5 lens_path entries
  ├── Reads /constitution/v3.0_Metacanon_Constitution.md
  ├── Reads all 6 agent persona files (.md and .docx)
  ├── Assembles master prompt: [Constitution] + [6 Personas] + [Topic]
  └── Executes deliberation → streams output to user
        │
        ▼
USER receives: Structured advisory document from 6 constitutionally-governed agents.
```

The JSON file is the pivot point in this entire flow. It is the artifact that translates a human-readable council name into a machine-executable list of file paths. Without it, the designer and the orchestrator would have no way to communicate. With it, the entire system operates as a coherent, self-consistent whole.
