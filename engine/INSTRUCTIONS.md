# Week 1 Development Plan: Council Engine

**Objective:** Complete the two parallel tracks for Week 1 as defined in the Unified Plan. This guide provides exact, step-by-step instructions for a junior developer.

**Prerequisites:**
* You have the `council-engine` codebase checked out.
* You have `node`, `pnpm`, and `docker` installed on your local machine.
* You have access to the project's GitHub repository.

---

## Track 1: Platform Foundation (CI/CD & Migrations)

This track establishes the core stability of our application. We will create a database migration system and a basic automated deployment pipeline.

### Task 1.1: Implement Database Migrations with Drizzle Kit

**Goal:** Replace the empty `migrate.ts` stub with a real migration script that can apply schema changes to the database.

1.  **Install Drizzle Kit:**
    Open your terminal in the `engine/` directory and run:
    ```bash
    pnpm add -D drizzle-kit
    ```

2.  **Create Drizzle Config:**
    Create a new file named `drizzle.config.ts` in the `engine/` directory.

    ```typescript
    // engine/drizzle.config.ts
    import type { Config } from 'drizzle-kit';

    export default {
        schema: './src/db/schema.ts',
        out: './drizzle',
        driver: 'pg',
        dbCredentials: {
            connectionString: process.env.DATABASE_URL!,
        },
    } satisfies Config;
    ```

3.  **Update `package.json`:**
    Add the following scripts to `engine/package.json`:

    ```json
    "scripts": {
      // ... existing scripts
      "db:generate": "drizzle-kit generate:pg",
      "db:migrate": "pnpm run src/db/migrate.ts"
    }
    ```

4.  **Create the Migration Script:**
    Replace the contents of `engine/src/db/migrate.ts` with the following:

    ```typescript
    // engine/src/db/migrate.ts
    import { migrate } from 'drizzle-orm/postgres-js/migrator';
    import { drizzle } from 'drizzle-orm/postgres-js';
    import postgres from 'postgres';
    import 'dotenv/config';

    const runMigrations = async () => {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not set');
        }

        const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 });
        const db = drizzle(migrationClient);

        console.log('Running database migrations...');
        await migrate(db, { migrationsFolder: './drizzle' });
        console.log('Migrations completed successfully.');

        await migrationClient.end();
        process.exit(0);
    };

    runMigrations().catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
    ```

5.  **Generate the Initial Migration:**
    From the `engine/` directory, run:
    ```bash
    pnpm run db:generate
    ```
    This will create a new `drizzle/` directory containing the first SQL migration file based on your existing schema.

6.  **Commit your work:**
    Add `drizzle.config.ts`, `engine/package.json`, `engine/src/db/migrate.ts`, and the new `drizzle/` directory to a git commit.

### Task 1.2: Implement Basic CI/CD with GitHub Actions

**Goal:** Create a GitHub Action that automatically builds the `engine` and `skin` on every push to the `main` branch.

1.  **Create the Workflow Directory:**
    In the root of your project, create the directory path `.github/workflows/`.

2.  **Create the Dockerfile:**
    Create a file named `Dockerfile` in the project root.

    ```Dockerfile
    # Dockerfile
    FROM node:18-alpine

    RUN npm install -g pnpm

    WORKDIR /app

    # Copy root package.json and pnpm-lock.yaml
    COPY package.json pnpm-lock.yaml ./

    # Copy engine files
    COPY engine/package.json ./engine/
    COPY engine/tsconfig.json ./engine/

    # Copy skin files
    COPY skins/council-nebula/package.json ./skins/council-nebula/
    COPY skins/council-nebula/tsconfig.json ./skins/council-nebula/
    COPY skins/council-nebula/vite.config.ts ./skins/council-nebula/

    # Install all dependencies
    RUN pnpm install --frozen-lockfile

    # Copy source code
    COPY engine/src/ ./engine/src/
    COPY skins/council-nebula/src/ ./skins/council-nebula/src/
    COPY skins/council-nebula/index.html ./skins/council-nebula/

    # Build both projects
    RUN pnpm --filter council-engine build
    RUN pnpm --filter council-nebula build

    # You would add a CMD here to run the engine in a real deployment
    # For now, this just confirms the build works.
    ```

3.  **Create the GitHub Action Workflow:**
    Create a file named `deploy.yml` inside `.github/workflows/`.

    ```yaml
    # .github/workflows/deploy.yml
    name: Build and Deploy

    on:
      push:
        branches:
          - main

    jobs:
      build:
        runs-on: ubuntu-latest

        steps:
          - name: Checkout code
            uses: actions/checkout@v3

          - name: Set up Docker Buildx
            uses: docker/setup-buildx-action@v2

          - name: Build Docker image
            uses: docker/build-push-action@v4
            with:
              context: .
              file: ./Dockerfile
              push: false # We are not pushing to a registry yet
              tags: council-engine:latest
    ```

4.  **Commit your work:**
    Add the `Dockerfile` and `.github/workflows/deploy.yml` to a git commit. Push to `main` and verify that the action runs successfully in your repository's "Actions" tab.

---

## Track 2: Facilitator Experience (Read-Only Dashboard)

**Goal:** Create a new, password-protected `/admin` page that displays the real-time state of a specific council session.

### Task 2.1: Create the Admin Page Route and Component

1.  **Create the Admin Page Component:**
    Create a new file at `skins/council-nebula/src/pages/Admin.tsx`.

    ```tsx
    // skins/council-nebula/src/pages/Admin.tsx
    import React, { useState, useEffect } from 'react';
    import { useParams } from 'react-router-dom';

    const AdminPage = () => {
        const { councilId } = useParams();
        const [councilState, setCouncilState] = useState<any>(null);
        const [password, setPassword] = useState('');
        const [isAuthenticated, setIsAuthenticated] = useState(false);

        // In a real app, you'd use a WebSocket connection here.
        // For Week 1, we will poll an API endpoint.
        useEffect(() => {
            if (!isAuthenticated) return;

            const interval = setInterval(() => {
                fetch(`/api/council/${councilId}/state`)
                    .then(res => res.json())
                    .then(data => setCouncilState(data));
            }, 2000);

            return () => clearInterval(interval);
        }, [councilId, isAuthenticated]);

        const handleLogin = () => {
            // This is a simple, insecure placeholder for Week 1.
            if (password === 'j3d1sh3rpa') {
                setIsAuthenticated(true);
            }
        };

        if (!isAuthenticated) {
            return (
                <div>
                    <h1>Admin Access</h1>
                    <input 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        placeholder="Enter password"
                    />
                    <button onClick={handleLogin}>Login</button>
                </div>
            );
        }

        return (
            <div>
                <h1>Council State: {councilId}</h1>
                {councilState ? (
                    <pre>{JSON.stringify(councilState, null, 2)}</pre>
                ) : (
                    <p>Loading council state...</p>
                )}
            </div>
        );
    };

    export default AdminPage;
    ```

2.  **Add the Route to `App.tsx`:**
    Open `skins/council-nebula/src/App.tsx` and add the new route.

    ```tsx
    // ... imports
    import AdminPage from './pages/Admin';

    function App() {
      return (
        <Router>
          <Routes>
            {/* ... other routes */}
            <Route path="/admin/:councilId" element={<AdminPage />} />
          </Routes>
        </Router>
      );
    }
    ```

### Task 2.2: Create the Backend API Endpoint

1.  **Add the New Route in the Engine:**
    Open `engine/src/api/routes.ts` and add a new endpoint to fetch the state.

    ```typescript
    // engine/src/api/routes.ts
    // ... imports

    // ... after existing routes

    // WARNING: This is an insecure endpoint for Week 1. 
    // It will be properly secured later.
    router.get('/council/:councilId/state', async (req, res) => {
        const { councilId } = req.params;

        try {
            const council = await db.query.councils.findFirst({
                where: (councils, { eq }) => eq(councils.id, councilId),
                with: {
                    players: true,
                    responses: true,
                    synthesis: true,
                },
            });

            if (!council) {
                return res.status(404).json({ error: 'Council not found' });
            }

            res.json(council);
        } catch (error) {
            console.error(`Failed to fetch state for council ${councilId}:`, error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    ```

2.  **Commit your work:**
    Add the changes in `Admin.tsx`, `App.tsx`, and `routes.ts` to a git commit.

---

Once you have completed both tracks, you will have fulfilled the core requirements for Week 1. You will have a database that can evolve safely and a basic CI pipeline to ensure code quality, as well as the foundational UI for the facilitator's most critical tool.


---

## Week 2: Safety & Control

**Objective:** Build a safety net with automated tests and give the facilitator basic control over the deliberation flow.

### Task 2.1 (Platform): Set Up End-to-End Testing with Playwright

**Goal:** Install Playwright and write one critical path test to ensure the `Create -> Join` flow works as expected. This test will run in our CI pipeline.

1.  **Install Playwright:**
    In the project root, run the Playwright installation wizard:
    ```bash
    pnpm add -D @playwright/test
    pnpm playwright install
    ```
    This will create `playwright.config.ts` and an `e2e` directory with example tests.

2.  **Configure Playwright:**
    Modify `playwright.config.ts` to point to your running application.
    ```typescript
    // playwright.config.ts
    import { defineConfig, devices } from '@playwright/test';

    export default defineConfig({
      testDir: './e2e',
      fullyParallel: true,
      forbidOnly: !!process.env.CI,
      retries: process.env.CI ? 2 : 0,
      workers: process.env.CI ? 1 : undefined,
      reporter: 'html',
      use: {
        baseURL: 'http://localhost:5173', // Assuming Vite runs on this port
        trace: 'on-first-retry',
      },
      projects: [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
      ],
      webServer: {
        command: 'pnpm --filter council-nebula dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
      },
    });
    ```

3.  **Write the First Test:**
    Create a new file `e2e/gameflow.test.ts`.
    ```typescript
    // e2e/gameflow.test.ts
    import { test, expect } from '@playwright/test';

    test('Create and Join Game Flow', async ({ page }) => {
      // Navigate to the Create Game page
      await page.goto('/');
      await page.getByRole('button', { name: 'Create New Council' }).click();

      // Fill out the form and create the council
      await page.getByPlaceholder('Enter the question...').fill('What is the meaning of life?');
      await page.getByRole('button', { name: 'Create Council' }).click();

      // Expect to be on the Lobby page and get the invite code
      await expect(page.getByText('Lobby')).toBeVisible();
      const inviteCode = await page.locator("input[value*=\'http\']").inputValue();
      expect(inviteCode).toContain('http');

      // In a new context, join the game
      const newPage = await page.context().newPage();
      await newPage.goto(inviteCode);
      await newPage.getByPlaceholder('Enter your name').fill('Junior Dev');
      await newPage.getByRole('button', { name: 'Join Council' }).click();

      // Expect to see the new player in the lobby on the host's page
      await expect(page.getByText('Junior Dev')).toBeVisible();
    });
    ```

4.  **Update CI to Run Tests:**
    Modify `.github/workflows/deploy.yml` to add a testing step.
    ```yaml
    # ... inside the `build` job, after the checkout step
          - name: Run Playwright tests
            run: |
              pnpm install --frozen-lockfile
              pnpm playwright install --with-deps
              pnpm playwright test
    ```

### Task 2.2 (Facilitator Exp.): Add Basic Manual Controls

**Goal:** Add `Force Start Deliberation` and `Force Advance Act` buttons to the admin panel.

1.  **Add Buttons to Admin UI:**
    In `skins/council-nebula/src/pages/Admin.tsx`, add the new buttons.
    ```tsx
    // ... inside the AdminPage component, within the authenticated view
    <div>
        <button onClick={() => handleControl('force_start')}>Force Start Deliberation</button>
        <button onClick={() => handleControl('force_advance')}>Force Advance Act</button>
    </div>
    ```

2.  **Implement the `handleControl` Function:**
    Still in `Admin.tsx`, add the function to call the new backend endpoint.
    ```tsx
    const handleControl = (action: string) => {
        fetch(`/api/council/${councilId}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        })
        .then(res => res.json())
        .then(data => {
            console.log(`${action} command sent`, data);
            // Optionally refresh state immediately
            fetch(`/api/council/${councilId}/state`).then(res => res.json()).then(setCouncilState);
        });
    };
    ```

3.  **Create the Control Endpoint in the Engine:**
    In `engine/src/api/routes.ts`, add the new POST endpoint.
    ```typescript
    // engine/src/api/routes.ts
    import { hub } from '../ws/hub'; // Make sure hub is exported from your hub.ts

    router.post('/council/:councilId/control', async (req, res) => {
        const { councilId } = req.params;
        const { action } = req.body;

        console.log(`Control action '${action}' received for council ${councilId}`);

        // This is a simplified way to interact with the hub.
        // In a real app, you might use a more robust message queue.
        if (action === 'force_start') {
            hub.broadcast(councilId, { type: 'DELIBERATION_START' });
        } else if (action === 'force_advance') {
            hub.broadcast(councilId, { type: 'NEXT_ACT' });
        }

        res.status(200).json({ message: 'Action sent to hub' });
    });
    ```
    **Note:** This requires you to export the `hub` instance from your WebSocket setup file (`hub.ts`) so it can be accessed by your API routes. This is a direct way to communicate for now.

---

## Week 3: Insight & Precision

**Objective:** Add observability to the platform with error monitoring and give the facilitator more granular control.

### Task 3.1 (Platform): Integrate Sentry and Structured Logging

**Goal:** Capture all unhandled exceptions in Sentry and implement structured logging for better debugging.

1.  **Install Dependencies:**
    In the `engine/` directory, run:
    ```bash
    pnpm add @sentry/node @sentry/profiling-node pino pino-pretty
    ```

2.  **Initialize Sentry:**
    In `engine/src/index.ts`, initialize Sentry at the very top of the file.
    ```typescript
    // engine/src/index.ts
    import * as Sentry from '@sentry/node';

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [
        // enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // enable Express.js middleware tracing
        new Sentry.Integrations.Express({ app }),
      ],
      tracesSampleRate: 1.0,
      profilesSampleRate: 1.0,
    });

    // The request handler must be the first middleware on the app
    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());

    // ... rest of your app setup

    // The error handler must be before any other error middleware and after all controllers
    app.use(Sentry.Handlers.errorHandler());
    ```

3.  **Set up Pino Logger:**
    Create a new file `engine/src/logger.ts`.
    ```typescript
    // engine/src/logger.ts
    import pino from 'pino';

    export const logger = pino({
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
    ```

4.  **Use the Logger:**
    Replace all `console.log` statements in your `engine` with `logger.info`, `logger.warn`, or `logger.error`. For example, in `routes.ts`:
    ```typescript
    import { logger } from '../logger';

    // ...
    logger.info(`Control action '${action}' received for council ${councilId}`);
    ```

### Task 3.2 (Facilitator Exp.): Add Pause/Resume and Edit Controls

**Goal:** Give the facilitator the ability to pause deliberation timers and edit a player's response before it's revealed.

1.  **Add New UI Controls:**
    In `skins/council-nebula/src/pages/Admin.tsx`, add the new controls.
    ```tsx
    // ... inside the authenticated view
    <div>
        {/* ... existing buttons */}
        <button onClick={() => handleControl('pause_timer')}>Pause Timer</button>
        <button onClick={() => handleControl('resume_timer')}>Resume Timer</button>
    </div>

    {/* Add a section to edit responses */}
    <h2>Edit Responses</h2>
    {councilState?.responses.map((response: any) => (
        <div key={response.id}>
            <textarea defaultValue={response.content} id={`response-${response.id}`} />
            <button onClick={() => handleEditResponse(response.id)}>Update</button>
        </div>
    ))}
    ```

2.  **Implement Edit Handler:**
    Still in `Admin.tsx`, add the `handleEditResponse` function.
    ```tsx
    const handleEditResponse = (responseId: string) => {
        const newContent = (document.getElementById(`response-${responseId}`) as HTMLTextAreaElement).value;
        fetch(`/api/response/${responseId}` , {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent }),
        }).then(() => alert('Response updated!'));
    };
    ```

3.  **Add Backend Endpoints:**
    In `engine/src/api/routes.ts`, add the new endpoints.
    ```typescript
    // For pause/resume, we can reuse the control endpoint
    // In hub.ts, you would add logic to handle these new message types
    // hub.broadcast(councilId, { type: 'TIMER_PAUSE' });
    // hub.broadcast(councilId, { type: 'TIMER_RESUME' });

    // New endpoint for editing a response
    router.put('/response/:responseId', async (req, res) => {
        const { responseId } = req.params;
        const { content } = req.body;

        try {
            const [updatedResponse] = await db.update(responses)
                .set({ content, updatedAt: new Date() })
                .where(eq(responses.id, responseId))
                .returning();
            
            logger.info({ responseId }, 'Response content updated by facilitator.');
            res.json(updatedResponse);
        } catch (error) {
            logger.error({ responseId, error }, 'Failed to update response.');
            res.status(500).json({ error: 'Failed to update response' });
        }
    });
    ```
    


---

## Week 4: Merged Team - Integration & Testing

**Objective:** Merge the two tracks. Ensure the platform foundation supports the facilitator controls and expand test coverage to the full game loop.

1.  **Merge Branches:**
    Merge the `platform` and `facilitator-exp` feature branches (or your equivalent) into the `main` branch. Resolve any merge conflicts, which will likely be in `engine/src/api/routes.ts` and `skins/council-nebula/src/pages/Admin.tsx`.

2.  **Expand E2E Test Suite:**
    Create a new test file `e2e/admin_flow.test.ts`.
    ```typescript
    // e2e/admin_flow.test.ts
    import { test, expect } from "@playwright/test";

    test.describe("Admin Panel Controls", () => {
      let councilId: string;

      test.beforeEach(async ({ page }) => {
        // Create a new council to get a fresh ID for each test
        await page.goto("/");
        await page.getByRole("button", { name: "Create New Council" }).click();
        await page.getByPlaceholder("Enter the question...").fill("Admin Test");
        await page.getByRole("button", { name: "Create Council" }).click();
        const url = page.url();
        councilId = url.split("/").pop()!;
      });

      test("should allow facilitator to log in and view state", async ({ page }) => {
        await page.goto(`/admin/${councilId}`);
        await page.getByPlaceholder("Enter password").fill("j3d1sh3rpa");
        await page.getByRole("button", { name: "Login" }).click();
        await expect(page.getByText(`Council State: ${councilId}`)).toBeVisible();
        await expect(page.getByText("Admin Test")).toBeVisible(); // Check for question
      });

      test("should allow facilitator to force start deliberation", async ({ page }) => {
        // First, log in
        await page.goto(`/admin/${councilId}`);
        await page.getByPlaceholder("Enter password").fill("j3d1sh3rpa");
        await page.getByRole("button", { name: "Login" }).click();

        // Click the force start button
        await page.getByRole("button", { name: "Force Start Deliberation" }).click();

        // Go to the main council page and verify deliberation has started
        // This requires your app to show a different state, e.g., "Deliberation in Progress"
        await page.goto(`/council/${councilId}`);
        await expect(page.getByText("Deliberation in Progress")).toBeVisible();
      });
    });
    ```

3.  **Integration Bug Bash:**
    Manually run through the entire application flow. Create a council, have multiple users join, submit responses, and use every single admin control. Document every bug, UI glitch, or unexpected behavior in GitHub Issues.

---

## Week 5: Merged Team - Full Rehearsal

**Objective:** Simulate a real client engagement from start to finish and create the documentation needed for a real facilitator to run the show.

1.  **Conduct Two Full Rehearsals:**
    *   Schedule two 90-minute meetings with at least 4-5 internal team members.
    *   One person is the designated **Facilitator**, another is the **Producer** (taking notes on bugs/issues).
    *   The Facilitator must **only** use the `/admin` panel to run the session.
    *   The Producer logs every single issue, no matter how small, into GitHub Issues with a special `rehearsal-bug` label.

2.  **Create the Facilitator Runbook:**
    Create a new file `docs/facilitator_runbook.md` in the project root.

    ```markdown
    # Facilitator Runbook: Council Engine v1

    ## Pre-Flight Checklist
    - [ ] Is the staging server running?
    - [ ] Have you created the council and received the invite code?
    - [ ] Have you logged into the `/admin/:councilId` panel?
    - [ ] Is the client on the call and ready?

    ## Running the Session

    ### Act 1: Onboarding & Response
    1.  Share the invite link with the client.
    2.  Monitor the admin panel as players join. Verbally confirm you see them.
    3.  Once all players are in, instruct them to submit their responses.
    4.  Monitor the admin panel to see who has submitted.

    ### Act 2: Deliberation Theater
    1.  Once all responses are in, click **Force Start Deliberation**.
    2.  The system will now automatically advance through the acts. Your job is to narrate what is happening.

    ## Common Failure Modes & Solutions

    *   **Problem:** A player gets disconnected.
        *   **Solution:** Have them rejoin using the same link. Their state is preserved.
    *   **Problem:** The deliberation hangs or an act doesn't advance.
        *   **Solution:** Use the **Force Advance Act** button.
    *   **Problem:** A player submits a problematic response.
        *   **Solution:** Before starting deliberation, use the **Edit Response** feature in the admin panel to correct it.
    ```

---

## Week 6: Merged Team - Client Prep & Polish

**Objective:** Fix all critical issues found during rehearsals and make a final decision on whether the tool is ready for a paid client.

1.  **Triage and Fix Critical Bugs:**
    *   Filter all GitHub Issues with the `rehearsal-bug` label.
    *   As a team, triage them into **P0 (Showstopper)**, **P1 (Must-Fix)**, and **P2 (Nice-to-Have)**.
    *   Spend the first three days of the week fixing all P0 and P1 bugs. P2 bugs are moved to the backlog.

2.  **Finalize the Runbook:**
    *   Review the `facilitator_runbook.md` one last time. Add any new failure modes discovered during the bug bash.
    *   Make sure the language is clear, concise, and actionable.

3.  **Hold a Go/No-Go Meeting:**
    *   Schedule a final 30-minute meeting at the end of the week.
    *   The only agenda item is the question: "Based on the stability of the tool and the clarity of the runbook, are we confident enough to run our first paid client session next week?"
    *   The decision must be a clear "Go" or "No-Go".
    *   If "No-Go", the team must define the exact conditions that must be met to get to "Go" and schedule a follow-up meeting.
