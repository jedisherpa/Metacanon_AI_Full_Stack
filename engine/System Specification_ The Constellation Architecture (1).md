# System Specification: The Constellation Architecture

**Document Purpose:** This document provides a complete, plain-English specification for implementing the 64-lens Constellation System within the Manus AI environment. It is designed to be clear and comprehensive enough for any developer or sufficiently advanced AI agent to build the entire system from scratch.

---

## 1. System Overview

The Constellation System is a modular, constitutionally-governed, multi-agent deliberation framework. Its purpose is to allow a user to assemble and run fit-for-purpose advisory councils (called "constellations") to analyze complex problems.

The architecture is composed of three distinct layers:

1.  **The Data Layer:** A structured library of text files that define the agent personas and the pre-designed councils (constellations). This layer is designed to be easily extended without modifying the core logic.
2.  **The Designer Skill (`constellation-designer`):** A user-facing skill that acts as an interactive guide to the system. It helps the user explore the available constellations and select the most appropriate one for their problem.
3.  **The Orchestrator Skill (`constitutional-orchestrator`):** The core engine that takes a list of agent personas and a deliberation topic, and then facilitates a structured, multi-agent deliberation governed by a foundational constitutional document.

---

## 2. The Data Layer: Specification

The entire system is built upon a library of structured text files. The integrity of this data layer is critical.

### 2.1. Directory Structure

The system requires three specific directories in the `/home/ubuntu/` directory:

-   `/home/ubuntu/constitution/`: This directory holds the core governance documents. It must contain `v3.0_Metacanon_Constitution.md`.
-   `/home/ubuntu/councils/`: This directory contains subdirectories for each "council pack." Each subdirectory holds the agent persona files for that group (e.g., `/councils/project-managers-board/`).
-   `/home/ubuntu/constellations/`: This directory will hold the JSON definition files for each of the 21 pre-designed constellations.

### 2.2. Agent Persona Files

-   **Location:** Stored within the subdirectories of `/home/ubuntu/councils/`.
-   **Format:** Persona files can be either Markdown (`.md`) or Microsoft Word (`.docx`). The system must be able to parse both.
-   **Content:** Each file contains the complete definition of a single agent persona, including its worldview, strengths, and characteristic questions. This is the text that will be used to prompt the agent during a deliberation.

### 2.3. Constellation Definition Files

-   **Location:** `/home/ubuntu/constellations/`
-   **Format:** Each constellation is defined by a single JSON file.
-   **Naming Convention:** Files should be named descriptively (e.g., `tetrahedron-1-first-principles.json`).
-   **JSON Schema:** Each JSON file must adhere to the following structure:

```json
{
  "name": "String: The full, human-readable name of the constellation.",
  "type": "String: The geometric type (e.g., 'Tetrahedron', 'Octahedron').",
  "purpose": "String: A concise, one-sentence description of what this council is designed to do. This is critical for the recommendation engine.",
  "project_manager": "String: The full, absolute file path to the persona file for the designated Project Manager.",
  "members": [
    {
      "role": "String: The human-readable role of this member in the council.",
      "lens_path": "String: The full, absolute file path to the agent persona file for this member."
    },
    {
      "role": "String: The human-readable role of this member in the council.",
      "lens_path": "String: The full, absolute file path to the agent persona file for this member."
    }
  ]
}
```

---

## 3. Skill 1: `constellation-designer` (New Skill)

**Purpose:** To provide a user-friendly interface for navigating the Constellation System.

This skill must implement three core commands.

### 3.1. Command: `list constellations`

-   **Action:** When invoked, this command will:
    1.  Scan the `/home/ubuntu/constellations/` directory.
    2.  Read every JSON file.
    3.  Extract the `name`, `type`, and `purpose` fields from each file.
    4.  Present the information to the user in a clean, tabular format.

### 3.2. Command: `show constellation "<constellation_name>"`

-   **Argument:** The exact name of a constellation (as a string).
-   **Action:** When invoked, this command will:
    1.  Find the JSON file in `/home/ubuntu/constellations/` whose `name` field matches the user's input.
    2.  Parse the JSON file.
    3.  Display a detailed summary, including:
        -   Name, Type, and Purpose.
        -   The designated Project Manager (from the `project_manager` field).
        -   A list of all council members, showing their `role` and the base name of their `lens_path` file.

### 3.3. Command: `recommend constellation for "<problem_description>"`

-   **Argument:** A natural language string describing the user's problem.
-   **Action:** This is the most complex command. It requires an LLM call to function as a recommendation engine.
    1.  Scan the `/home/ubuntu/constellations/` directory and read every JSON file.
    2.  For each file, extract the `name` and `purpose` fields.
    3.  Construct a prompt for an LLM. This prompt must include:
        -   The user's `<problem_description>`.
        -   The list of all available constellation names and their corresponding `purpose` descriptions.
        -   A clear instruction: "Analyze the user's problem and determine which of the following constellations is the most appropriate tool to solve it. Respond with only the name of the best-fit constellation and a brief, one-sentence justification for your choice."
    4.  Execute the LLM call.
    5.  Parse the LLM's response to get the recommended constellation name.
    6.  Present the recommendation to the user, including the justification.

---

## 4. Skill 2: `constitutional-orchestrator` (Version 2.0)

**Purpose:** To be the core engine that runs the multi-agent deliberations.

This skill must be updated to handle two distinct invocation methods.

### 4.1. Invocation Method A: By Constellation Name

-   **User Input:** A constellation name and a deliberation topic.
    -   *Example: "Run the 'Star Tetrahedron 1: The Go-to-Market Engine' on the topic of launching our new AI product."
-   **Execution Logic:**
    1.  Identify the constellation name in the user's prompt.
    2.  Find the corresponding JSON definition file in `/home/ubuntu/constellations/`.
    3.  Parse the JSON file to get the list of all agent file paths (including the `project_manager` and all `members`).
    4.  Proceed to the **Final Orchestration Assembly** step (see 4.3).

### 4.2. Invocation Method B: By Custom Agent List

-   **User Input:** A list of agent persona file paths and a deliberation topic.
    -   *Example: "Run a deliberation with agents `/councils/pauls-board/01.md` and `/councils/pm-board/06.md` on the topic of crisis management."
-   **Execution Logic:**
    1.  Parse the user's prompt to extract the list of file paths.
    2.  Validate that each file path exists.
    3.  Proceed to the **Final Orchestration Assembly** step (see 4.3).

### 4.3. Final Orchestration Assembly (Common Step)

This is the core logic that runs after the list of agent personas has been determined.

1.  **Load Constitution:** Read the full text content of `/home/ubuntu/constitution/v3.0_Metacanon_Constitution.md` into a string variable.
2.  **Load Personas:** For each agent file path in the list:
    -   Read the full text content of the file (whether `.md` or `.docx`).
    -   Store the content in a list or dictionary, associated with the agent's role or filename.
3.  **Construct Master Prompt:** Assemble a single, large prompt for the master orchestrator LLM. This prompt must contain:
    -   The full text of the Metacanon Constitution.
    -   A clear declaration of all participating agents, including their full persona definitions.
    -   The user's deliberation topic.
    -   A clear instruction to begin the deliberation, following the rules of the constitution and the defined agent roles.
4.  **Execute Deliberation:** Send the master prompt to the appropriate multi-agent processing engine and stream the results back to the user.

---

## 5. End-to-End Example Workflow

1.  **User:** "I need to design a brand for a new coffee company that appeals to Gen Z."
2.  **Manus (invoking `constellation-designer`'s `recommend` command):** Internally, Manus constructs an LLM prompt with the user's problem and the list of 21 constellation purposes. The LLM identifies the "Brand Soul" council as the best fit.
3.  **Manus (responding to user):** "I recommend using the **Octahedron 1: The 'Brand Soul' Council**. This council is designed to define the deep, authentic soul of a new brand and includes lenses for purpose, storytelling, cultural relevance, and community building. Would you like to proceed?"
4.  **User:** "Yes."
5.  **Manus (invoking `constitutional-orchestrator` by name):**
    -   Finds `octahedron-1-brand-soul.json`.
    -   Parses the file to get the 6 agent persona paths.
    -   Loads the Metacanon Constitution.
    -   Loads the full text of all 6 persona files.
    -   Assembles the master prompt.
    -   Executes the deliberation.
6.  **Manus (streaming output to user):** "Initializing the 'Brand Soul' Council. The deliberation will now begin under the governance of the Metacanon Constitution... [… output... […].""]))) the Metacanon Constitution... [deliberation output follows]"
