# Pentarchy v5.0 — Sovereign Stack Visualization

An interactive, animated single-page visualization of the complete Pentarchy v5.0 architecture: all 5 primary agents, 20 sub-agents, 8 infrastructure services, and the 26 Sphere Thread communication channels.

## Quick Serve (pre-built)

The `dist/` folder contains a fully built static bundle. Serve it with any static file server:

```bash
# Option 1 — Python (no install required)
cd stack-viz/dist
python3 -m http.server 8080
# Open http://localhost:8080

# Option 2 — npx serve
npx serve dist -p 8080

# Option 3 — via Docker (add to docker-compose.yml)
# See docker-compose.yml for the stack-viz service entry
```

## Features

- **25 agent nodes** — 5 primary agents (Torus, Prism, Relay, Watcher, Auditor) each with 4 sub-agents (SL1, SL2, PM, HB) orbiting them
- **26 Sphere Thread channels** — animated data packets flying across all communication paths: center↔primary, primary↔primary, primary↔sub, sub↔sub
- **Watch Us Learn** — 3× packet spawn rate with training mode cycling (Constitutional Drill, Perspective Sparring, Memory Consolidation, Synthesis Sprint, Escalation Simulation)
- **Show Fully Alive** — 2× packet spawn rate + plays `cashitout.mp3` at 50% volume
- **Web Audio engine** — UI click tones, packet sounds, ascending/descending chords on mode activation
- **♪ Sound toggle** — mutes all audio including the music track
- **VALUE_PULSE ticker** — cycles through all 13 constitutional values (LOVE, TRIBE, WORLD, SELF, …)
- **Infrastructure footer bar** — clickable service tiles for PostgreSQL, Redis, Sphere Engine, Council Engine, Sphere Bridge, Telegram Bridge, Sanctum API, Sanctum UI

## Rebuild from Source

```bash
cd stack-viz
npm install   # or: pnpm install
npm run build # output goes to dist/
```

## Add to Docker Compose

To serve the visualization as part of the stack, add this service to `docker-compose.yml`:

```yaml
  stack-viz:
    image: nginx:alpine
    volumes:
      - ./stack-viz/dist:/usr/share/nginx/html:ro
    ports:
      - "3005:80"
    restart: unless-stopped
```

Then visit `http://your-server:3005` after running `./install.sh`.
