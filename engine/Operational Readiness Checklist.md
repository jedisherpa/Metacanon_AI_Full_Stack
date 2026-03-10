# Operational Readiness Checklist

**Version:** 1.1

**Date:** _______________

**Completed by:** _______________

**Sign-off (Prism Holder):** _______________

**Sign-off (Commander):** _______________

---

> This checklist must be completed and signed off by both the Prism Holder and the Commander before production deployment. No exceptions.

---

## Section 1: Infrastructure

- [ ] **Server:** Hetzner CCX23 is provisioned and accessible via SSH.
- [ ] **OS:** Ubuntu 22.04 LTS is installed and up to date (`apt update && apt upgrade`).
- [ ] **Firewall:** UFW is configured. Only ports 22 (SSH), 80 (HTTP), and 443 (HTTPS) are open.
- [ ] **Domain:** `shamanyourself.com` DNS A record points to the server public IP.
- [ ] **SSL:** Let's Encrypt certificate is valid and auto-renewing (`certbot renew --dry-run` passes).
- [ ] **Nginx:** Configuration is in place and tested (`nginx -t` passes).
- [ ] **PM2:** Installed and configured to start on system boot (`pm2 startup` executed).

---

## Section 2: Database

- [ ] **PostgreSQL:** Installed and running.
- [ ] **Database:** `lensforge_prod` database created.
- [ ] **User:** `lensforge_user` created with least-privilege access.
- [ ] **Migrations:** All migrations have been run and verified.
- [ ] **Migration Strategy:** Schema changes follow expand/contract migration policy.
- [ ] **Backups:** Automated daily backups are configured (for example, `pg_dump` cron job).
- [ ] **Backup Test:** A backup has been restored successfully to a non-production database.
- [ ] **Predeploy Restore Recency:** Verified successful restore timestamp is within last 24 hours.

---

## Section 3: Application

- [ ] **Environment Variables:** All required variables are set in `.env` (see `deploy/setup_env.sh`).
- [ ] **Secrets:** `TELEGRAM_BOT_TOKEN`, `KIMI_API_KEY`, `DATABASE_URL`, `CONDUCTOR_PRIVATE_KEY` are set.
- [ ] **Build:** `pnpm build` completes without errors for both `engine` and `tma`.
- [ ] **Health Check:** `GET /health` returns `{ status: "ok" }`.
- [ ] **Kill Switch Test:** `POST /api/v1/threads/halt-all` successfully halts all active threads.
- [ ] **Contact Lenses:** All 12 Contact Lens JSON files are present in `governance/contact_lenses/` and validate against schema.
- [ ] **High-Risk Registry:** `governance/high_risk_intent_registry.json` is present and correct.
- [ ] **Kimi Fallback Policy:** `fallback: "stub"` is disabled in production.

---

## Section 4: Monitoring & Alerting

- [ ] **Process Monitor:** PM2 is monitoring `engine` process and auto-restarts on crash.
- [ ] **Error Logging:** Application errors are written to `/var/log/lensforge/error.log`.
- [ ] **Uptime Monitor:** External monitor (for example, UptimeRobot) is configured for `https://shamanyourself.com/health`.
- [ ] **Alert Channel:** Downtime alerts notify Lead Developer via Telegram.

---

## Section 5: Rollback Plan

- [ ] **Rollback Procedure:** Documented and understood by Lead Developer:
  1. `pm2 stop lensforge-engine`
  2. `cd /opt/lensforge && git checkout <previous_stable_tag>`
  3. `pnpm install && pnpm build`
  4. `pm2 start ecosystem.config.cjs`
- [ ] **DB Compatibility Decision:** Rollback runbook defines whether schema is backward compatible or restore-based rollback is required.
- [ ] **Restore-Based Rollback Path:** If schema is not backward compatible, documented restore procedure is ready and tested.
- [ ] **Rollback Trigger:** Execute rollback within 24 hours for any of:
  - P0 bug (system non-functional)
  - Constitutional violation (mission executes without required Prism Holder approval)
  - System downtime > 15 minutes
- [ ] **Rollback Authority:** Lead Developer may execute rollback without waiting for additional approval.

---

## Section 6: Secrets Rotation

- [ ] **Initial Secrets:** All secrets were generated fresh for production (no dev secrets in production).
- [ ] **Rotation Schedule:** Reminder set to rotate all secrets every 90 days.
- [ ] **Rotation Procedure:** Documented in `deploy/SECRETS_ROTATION.md`.

---

## Section 7: First Production Missions

- [ ] **Constitutional Observer:** Designated observer is available for first 3 production missions.
- [ ] **Secondary Observer:** Secondary observer is identified in case primary is unavailable.
- [ ] **Mission Quality Scorecards:** Blank scorecards are prepared for first 3 missions.
- [ ] **Halt Procedure:** Observer knows how to execute `POST /api/v1/threads/halt-all` if violation is detected.

---

**All items above must be checked before proceeding to production deployment.**
