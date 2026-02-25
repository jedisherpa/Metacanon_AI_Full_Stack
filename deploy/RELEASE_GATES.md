# Release Gates (v3.2)

## Canonical Gate Names

1. `Governance Sign-off Gate`
- Gate rule: Prism Holder signs `governance/synthesis_report.md`

2. `Local Readiness Gate`
- Gate rule: Commander signs local system readiness at end of Day 5

3. `Staging->Production Gate`
- Gate rule: Prism Holder + Commander sign `deploy/OPERATIONAL_READINESS.md`

## Track Dependencies

- Track B runs in parallel from Day 1 and is not blocked by Track A start.
- Track C cannot begin until both `Governance Sign-off Gate` and `Local Readiness Gate` have passed.
