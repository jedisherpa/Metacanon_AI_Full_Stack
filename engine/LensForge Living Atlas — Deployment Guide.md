# LensForge Living Atlas — Deployment Guide

**Target:** Hetzner CCX23 (Ubuntu 22.04)
**Domain:** `https://www.shamanyourself.com`
**Stack:** Node.js 20 + PostgreSQL + Nginx + PM2

---

## Project Structure

```
lensforge-app/
├── engine/                     # Backend API (council-engine + Living Atlas extensions)
│   ├── src/
│   │   ├── api/v1/             # Living Atlas TMA routes (NEW)
│   │   │   ├── atlasRoutes.ts      — GET /api/v1/atlas/state (main entry point)
│   │   │   ├── citadelRoutes.ts    — 12 governance endpoints
│   │   │   ├── forgeRoutes.ts      — 11 deliberation endpoints
│   │   │   ├── hubRoutes.ts        — 8 transmission endpoints
│   │   │   └── engineRoomRoutes.ts — 17 infrastructure endpoints
│   │   ├── api/v2/             # Existing admin + player API (unchanged)
│   │   ├── db/
│   │   │   ├── schema.ts           — Existing tables
│   │   │   └── schemaAtlas.ts      — NEW: user_profiles, sphere_votes, vote_choices, governance_events
│   │   ├── middleware/
│   │   │   └── telegramAuth.ts     — NEW: HMAC-SHA256 Telegram initData validator
│   │   ├── llm/
│   │   │   └── providers.ts        — Updated: Kimi (Moonshot) added as first-class provider
│   │   └── config/
│   │       └── env.ts              — Updated: TELEGRAM_BOT_TOKEN, KIMI_API_KEY added
│   └── drizzle/
│       └── 0002_living_atlas.sql   — NEW: DB migration for all 4 new tables
│
├── tma/                        # React Telegram Mini App (NEW)
│   ├── src/
│   │   ├── App.tsx                 — Root router
│   │   ├── lib/
│   │   │   ├── api.ts              — Typed API client (all 49 endpoints)
│   │   │   └── telegram.ts         — TG SDK wrapper + haptic feedback
│   │   ├── components/
│   │   │   ├── BottomNav.tsx       — 5-tab territory navigator
│   │   │   ├── LoadingScreen.tsx
│   │   │   └── ErrorScreen.tsx
│   │   └── pages/
│   │       ├── AtlasHome.tsx       — Living Atlas command center
│   │       ├── CitadelPage.tsx     — Governance: propose + vote
│   │       ├── ForgePage.tsx       — Deliberation: passport, lenses, drill
│   │       ├── HubPage.tsx         — Transmission: broadcast, escalations, members
│   │       └── EngineRoomPage.tsx  — Infrastructure: status, DB, glossary, constellations
│   └── package.json
│
├── deploy/                     # Server deployment scripts (NEW)
│   ├── deploy.sh               — One-command deploy script
│   ├── nginx.conf              — Nginx reverse proxy + SSL config
│   ├── ecosystem.config.cjs    — PM2 process manager config
│   └── setup_env.sh            — Environment variable setup script
│
└── lens-packs/
    └── hands-of-the-void.json  — The 12 PAAPE epistemological archetypes
```

---

## Prerequisites (on the Hetzner server)

Before running the deploy script, ensure the following are installed:

```bash
# 1. Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. pnpm
sudo npm install -g pnpm

# 3. PM2
sudo npm install -g pm2

# 4. PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# 5. Nginx
sudo apt-get install -y nginx

# 6. Certbot (for SSL)
sudo apt-get install -y certbot python3-certbot-nginx
```

---

## Step-by-Step Deployment

### Step 1: Upload the project to the server

From your local machine:
```bash
scp -r ./lensforge-app ubuntu@YOUR_SERVER_IP:/home/ubuntu/lensforge/
```

### Step 2: Create the PostgreSQL database

```bash
sudo -u postgres psql
```
```sql
CREATE DATABASE lensforge;
CREATE USER lensforge WITH ENCRYPTED PASSWORD 'choose_a_strong_password';
GRANT ALL PRIVILEGES ON DATABASE lensforge TO lensforge;
\q
```

### Step 3: Set up environment variables

```bash
cd /home/ubuntu/lensforge/lensforge-app/deploy
chmod +x setup_env.sh
./setup_env.sh
# Then edit the generated .env file:
nano /var/www/lensforge/app/.env
```

Fill in these values in the `.env` file:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://lensforge:YOUR_PW@localhost:5432/lensforge` |
| `TELEGRAM_BOT_TOKEN` | Your token from @BotFather |
| `KIMI_API_KEY` | `sk_REDACTED` |
| `LLM_PROVIDER_DEFAULT` | `kimi` |
| `CORS_ORIGINS` | `https://www.shamanyourself.com` |

### Step 4: Run the deploy script

```bash
cd /home/ubuntu/lensforge/lensforge-app/deploy
chmod +x deploy.sh
./deploy.sh
```

This script will:
1. Install system dependencies
2. Build the backend engine (`pnpm build`)
3. Build the React TMA (`pnpm build`)
4. Run the DB migrations
5. Configure Nginx with SSL via Certbot
6. Start the API with PM2 and configure auto-restart on reboot

### Step 5: Register the Mini App with @BotFather

1. Open Telegram and go to `@BotFather`
2. Select your bot → **Bot Settings** → **Menu Button**
3. Set the URL to: `https://www.shamanyourself.com`
4. Done. Share `t.me/YOUR_BOT_USERNAME` to start using it.

---

## Running DB Migrations Manually

If you need to run migrations separately:

```bash
cd /var/www/lensforge/app/engine
pnpm run db:migrate
```

The migration file `0002_living_atlas.sql` creates:
- `user_profiles` — Telegram user data + game stats
- `sphere_votes` — Governance proposals
- `vote_choices` — Individual votes on proposals
- `governance_events` — Immutable audit log of all governance actions

---

## PM2 Commands

```bash
# Check status
pm2 status

# View logs
pm2 logs lensforge-api

# Restart after .env changes
pm2 restart lensforge-api

# Stop
pm2 stop lensforge-api
```

---

## API Overview

All v1 endpoints require the `Authorization: tma <initData>` header, where `initData` is the raw Telegram `WebApp.initData` string.

| Territory | Prefix | Endpoints |
|---|---|---|
| Atlas (entry point) | `/api/v1/atlas/` | `GET /state`, `PATCH /profile` |
| Citadel (governance) | `/api/v1/citadel/` | `propose`, `vote`, `constitution`, `advice-process`, `ai-governance-review`, `emergency-shutdown`, `flag-impact`, `governance-meeting`, `governance-report`, `log-event`, `ratchet`, `proposals` |
| Forge (deliberation) | `/api/v1/forge/` | `passport`, `lens`, `my-lens`, `cxp`, `perspective`, `ask`, `converge`, `prism`, `run-drill`, `story`, `summarize` |
| Hub (transmission) | `/api/v1/hub/` | `broadcast`, `cancel-invite`, `decline`, `defer`, `escalations`, `everyone`, `sync`, `who-sees-what` |
| Engine Room (infra) | `/api/v1/engine-room/` | `status-all`, `db-health`, `db-view`, `deploy-constellation`, `drills`, `export`, `fallback-report`, `glossary`, `heartbeat-mute`, `list-constellations`, `pause-drills`, `resume-drills`, `sphere`, `what-is-a-sphere`, `config` (GET + PATCH) |

---

## WebSocket Channels

Connect to `wss://www.shamanyourself.com/ws/v2/{channel}/{id}?token=<jwt>`

| Channel | Purpose |
|---|---|
| `player/{gameId}` | Player-specific game events |
| `deliberation/{gameId}` | Sphere-wide governance + deliberation events |
| `admin/{sessionId}` | Admin console events |
| `broadcast/{sphereId}` | Hub broadcasts |

---

## Troubleshooting

**API returns 401 on all requests**
→ The `TELEGRAM_BOT_TOKEN` in `.env` doesn't match the token used to sign the `initData`. Double-check both values.

**DB migration fails**
→ Ensure the `DATABASE_URL` in `.env` is correct and the `lensforge` user has full privileges on the database.

**Nginx shows 502 Bad Gateway**
→ The backend isn't running. Check `pm2 status` and `pm2 logs lensforge-api`.

**TMA shows blank screen**
→ The TMA build may not have completed. Check `/var/www/lensforge/tma/dist/` — it should contain `index.html` and JS/CSS assets.

**SSL certificate not renewing**
→ Certbot auto-renewal is set up via a cron job. Test with: `sudo certbot renew --dry-run`
