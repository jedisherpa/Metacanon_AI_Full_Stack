# The Lens-Forging Game: Junior Developer Implementation Manual

## Introduction

This document provides a comprehensive, step-by-step guide for a junior developer to implement the core features of the Lens-Forging Game. It is the direct translation of the high-level strategic build plan—produced by a multi-pass deliberation of 10 expert AI advisors—into concrete, executable coding tasks.

The guide is broken down into three main tracks, which can be worked on in parallel:

*   **Track 1: Backend & Data:** Focuses on building the foundational data model for lens evolution and user accounts.
*   **Track 2: Frontend & Visuals:** Focuses on creating the user-facing deliberation experience, from a low-fi functional view to a high-fi animated "theater."
*   **Track 3: Weekly Cycle & Infrastructure:** Focuses on turning the game into a recurring service with features like spectator mode and replay.

By following these instructions, you will build a functional, vertical slice of the game that realizes the consensus vision of the advisory board. Each step includes file paths, code snippets, and verification steps to ensure you are on the right track.

---

# Track 1: Backend & Data

## 1. Overview & Objectives

This guide details the first major workstream for building the Lens-Forging Game: establishing the backend and data structures for **Lens Evolution**. This is the most critical part of the foundation. The core principle is **"The Gold is the JSON"** — we are building a system to create, version, and track the history of player-forged perspective lenses.

**Your mission is to:**
1.  Modify the database schema to support immutable, versioned lenses.
2.  Create new API endpoints for managing these lenses.
3.  Introduce a basic user authentication and profile system.

**Technology Stack:**
-   **Database:** PostgreSQL
-   **ORM:** Drizzle ORM
-   **Backend Framework:** Express.js
-   **Language:** TypeScript

**File Location:** All work will be done inside the `/council-engine/engine/` directory.

---

## 2. Workstream 1: The Lens Evolution Data Model

**Goal:** Extend the database to store lenses and their version history. Lenses are never updated; new versions are created, preserving a full, immutable history.

### Step 2.1: Modify the Database Schema

Open the schema definition file: `/council-engine/engine/src/db/schema.ts`.

You will add three new tables: `users`, `lenses`, and `lensVersions`.

Add the following code to the end of the file. Make sure it is inside the existing schema definitions.

```typescript
// File: /council-engine/engine/src/db/schema.ts

// ... existing schema definitions for councils, players, etc.

// NEW: User table for persistent accounts
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  hashedPassword: text("hashed_password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// NEW: Core Lens Identity table
export const lenses = pgTable("lenses", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// NEW: Immutable Lens Version History table
export const lensVersions = pgTable("lens_versions", {
  id: serial("id").primaryKey(),
  lensId: integer("lens_id").references(() => lenses.id).notNull(),
  version: integer("version").notNull(),
  // The actual perspective data
  lensData: jsonb("lens_data").notNull(),
  // Link to the deliberation that produced this version
  sourceDeliberationId: integer("source_deliberation_id").references(() => councils.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Ensure each lens has only one version number
}, (table) => {
  return {
    unq: unique().on(table.lensId, table.version),
  };
});

// UPDATE: Add a userId to the players table to link a deliberation participant to a user account
alterTable(players, {
  userId: integer("user_id").references(() => users.id),
});

```

### Step 2.2: Generate and Run the Database Migration

Drizzle ORM is used to manage database schema changes. After saving the `schema.ts` file, you need to generate a migration file and then apply it to your local database.

1.  **Open a terminal** and navigate to the engine directory:
    ```bash
    cd /home/ubuntu/council-engine-code/council-engine/engine
    ```

2.  **Generate the migration file.** This command compares the new schema to the old one and creates a SQL file with the necessary changes.
    ```bash
    pnpm drizzle-kit generate:pg
    ```
    This will create a new file in the `/council-engine/engine/src/db/migrations/` directory. The file will contain the `CREATE TABLE` and `ALTER TABLE` SQL statements.

3.  **Apply the migration.** This command runs the newly generated SQL file against your PostgreSQL database.
    ```bash
    pnpm db:migrate
    ```

**Verification:** Connect to your PostgreSQL database using a tool like `psql` or DBeaver and verify that the new tables (`users`, `lenses`, `lens_versions`) exist and that the `players` table has a `user_id` column.

---

## 3. Workstream 2: User Authentication & Profiles

**Goal:** Implement a basic username/password authentication system so we can have persistent user accounts.

### Step 3.1: Add Authentication Dependencies

We will use `passport` for authentication logic and `bcrypt` for password hashing.

1.  **Navigate to the engine directory:**
    ```bash
    cd /home/ubuntu/council-engine-code/council-engine/engine
    ```

2.  **Install the necessary packages:**
    ```bash
    pnpm add passport passport-local bcrypt
    pnpm add -D @types/passport @types/passport-local @types/bcrypt
    ```

### Step 3.2: Create Authentication Service

Create a new file to handle user registration and password logic.

**Create file:** `/council-engine/engine/src/auth/service.ts`

```typescript
// File: /council-engine/engine/src/auth/service.ts

import { db } from "../db";
import { users } from "../db/schema";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function registerUser(username: string, email: string, plainTextPass: string) {
  const hashedPassword = await bcrypt.hash(plainTextPass, SALT_ROUNDS);

  const newUser = await db.insert(users).values({
    username,
    email,
    hashedPassword,
  }).returning();

  return newUser[0];
}

export async function verifyPassword(plainTextPass: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainTextPass, hash);
}
```

### Step 3.3: Create Authentication Routes

Now, create the API endpoints for registration and login.

**Create file:** `/council-engine/engine/src/api/authRoutes.ts`

```typescript
// File: /council-engine/engine/src/api/authRoutes.ts

import { Router } from "express";
import { registerUser } from "../auth/service";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required." });
    }

    // NOTE: In a real app, you would add more validation here!

    const user = await registerUser(username, email, password);
    // NOTE: We are not implementing login/sessions in this step, just registration.
    res.status(201).json({ id: user.id, username: user.username });
  } catch (error) {
    // Basic error handling for unique constraint violation
    if (error.code === '23505') {
        return res.status(409).json({ error: 'Username or email already exists.' });
    }
    next(error);
  }
});

// We will add the /login route in a future step after setting up passport sessions.

export default router;
```

### Step 3.4: Add the Auth Routes to the Main App

Open `/council-engine/engine/src/index.ts` and import and use the new auth router.

```typescript
// File: /council-engine/engine/src/index.ts

// ... other imports
import adminRoutes from "./api/adminRoutes";
import authRoutes from "./api/authRoutes"; // <-- IMPORT THIS

// ... app setup

app.use("/api", routes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes); // <-- ADD THIS LINE

// ... server start
```

**Verification:** Start the engine (`pnpm dev`). Use a tool like Postman or `curl` to send a `POST` request to `http://localhost:8080/api/auth/register` with a JSON body like `{"username": "testuser", "email": "test@test.com", "password": "password123"}`. You should get a `201` response with the new user's ID and username.

---

## 4. Workstream 3: Lens API Endpoints

**Goal:** Create the API endpoints for creating and viewing lenses.

### Step 4.1: Create Lens Service Functions

Create a new file for business logic related to lenses.

**Create file:** `/council-engine/engine/src/lenses/service.ts`

```typescript
// File: /council-engine/engine/src/lenses/service.ts

import { db } from "../db";
import { lenses, lensVersions } from "../db/schema";
import { eq } from "drizzle-orm";

// Creates the first version of a new lens
export async function createLens(ownerId: number, name: string, description: string, initialLensData: any) {
  const newLens = await db.transaction(async (tx) => {
    const [lens] = await tx.insert(lenses).values({ ownerId, name, description }).returning();

    await tx.insert(lensVersions).values({
      lensId: lens.id,
      version: 1,
      lensData: initialLensData,
    });

    return lens;
  });

  return newLens;
}

export async function getLensesForUser(userId: number) {
    return db.select().from(lenses).where(eq(lenses.ownerId, userId));
}

export async function getLensVersionHistory(lensId: number) {
    return db.select().from(lensVersions).where(eq(lensVersions.lensId, lensId)).orderBy(lensVersions.version);
}
```

### Step 4.2: Add Lens Routes to the API

Modify the main routes file to include endpoints for lenses.

**Open file:** `/council-engine/engine/src/api/routes.ts`

```typescript
// File: /council-engine/engine/src/api/routes.ts

// ... other imports
import { createLens, getLensesForUser, getLensVersionHistory } from "../lenses/service";

// ... existing routes

// === NEW LENS ROUTES ===

// NOTE: These routes are not protected by authentication yet. That will come next.

// Get all lenses for a user
router.get("/users/:userId/lenses", async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const userLenses = await getLensesForUser(userId);
    res.json(userLenses);
  } catch (error) {
    next(error);
  }
});

// Create a new lens for a user
router.post("/users/:userId/lenses", async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { name, description, lensData } = req.body;
    if (!name || !lensData) {
        return res.status(400).json({ error: 'Lens name and lensData are required.' });
    }
    const newLens = await createLens(userId, name, description, lensData);
    res.status(201).json(newLens);
  } catch (error) {
    next(error);
  }
});

// Get the full version history of a single lens
router.get("/lenses/:lensId/history", async (req, res, next) => {
  try {
    const lensId = parseInt(req.params.lensId, 10);
    const history = await getLensVersionHistory(lensId);
    res.json(history);
  } catch (error) {
    next(error);
  }
});
```

**Verification:**
1.  Restart the engine (`pnpm dev`).
2.  First, create a user using the `/api/auth/register` endpoint from before. Let's say the new user has `id: 1`.
3.  Send a `POST` request to `http://localhost:8080/api/users/1/lenses` with a body like:
    ```json
    {
        "name": "My First Lens",
        "description": "A lens for analyzing systems.",
        "lensData": { "type": "systems-thinking", "focus": "feedback-loops" }
    }
    ```
4.  You should get a `201` response with the new lens object.
5.  Send a `GET` request to `http://localhost:8080/api/users/1/lenses` to see the lens you just created.
6.  Send a `GET` request to `http://localhost:8080/api/lenses/1/history` to see the first version of your new lens.

---

**Congratulations!** You have completed Track 1. You have laid the fundamental groundwork for the entire Lens-Forging Game by establishing user identity and the immutable data model for lens evolution.
# Junior Developer Implementation Guide: Track 2 - Frontend & Visuals

## 1. Overview & Objectives

This guide details the second major workstream, which runs in parallel to Track 1. Your focus will be on the user-facing experience: building the visual representation of the deliberation process. We will follow a **dual-track** approach:

1.  **Low-Fidelity First:** Immediately build a simple, functional visualizer that allows the team to *see* the data and interactions from day one. This is about function, not beauty.
2.  **Iterate to High-Fidelity:** With the low-fi version working, begin building the ambitious "Deliberation Theater" experience, starting with animated position reveals.

**Your mission is to:**
1.  Create a new, functional, low-fidelity deliberation viewer using React.
2.  Begin implementing the high-fidelity "Deliberation Theater" using `framer-motion` for animations.
3.  Build the frontend components for the weekly game loop, like a countdown page and spectator mode.

**Technology Stack:**
-   **Framework:** React 19
-   **Language:** TypeScript
-   **Styling:** TailwindCSS (via `index.css`)
-   **Animation:** Framer Motion

**File Location:** All work will be done inside the `/council-engine/skins/council-nebula/` directory.

---

## 2. Workstream 4: The Low-Fidelity Visualizer

**Goal:** Create a simple, 2D, text-and-SVG-based component that clearly visualizes the deliberation state machine (positions -> clash -> synthesis). This component must be functional and easy to understand.

### Step 2.1: Create the Main Viewer Component

Create a new component that will contain the low-fi visualization logic.

**Create file:** `/council-engine/skins/council-nebula/src/components/DeliberationViewerLowFi.tsx`

```tsx
// File: /council-engine/skins/council-nebula/src/components/DeliberationViewerLowFi.tsx

import React from 'react';

// Define types for the props you'll receive from the main Deliberation page
interface DeliberationViewerProps {
  positions: { advisorName: string; summary: string }[];
  clashStream: string; // For now, just a growing string of text
  synthesis: { title: string; content: string }[];
  deliberationState: 'positions' | 'clash' | 'synthesis';
}

export const DeliberationViewerLowFi: React.FC<DeliberationViewerProps> = ({ 
    positions, 
    clashStream, 
    synthesis, 
    deliberationState 
}) => {
  return (
    <div className="w-full h-full p-4 bg-gray-900 text-white font-mono">
      <h2 className="text-lg text-cyan-400 mb-4">// Low-Fidelity Deliberation View</h2>
      
      {/* Positions View */}
      {deliberationState === 'positions' && (
        <div className="grid grid-cols-3 gap-4">
          {positions.map((pos, i) => (
            <div key={i} className="border border-purple-500 p-3 rounded">
              <h3 className="font-bold text-purple-400">{pos.advisorName}</h3>
              <p className="text-sm mt-2">{pos.summary}</p>
            </div>
          ))}
        </div>
      )}

      {/* Clash View */}
      {deliberationState === 'clash' && (
        <div>
            <h3 className="font-bold text-red-500">// CLASH STREAM //</h3>
            <pre className="whitespace-pre-wrap text-sm mt-2 bg-gray-800 p-2 rounded">
                {clashStream}
            </pre>
        </div>
      )}

      {/* Synthesis View */}
      {deliberationState === 'synthesis' && (
        <div className="grid grid-cols-2 gap-4">
            {synthesis.map((syn, i) => (
                <div key={i} className="border border-green-500 p-3 rounded">
                    <h3 className="font-bold text-green-400">{syn.title}</h3>
                    <p className="text-sm mt-2">{syn.content}</p>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};
```

### Step 2.2: Integrate the Low-Fi Viewer

Now, modify the main `Deliberation.tsx` page to use this new component. We'll add a simple toggle to switch between the old view and the new one.

**Open file:** `/council-engine/skins/council-nebula/src/pages/Deliberation.tsx`

1.  **Import the new component** at the top of the file:
    ```tsx
    import { DeliberationViewerLowFi } from '../components/DeliberationViewerLowFi';
    ```

2.  **Add a state for the toggle:**
    ```tsx
    const [showLowFi, setShowLowFi] = useState(true); // Default to showing the new viewer
    ```

3.  **Wrap the existing view and the new component** in a conditional render based on the `showLowFi` state. You will need to pass the correct state variables (like `positions`, `clashStream`, etc.) as props to `<DeliberationViewerLowFi />`.

    ```tsx
    // In the return() of Deliberation.tsx

    <div className="relative">
        <button 
            onClick={() => setShowLowFi(!showLowFi)} 
            className="absolute top-2 right-2 bg-purple-700 p-2 rounded z-10">
            Toggle View
        </button>

        {showLowFi ? (
            <DeliberationViewerLowFi 
                positions={positions} // Pass the actual state
                clashStream={clashStream} // Pass the actual state
                synthesis={synthesis} // Pass the actual state
                deliberationState={deliberationState} // Pass the actual state
            />
        ) : (
            // ... Keep the OLD rendering logic here ...
            // This will be the <pre> tags and simple cards that already exist
        )}
    </div>
    ```

**Verification:** Run the frontend (`pnpm dev` in the `skins/council-nebula` directory). Start a deliberation from the UI. You should see the new low-fidelity viewer. Clicking the "Toggle View" button should switch you back to the original, more basic text stream.

---

## 3. Workstream 5: The Deliberation Theater (v1)

**Goal:** Begin creating the high-fidelity visual experience. The first step is to animate the reveal of the advisor positions.

### Step 3.1: Create the Arena and Node Components

First, create the components for the visual arena.

**Create file:** `/council-engine/skins/council-nebula/src/components/theater/DeliberationArena.tsx`

```tsx
// File: /council-engine/skins/council-nebula/src/components/theater/DeliberationArena.tsx

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PositionNode } from './PositionNode';

interface ArenaProps {
  positions: { advisorName: string; summary: string }[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1, // Each child animates 0.1s after the previous one
    },
  },
};

export const DeliberationArena: React.FC<ArenaProps> = ({ positions }) => {
  return (
    <div className="w-full h-screen bg-gray-950 flex items-center justify-center">
      <motion.div 
        className="w-3/4 h-3/4 grid grid-cols-4 grid-rows-3 gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence>
          {positions.map((pos, i) => (
            <PositionNode key={i} advisorName={pos.advisorName} summary={pos.summary} />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
```

**Create file:** `/council-engine/skins/council-nebula/src/components/theater/PositionNode.tsx`

```tsx
// File: /council-engine/skins/council-nebula/src/components/theater/PositionNode.tsx

import React from 'react';
import { motion } from 'framer-motion';

interface NodeProps {
  advisorName: string;
  summary: string;
}

const nodeVariants = {
  hidden: { opacity: 0, scale: 0.5, y: 50 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 100 }
  },
};

export const PositionNode: React.FC<NodeProps> = ({ advisorName, summary }) => {
  return (
    <motion.div 
      className="bg-gray-800 border border-cyan-500 rounded-lg p-4 flex flex-col justify-center items-center shadow-lg shadow-cyan-500/20"
      variants={nodeVariants}
    >
      <h4 className="font-bold text-cyan-400 text-center">{advisorName}</h4>
      {/* Summary can be shown on hover in a later version */}
    </motion.div>
  );
};
```

### Step 3.2: Integrate the Theater

Now, add a new toggle to the `Deliberation.tsx` page to show the theater.

1.  **Import the new component:**
    ```tsx
    import { DeliberationArena } from '../components/theater/DeliberationArena';
    ```

2.  **Add another state toggle:**
    ```tsx
    const [showTheater, setShowTheater] = useState(false);
    ```

3.  **Add a button and conditional rendering.** You can add this inside the `else` block of the `showLowFi` toggle.

    ```tsx
    // In the return() of Deliberation.tsx, inside the `else` for `showLowFi`

    <button onClick={() => setShowTheater(true)}>Show Theater</button>

    {showTheater ? (
        <DeliberationArena positions={positions} />
    ) : (
        // ... The original <pre> tag view
    )}
    ```

**Verification:** Run the frontend. Start a deliberation. Toggle off the low-fi view. You should see the old text view and a "Show Theater" button. Click it. When the positions are loaded, you should see 12 cards animate into a grid formation.

---

## 4. Workstream 6: Weekly Cycle UI

**Goal:** Build the frontend UI to create a sense of occasion around the weekly deliberation.

### Step 4.1: Create the Countdown Page

This page will build anticipation for the Friday event.

**Create file:** `/council-engine/skins/council-nebula/src/pages/Countdown.tsx`

```tsx
// File: /council-engine/skins/council-nebula/src/pages/Countdown.tsx

import React, { useState, useEffect } from 'react';

// Helper function to calculate time remaining
const calculateTimeLeft = (targetDate: Date) => {
    const difference = +targetDate - +new Date();
    let timeLeft = {};

    if (difference > 0) {
        timeLeft = {
            days: Math.floor(difference / (1000 * 60 * 60 * 24)),
            hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
            minutes: Math.floor((difference / 1000 / 60) % 60),
            seconds: Math.floor((difference / 1000) % 60)
        };
    }
    return timeLeft;
}

// Function to get the next Friday at 5 PM PST
const getNextFriday = () => {
    const now = new Date();
    const nextFriday = new Date();
    nextFriday.setDate(now.getDate() + (5 + 7 - now.getDay()) % 7);
    nextFriday.setHours(17, 0, 0, 0); // 5 PM
    // NOTE: This is in server time. A real implementation needs timezone handling!
    return nextFriday;
}

export const CountdownPage = () => {
    const [targetDate] = useState(getNextFriday());
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft(targetDate));

    useEffect(() => {
        const timer = setTimeout(() => {
            setTimeLeft(calculateTimeLeft(targetDate));
        }, 1000);
        return () => clearTimeout(timer);
    });

    return (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-gray-950 text-white">
            <h1 className="text-4xl font-bold text-cyan-400 mb-4">The Council Assembles Soon</h1>
            <p className="text-lg mb-8">Next Deliberation Begins In:</p>
            <div className="flex space-x-8 text-center">
                <div>
                    <span className="text-6xl font-bold">{timeLeft.days || '0'}</span>
                    <span className="block text-xl">Days</span>
                </div>
                <div>
                    <span className="text-6xl font-bold">{timeLeft.hours || '0'}</span>
                    <span className="block text-xl">Hours</span>
                </div>
                <div>
                    <span className="text-6xl font-bold">{timeLeft.minutes || '0'}</span>
                    <span className="block text-xl">Minutes</span>
                </div>
                <div>
                    <span className="text-6xl font-bold">{timeLeft.seconds || '0'}</span>
                    <span className="block text-xl">Seconds</span>
                </div>
            </div>
        </div>
    );
}
```

### Step 4.2: Add the Countdown Route

**Open file:** `/council-engine/skins/council-nebula/src/App.tsx`

1.  Import the new page.
    ```tsx
    import { CountdownPage } from './pages/Countdown';
    ```
2.  Add a new route.
    ```tsx
    <Route path="/countdown" component={CountdownPage} />
    ```

**Verification:** Run the frontend and navigate to `http://localhost:5173/countdown`. You should see a large countdown timer ticking down to the next Friday at 5 PM.

---

**Congratulations!** You have completed Track 2. You have built a functional low-fi viewer, started the high-fidelity theater experience with animations, and created the UI to make the weekly deliberation feel like a real event.
# Junior Developer Implementation Guide: Track 3 - Weekly Cycle & Infrastructure

## 1. Overview & Objectives

This guide covers the final set of tasks required to transform the Lens-Forging Game from a single-shot application into a reliable, recurring service. We will address key features that enable the "Friday live show" experience and prepare the application for a more robust deployment.

**Your mission is to:**
1.  Implement a **spectator mode** so users can watch deliberations live without participating.
2.  Build a **deliberation recording and replay** system.
3.  Harden the weekly cycle logic and prepare the application for a production-like environment.

**Technology Stack:**
-   **Backend:** Express.js, WebSockets (`ws` library)
-   **Database:** PostgreSQL, Drizzle ORM
-   **Frontend:** React, Wouter (for routing)

**File Locations:** Work will be split between the `engine/` and `skins/council-nebula/` directories.

---

## 2. Workstream 7: Spectator Mode

**Goal:** Allow users to join a deliberation in a read-only "spectator" mode.

### Step 2.1: Update the WebSocket Hub (Backend)

We need to modify the WebSocket hub to manage spectators separately from active players.

**Open file:** `/council-engine/engine/src/ws/hub.ts`

1.  **Update the `channels` map:** Add a new `Set` for spectators in each channel.

    ```typescript
    // In hub.ts
    const channels = new Map<string, { players: Set<WebSocket>, spectators: Set<WebSocket> }>();
    ```

2.  **Modify the `joinChannel` function:** Add a parameter to distinguish players from spectators.

    ```typescript
    // In hub.ts
    export function joinChannel(councilId: string, ws: WebSocket, isSpectator = false) {
      let channel = channels.get(councilId);
      if (!channel) {
        channel = { players: new Set(), spectators: new Set() };
        channels.set(councilId, channel);
      }

      if (isSpectator) {
        channel.spectators.add(ws);
      } else {
        channel.players.add(ws);
      }

      ws.on("close", () => {
        if (isSpectator) {
            channel.spectators.delete(ws);
        } else {
            channel.players.delete(ws);
        }
        // ... cleanup logic
      });
    }
    ```

3.  **Modify the `broadcast` function:** Ensure messages are sent to both players and spectators.

    ```typescript
    // In hub.ts
    export function broadcast(councilId: string, message: string) {
      const channel = channels.get(councilId);
      if (channel) {
        const fullAudience = [...channel.players, ...channel.spectators];
        for (const client of fullAudience) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        }
      }
    }
    ```

4.  **Update the WebSocket connection handler:** The main connection handler in `index.ts` needs to determine if a connection is a player or a spectator. We can use a URL query parameter for this.

    **Open file:** `/council-engine/engine/src/index.ts`

    ```typescript
    // In index.ts, inside the wss.on("connection") block

    ws.on("connection", (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const councilId = url.searchParams.get("councilId");
        const isSpectator = url.searchParams.get("spectate") === "true";

        if (councilId) {
            joinChannel(councilId, ws, isSpectator);
            // ... rest of the logic
        }
    });
    ```

### Step 2.2: Create the Spectator Page (Frontend)

Create a new page for spectators to view the deliberation.

**Create file:** `/council-engine/skins/council-nebula/src/pages/Spectate.tsx`

```tsx
// File: /council-engine/skins/council-nebula/src/pages/Spectate.tsx

import React, { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { DeliberationViewerLowFi } from "../components/DeliberationViewerLowFi";

// This component will be very similar to Deliberation.tsx, but read-only
export const SpectatePage = () => {
  const [match, params] = useRoute("/spectate/:councilId");
  const councilId = params?.councilId;

  // Mock data for now - a real implementation would get this from the WebSocket
  const [deliberationState, setDeliberationState] = useState("positions");
  const [positions, setPositions] = useState([]);
  const [clashStream, setClashStream] = useState("");
  const [synthesis, setSynthesis] = useState([]);

  useEffect(() => {
    if (!councilId) return;

    // Connect to the WebSocket as a spectator
    const ws = new WebSocket(`ws://localhost:8080?councilId=${councilId}&spectate=true`);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      // This logic should mirror the logic in Deliberation.tsx
      // to update state based on incoming messages.
      console.log("Spectator received:", message);
      // TODO: Add logic to parse message and update positions, clash, synthesis states.
    };

    return () => ws.close();
  }, [councilId]);

  return (
    <div className="p-4">
        <h1 className="text-2xl text-cyan-400">Spectating Council: {councilId}</h1>
        <DeliberationViewerLowFi 
            positions={positions}
            clashStream={clashStream}
            synthesis={synthesis}
            deliberationState={deliberationState}
        />
    </div>
  );
};
```

### Step 2.3: Add the Spectator Route

**Open file:** `/council-engine/skins/council-nebula/src/App.tsx`

1.  Import the new page.
    ```tsx
    import { SpectatePage } from "./pages/Spectate";
    ```
2.  Add the new route.
    ```tsx
    <Route path="/spectate/:councilId" component={SpectatePage} />
    ```

**Verification:** Start both backend and frontend. Start a deliberation in one browser tab. Open a second browser tab and navigate to `http://localhost:5173/spectate/<your-council-id>`. As the deliberation progresses in the first tab, the spectator page in the second tab should receive and log the same WebSocket messages.

---

## 3. Workstream 8: Deliberation Recording & Replay

**Goal:** Save the entire stream of deliberation events to the database so it can be replayed later.

### Step 3.1: Add a New Database Table

**Open file:** `/council-engine/engine/src/db/schema.ts`

Add a new table to store the event stream.

```typescript
// File: /council-engine/engine/src/db/schema.ts

// ... existing schema

export const deliberationEvents = pgTable("deliberation_events", {
  id: serial("id").primaryKey(),
  councilId: integer("council_id").references(() => councils.id).notNull(),
  eventData: jsonb("event_data").notNull(),
  sequence: integer("sequence").notNull(), // To ensure order
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

After saving, **generate and run the migration** as you did in Track 1:

```bash
cd /home/ubuntu/council-engine-code/council-engine/engine
pnpm drizzle-kit generate:pg
pnpm db:migrate
```

### Step 3.2: Save Events During Broadcast

Modify the `broadcast` function to also write events to the database.

**Open file:** `/council-engine/engine/src/ws/hub.ts`

```typescript
// In hub.ts
import { db } from "../db";
import { deliberationEvents } from "../db/schema";

// Keep an in-memory sequence counter for each council
const sequenceCounters = new Map<string, number>();

export async function broadcast(councilId: string, message: string) {
  // ... existing broadcast logic ...

  // NEW: Save event to database
  try {
    const councilIdNum = parseInt(councilId, 10);
    let currentSequence = sequenceCounters.get(councilId) || 0;
    currentSequence++;

    await db.insert(deliberationEvents).values({
        councilId: councilIdNum,
        eventData: JSON.parse(message),
        sequence: currentSequence,
    });

    sequenceCounters.set(councilId, currentSequence);
  } catch (error) {
    console.error("Failed to save deliberation event:", error);
  }
}
```

### Step 3.3: Create the Replay API Endpoint

Create a new endpoint that a frontend can call to get the full history of a deliberation.

**Open file:** `/council-engine/engine/src/api/routes.ts`

```typescript
// In routes.ts
import { db } from "../db";
import { deliberationEvents } from "../db/schema";
import { eq } from "drizzle-orm";

// ... existing routes

// NEW: Replay endpoint
router.get("/deliberations/:councilId/replay", async (req, res, next) => {
  try {
    const councilId = parseInt(req.params.councilId, 10);
    const events = await db.select()
        .from(deliberationEvents)
        .where(eq(deliberationEvents.councilId, councilId))
        .orderBy(deliberationEvents.sequence);
    
    res.json(events.map(e => e.eventData));
  } catch (error) {
    next(error);
  }
});
```

**Verification:** Run a full deliberation. After it completes, check your `deliberation_events` table in the database; it should be populated with JSON objects. Then, call the new endpoint at `http://localhost:8080/api/deliberations/<your-council-id>/replay`. You should receive a JSON array of all the events that were broadcast during the deliberation.

---

## 4. Workstream 9: Production Readiness

**Goal:** Prepare the application for deployment.

### Step 4.1: Add Production Build Scripts

**Open file:** `/council-engine/engine/package.json`

Add a `build` script and a `start` script for production.

```json
// In engine/package.json
"scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc", // <-- ADD THIS
    "start": "node dist/index.js", // <-- ADD THIS
    "db:migrate": "drizzle-kit migrate:pg",
    "db:generate": "drizzle-kit generate:pg"
},
```

**Open file:** `/council-engine/skins/council-nebula/package.json`

The `build` script should already exist here (from Vite).

### Step 4.2: Document Environment Variables

Create a file named `.env.example` in the `/council-engine/engine/` directory to document the required environment variables for someone setting up the project.

**Create file:** `/council-engine/engine/.env.example`

```
# .env.example

# Database connection string
# Example: postgresql://user:password@localhost:5432/mydatabase
DATABASE_URL=

# Port for the backend server
PORT=8080

# OpenAI-compatible API Key and Base URL
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1

# GoHighLevel API Key for email
GHL_API_KEY=
```

**Instructions for Junior Dev:**
1.  Copy `.env.example` to a new file named `.env`.
2.  Fill in the values in the `.env` file with your local development credentials.
3.  The `env.ts` file is already configured to read these variables.

---

**CoCongratulations! You have completed Track 3. The application now supports live spectators and can record deliberations for later replay. It is also better documented and prepared for deployment. You have successfully implemented the core features of the intelligence-level build plan.

---

## Final Conclusion

By completing all three tracks in this manual, you have laid the architectural and functional foundation for the Lens-Forging Game. You have built:

1.  A robust, immutable data model for tracking user-created lenses and their evolution.
2.  A basic user authentication system.
3.  A functional, low-fidelity visualizer for deliberations, providing immediate value.
4.  The animated beginnings of the high-fidelity "Deliberation Theater."
5.  The UI for the weekly game loop, including a countdown and spectator mode.
6.  A backend system for recording and replaying deliberations.

This work directly implements the **Evolutionary Prototype** strategy recommended by the advisory board, hedged by the critical insights from the Minority Reports. The system is now ready for internal testing, further iteration, and the next phase of development: building the single-player lens-forging journey and the high-fidelity visual engine.
