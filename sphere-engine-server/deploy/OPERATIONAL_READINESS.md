# Operational Readiness Checklist (v3.2)

This checklist is the required sign-off artifact for the `Staging->Production Gate`.

Required signers:
- Prism Holder
- Commander

## Environment

- [ ] Runtime set to `production`
- [ ] `MISSION_STUB_FALLBACK_ENABLED=false` in production environment
- [ ] Governance policy root resolved to `governance/`
- [ ] Startup logs include governance checksums

## Migration Safety (Expand/Contract)

- [ ] Current deploy uses expand/contract-compatible migration plan
- [ ] Application version is backward-compatible with expanded schema
- [ ] Contract migration (if any) is deferred until all traffic is on compatible app version

## Backup and Restore

- [ ] Fresh production DB snapshot/backup created for this release
- [ ] Restore test executed against non-production DB using that snapshot
- [ ] Verified backup restore timestamp is within last 24 hours

Restore verification record:
- Backup ID:
- Backup timestamp (UTC):
- Restore test timestamp (UTC):
- Restore test owner:
- Restore test outcome:

## Rollback Readiness

- [ ] Application rollback target is identified and available
- [ ] DB rollback strategy decision recorded

DB rollback decision:
- [ ] Backward-compatible migrations allow app rollback without DB restore
- [ ] Migrations are not backward-compatible; restore-based rollback runbook validated

Restore-based rollback details (required if selected):
- Restore source snapshot:
- Restore execution command/runbook reference:
- Estimated restore time:

## Sign-off

- Prism Holder DID:
- Prism Holder signature/date:

- Commander DID:
- Commander signature/date:
