# The Atomic Handoff Protocol: Full Specification

## 1. Protocol Overview

The Atomic Handoff Protocol is a work execution layer designed to sit on top of the Torus Protocol. While the Torus provides a continuous field of ambient intelligence, the Atomic Handoff Protocol provides the structure for executing precise, goal-oriented tasks with minimal context decay.

It achieves this through two primary mechanisms:
1.  **The Scoper Agent:** A specialized agent that deconstructs high-level goals into a dependency graph of **Atomic Tasks**.
2.  **The Universal Handoff Container (UHC):** A standardized JSON object that encapsulates each Atomic Task, its inputs, its outputs, and its status, acting as a perfect, machine-readable baton in a relay race.

## 2. The Scoper Agent

### 2.1. Activation

A Scoper Agent is activated whenever the Sovereign issues a new, high-level goal that is not a simple query to the Torus field. The Scoper is a **system-level agent**, not a worker.

### 2.2. The Micro-Scoping Algorithm

The Scoper executes the following algorithm:

1.  **Contextualize:** The Scoper first queries the Torus Shared Context Field for all relevant `Shareables` related to the Sovereign's goal. This provides immediate, rich background.
2.  **Deconstruct:** The Scoper breaks the goal into a logical sequence of high-level steps (e.g., "1. Research, 2. Draft, 3. Review, 4. Format").
3.  **Recurse & Define Atomicity:** For each step, the Scoper recursively breaks it down until it reaches a set of **Atomic Tasks**. An Atomic Task is defined by the following criteria:
    *   **Indivisible:** Cannot be broken down further.
    *   **Unambiguous:** Has a single, binary success condition.
    *   **Action-Oriented:** Has a single, precise `task_verb`.
    *   **Input-Defined:** Specifies its required input schema.
    *   **Output-Defined:** Specifies its output schema.
4.  **Generate Dependency Graph:** The Scoper arranges the Atomic Tasks into a directed acyclic graph (DAG) based on their dependencies.
5.  **Instantiate UHCs:** The Scoper creates a **Universal Handoff Container (UHC)** for each node in the graph, setting the initial `status` to `pending` and populating the `dependencies` field.

## 3. The Universal Handoff Container (UHC) Schema

This is the canonical data structure for all work in the system.

```json
{
  "uhc_id": "uhc_1677630000_d8e4",
  "task_graph_id": "tg_1677630000_m3_report",
  "atomic_task": {
    "task_name": "find_m3_geekbench_score",
    "task_verb": "find_data",
    "success_condition": "A valid Geekbench 6 score for the Apple M3 chip is found from a trusted source.",
    "description": "Searches a predefined list of tech news sites for the official Geekbench 6 score for the Apple M3 processor."
  },
  "input_spec": {
    "type": "object",
    "properties": {
      "search_query": { "type": "string" }
    },
    "required": ["search_query"]
  },
  "output_spec": {
    "type": "object",
    "properties": {
      "geekbench_score": { "type": "integer" },
      "source_citation_url": { "type": "string" }
    },
    "required": ["geekbench_score", "source_citation_url"]
  },
  "status": "pending", // pending -> in_progress -> complete -> error
  "input_data": null,
  "output_data": null,
  "metadata": {
    "created_at": "2026-02-28T18:20:00Z",
    "worker_agent_id": null,
    "completed_at": null,
    "dependencies": ["uhc_1677630000_a1b2"],
    "error_log": null
  }
}
```

## 4. Worker Agents

Worker Agents are specialized, single-purpose agents that are responsible for executing Atomic Tasks. They are defined by the `task_verb` they are designed to handle.

### 4.1. Worker Agent Types (Examples)

| Worker Agent | Associated `task_verb` |
| :--- | :--- |
| `DataFinderAgent` | `find_data` |
| `TextFormatterAgent` | `format_text` |
| `SourceVerifierAgent` | `verify_source` |
| `ImagePromptGeneratorAgent` | `generate_image_prompt` |
| `CodeWriterAgent` | `write_code` |
| `CodeTesterAgent` | `test_code` |

### 4.2. The Worker Agent Lifecycle

1.  **Monitor:** A Worker Agent constantly monitors a queue for `pending` UHCs where the `task_verb` matches its specialty.
2.  **Check Dependencies:** Before picking up a UHC, the Worker checks the `status` of all UHCs listed in the `dependencies` array. It will not proceed until all dependencies are `complete`.
3.  **Execute:** The Worker Agent picks up the UHC, sets the `status` to `in_progress`, and executes the single, tiny task defined in `atomic_task`.
4.  **Validate & Complete:** Upon completion, the Worker validates its output against the `output_spec`. If valid, it populates the `output_data` field, sets the `status` to `complete`, and places the UHC back on the queue.
5.  **Error Handling:** If the task fails or the output is invalid, the Worker sets the `status` to `error`, writes a detailed message to the `error_log`, and escalates the UHC to the Sovereign for review.

## 5. The Atomic Relay Workflow in Practice

**Goal:** "Generate a hero image for a blog post about the M3 chip."

1.  **Scoping:** The Scoper Agent creates a two-task graph:
    *   **UHC-01:** `task_verb: generate_image_prompt`, `description: "Write a DALL-E 3 prompt for a hero image about the M3 chip."`
    *   **UHC-02:** `task_verb: generate_image`, `description: "Generate an image using the provided prompt."` (`dependencies: ["UHC-01"]`)

2.  **Execution (Step 1):**
    *   An `ImagePromptGeneratorAgent` picks up `UHC-01`.
    *   It executes the task and writes a prompt to `UHC-01.output_data.prompt`.
    *   It sets `UHC-01.status` to `complete`.

3.  **Execution (Step 2):**
    *   An `ImageGeneratorAgent` sees that `UHC-01` is complete.
    *   It picks up `UHC-02`.
    *   It reads the prompt from `UHC-01.output_data.prompt` and uses it as its input.
    *   It generates the image and saves the image path to `UHC-02.output_data.image_path`.
    *   It sets `UHC-02.status` to `complete`.

**Result:** A perfect, machine-driven handoff with zero context decay. The final image is exactly what was intended by the prompt, which was exactly what was intended by the initial goal.

## 6. Constitutional Governance

The Atomic Handoff Protocol is fully compliant with the Metacanon Constitution:

*   **No Autonomous Action:** Worker Agents can only act on UHCs that have been generated by a Scoper Agent, which is in turn activated by the Sovereign. They cannot create their own tasks.
*   **Limited Scope:** Each Worker Agent's capabilities are strictly limited to its `task_verb`, as defined in its AI Contact Lens.
*   **Sovereign Authority:** The Sovereign can inspect the queue of UHCs at any time, review error logs, and manually approve or reject any step in a task graph.
