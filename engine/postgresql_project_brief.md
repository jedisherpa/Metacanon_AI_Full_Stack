# Project Brief: PostgreSQL Knowledge Base for My Sphere

## 1. Executive Summary

**Objective:** Migrate from file-based shared state (`my-sphere-thread.md`) to a production-grade PostgreSQL database that serves as the canonical knowledge base for the Constellation.

**Why PostgreSQL over SQLite:**
- **Concurrent writes:** Multiple agents can write simultaneously without WAL contention
- **JSONB:** Native JSON handling for agent outputs, constitutional metadata, synthesis artifacts
- **Full-text search:** Built-in tsvector for semantic query without external vector DB (initially)
- **Scalability:** Path to horizontal scaling via read replicas when we hit 10+ agents
- **Ecosystem:** Mature tooling, backups, monitoring, migration utilities

---

## 2. System Architecture

### 2.1 Deployment Model

**Option A: Local PostgreSQL (Immediate)**
```
Host: Ubuntu server (current OpenClaw host)
Port: 5432 (default)
Database: mysphere
Schema: constitutional
Auth: SCRAM-SHA-256 password auth
```

**Option B: Managed PostgreSQL (Future)**
- AWS RDS, Google Cloud SQL, or Supabase
- Automatic backups, scaling, monitoring
- SSL/TLS encryption in transit
- Private VPC networking

**Recommendation:** Start with Option A. Migrate to Option B when we need multi-region availability.

### 2.2 Database Schema

```sql
-- Core schema: constitutional
CREATE SCHEMA constitutional;

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- fuzzy text search

-- 1. EVENTS TABLE (The "File Ritual" made relational)
CREATE TABLE constitutional.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    thread_id VARCHAR(255) NOT NULL,
    message_id VARCHAR(255) UNIQUE, -- Telegram message ID for dedup
    agent_name VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'message', 'decision', 'synthesis', 'amendment', 'skill_invocation'
    content TEXT NOT NULL,
    content_vector TSVECTOR, -- for full-text search
    constitutional_article_cited VARCHAR(100),
    reply_to_id UUID REFERENCES constitutional.events(id),
    metadata JSONB DEFAULT '{}', -- platform-specific data (Telegram user IDs, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AGENT STATE TABLE (What each agent knows)
CREATE TABLE constitutional.agent_state (
    agent_name VARCHAR(100) PRIMARY KEY,
    last_read_event_id UUID REFERENCES constitutional.events(id),
    assigned_lens VARCHAR(100),
    cumulative_legibility_score DECIMAL(5,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'deprecated'
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SYNTHESIS ARTIFACTS TABLE (Constitutional outputs requiring ratification)
CREATE TABLE constitutional.artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    type VARCHAR(100) NOT NULL, -- 'daily_brief', 'ring_challenge', 'constitutional_amendment', 'hst_synthesis'
    title VARCHAR(500),
    content TEXT NOT NULL,
    source_event_ids UUID[] NOT NULL, -- array of events that fed into this
    agent_authors VARCHAR(100)[],
    sovereign_approval_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'ratified', 'rejected', 'superseded'
    ratified_at TIMESTAMPTZ,
    ratified_by VARCHAR(100), -- human identifier
    git_commit_hash VARCHAR(40), -- link to constitutional versioning
    metadata JSONB DEFAULT '{}' -- artifact-specific data
);

-- 4. PERSPECTIVE LENSES TABLE (The 12 PAAPE archetypes + Constellation assignments)
CREATE TABLE constitutional.lenses (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    shape VARCHAR(50) NOT NULL, -- 'tetrahedron', 'octahedron', 'star_tetrahedron', 'decagon', 'dodecahedron'
    epistemology TEXT NOT NULL,
    constitutional_role TEXT NOT NULL,
    storytelling_lens VARCHAR(100), -- 'Bone-Singer', 'Trickster-Engineer', 'Cartographer', 'Witness'
    system_prompt TEXT, -- the full prompt for this lens
    active_agent VARCHAR(100) REFERENCES constitutional.agent_state(agent_name),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. COMMUNICATION PROTOCOL LOG (Canonical rule enforcement)
CREATE TABLE constitutional.protocol_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    agent_name VARCHAR(100) NOT NULL,
    violated_rule VARCHAR(255) NOT NULL, -- 'unauthorized_response', 'missing_file_ritual', 'interpretation_drift'
    description TEXT NOT NULL,
    event_id UUID REFERENCES constitutional.events(id),
    resolution_status VARCHAR(50) DEFAULT 'unresolved', -- 'unresolved', 'acknowledged', 'corrected'
    corrected_by VARCHAR(100),
    corrected_at TIMESTAMPTZ
);

-- 6. SKILL EXECUTION LOG (For the new skills)
CREATE TABLE constitutional.skill_invocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    skill_name VARCHAR(100) NOT NULL, -- 'constellation-designer', 'constitutional-orchestrator'
    invoked_by VARCHAR(100) NOT NULL,
    parameters JSONB NOT NULL,
    result_status VARCHAR(50), -- 'success', 'failure', 'partial'
    result_artifact_id UUID REFERENCES constitutional.artifacts(id),
    execution_time_ms INTEGER
);

-- 7. CONSTITUTIONAL VERSIONING TABLE (Git integration)
CREATE TABLE constitutional.constitution_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_tag VARCHAR(50) NOT NULL UNIQUE, -- 'v3.0.1', 'v3.1.0-amendment-4'
    git_commit_hash VARCHAR(40) NOT NULL UNIQUE,
    amendment_description TEXT NOT NULL,
    ratified_at TIMESTAMPTZ NOT NULL,
    ratified_by VARCHAR(100) NOT NULL,
    document_content TEXT NOT NULL, -- full text of constitution at this version
    active BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX idx_events_timestamp ON constitutional.events(timestamp DESC);
CREATE INDEX idx_events_agent ON constitutional.events(agent_name);
CREATE INDEX idx_events_thread ON constitutional.events(thread_id);
CREATE INDEX idx_events_type ON constitutional.events(event_type);
CREATE INDEX idx_events_search ON constitutional.events USING GIN(content_vector);
CREATE INDEX idx_artifacts_status ON constitutional.artifacts(sovereign_approval_status);
CREATE INDEX idx_protocol_violations_agent ON constitutional.protocol_violations(agent_name);
```

### 2.3 Access Control (Row-Level Security)

```sql
-- Enable RLS on events
ALTER TABLE constitutional.events ENABLE ROW LEVEL SECURITY;

-- Policy: Agents can only insert their own events
CREATE POLICY agent_insert_own ON constitutional.events
    FOR INSERT
    WITH CHECK (agent_name = current_setting('app.current_agent'));

-- Policy: Agents can read all events (File Ritual requirement)
CREATE POLICY agent_read_all ON constitutional.events
    FOR SELECT
    USING (true);

-- Policy: Only sovereign can update/delete (via special role)
CREATE POLICY sovereign_modify ON constitutional.events
    FOR ALL
    USING (current_user = 'sovereign');
```

---

## 3. Implementation Steps

### Phase 1: Infrastructure Setup (Day 1)

**Step 1.1: Install PostgreSQL**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# Verify installation
sudo systemctl status postgresql
psql --version  # Should be 14+

# Create database and user
sudo -u postgres psql -c "CREATE DATABASE mysphere;"
sudo -u postgres psql -c "CREATE USER constellation WITH PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mysphere TO constellation;"
```

**Step 1.2: Configure PostgreSQL**
Edit postgresql.conf:
```
listen_addresses = 'localhost'
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
wal_buffers = 16MB
default_transaction_isolation = 'read_committed'
```

Edit pg_hba.conf:
```
local   mysphere    constellation                 scram-sha-256
host    mysphere    constellation   127.0.0.1/32  scram-sha-256
```

**Step 1.3: Install Python Dependencies**
```bash
pip install psycopg2-binary sqlalchemy alembic
```

### Phase 2: Schema Migration (Day 1-2)

**Step 2.1: Create Initial Schema**
Save schema to /tmp/schema.sql and execute:
```bash
sudo -u postgres psql mysphere < /tmp/schema.sql
```

**Step 2.2: Initialize Alembic for Migrations**
```bash
cd /home/oc/.openclaw/workspace
alembic init alembic

# Configure alembic.ini with:
# sqlalchemy.url = postgresql://constellation:password@localhost/mysphere

alembic revision --autogenerate -m "Initial constitutional schema"
alembic upgrade head
```

### Phase 3: Data Migration (Day 2-3)

**Step 3.1: Parse Existing my-sphere-thread.md**
Python script to extract events and insert into PostgreSQL with content_vector for search.

**Step 3.2: Seed Lens Data**
Insert the four Constellation agents with their assigned storytelling lenses.

### Phase 4: Agent Integration (Day 3-5)

**Step 4.1: Create Database Access Layer (db_client.py)**
- get_db_connection() - context manager for connections
- log_event() - insert with constitutional citation
- get_events_since() - File Ritual enforcement
- update_agent_state() - track last_read_event_id

**Step 4.2: Modify Agent SKILL.md files**
Update each agent to call database functions before/after responding.

### Phase 5: Backup & Monitoring (Day 5-6)

**Step 5.1: Automated Backups**
Backup script with 4-hour cron job, keeping last 30 backups.

**Step 5.2: Health Checks**
Python script to verify database connectivity and event count.

---

## 4. Integration with Existing Systems

### 4.1 Telegram Bot Integration
Log all messages to events table with event_type='telegram_message'.

### 4.2 Skill Integration
- Constellation Designer queries lenses and artifacts tables
- Constitutional Orchestrator writes to artifacts with sovereign_approval_status='pending'

### 4.3 Git Integration
Post-commit hook logs constitution changes to constitution_versions table.

---

## 5. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| SQL Injection | Parameterized queries only; SQLAlchemy ORM |
| Unauthorized access | Row-level security; agent-specific DB users |
| Data loss | 4-hour automated backups; point-in-time recovery |
| Eavesdropping | SSL/TLS for remote connections (when added) |
| Privilege escalation | Agents only have INSERT/SELECT on events; no DDL |

---

## 6. Success Criteria

- [ ] All agents can read/write to PostgreSQL concurrently
- [ ] File Ritual enforced: agents query last_read_event_id before responding
- [ ] Full-text search works: "find all decisions about Material Impact"
- [ ] Git commit hashes linked to constitutional amendments
- [ ] Daily backups automated and tested
- [ ] Migration from my-sphere-thread.md completed with zero data loss
- [ ] Response latency < 100ms for context retrieval

---

## 7. Timeline

| Day | Milestone |
|-----|-----------|
| 1 | PostgreSQL installed, schema created, initial migration |
| 2 | Data migration from markdown complete |
| 3 | Agent integration layer (db_client.py) complete |
| 4 | All four agents updated to use PostgreSQL |
| 5 | Backup, monitoring, health checks |
| 6 | Testing, optimization, documentation |
| 7 | Production cutover; my-sphere-thread.md deprecated |

---

## 8. Why This Architecture

| Constitutional Requirement | Technical Implementation |
|---------------------------|-------------------------|
| Human Sovereign authority | PostgreSQL owned by Paul; agents have constrained access |
| No autonomous interpretation | All writes logged with constitutional_article_cited |
| Audit trail | Git versioning + PostgreSQL timestamping |
| Explicit convergence | artifacts table requires sovereign_approval_status |
| File Ritual | agent_state.last_read_event_id enforces read-before-respond |

---

Ready to proceed with Phase 1 installation?
