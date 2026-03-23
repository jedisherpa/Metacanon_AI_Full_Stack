# Workspace Contamination Matrix

> Superseded by [`WORKSPACE_SOURCE_OF_TRUTH.md`](/Users/paulcooper/Documents/Codex%20Master%20Folder/WORKSPACE_SOURCE_OF_TRUTH.md).
> Still useful as historical first-pass material.
> Not authoritative for new cleanup decisions.

Date: 2026-03-22
Root: `/Users/paulcooper/Documents/Codex Master Folder`

| Severity | Unit | Contamination | Evidence | Required Action |
| --- | --- | --- | --- | --- |
| High | `Codex Master Folder` umbrella repo | Product work mixed into umbrella repo | umbrella repo tracks `castle-member-diana` and `castle-member-liana` | Freeze umbrella as runtime-only root |
| High | `castle-member-diana` | Anna feature code still embedded | `client/src/features/anna` exists alongside `client/src/features/diana` | Extract Diana into its own repo and remove Anna carryover |
| High | `castle-member-diana` | Anna source assets embedded | `source/anna/*` exists inside Diana tree | Remove or archive during extraction |
| High | `castle-member-liana` | Anna source assets embedded | `source/anna/*` exists inside Liana tree | Remove or archive during extraction |
| High | `metacanon-ddos` | Misleading package identity | `package.json` name is `sovereign-jewel-next` | Promote to its own repo and rename package identity |
| High | `metacanon-ddos` | Duplicated jewel engine lineage | duplicated `components/*` and `lib/*` breakup and geometry stack | Record lineage and decide future canonical ownership later |
| High | `prism-feralpharaoh` and `anything-llm/frontend/src` | Byte-identical Prism and Metacanon overlay files exist in both trees | confirmed identical files for PrismHero and PrismDodecahedron and MetacanonAI and Prism components | Keep both products separate but annotate shared lineage explicitly |
| Medium | `prism-feralpharaoh` | Product repo still presents as `anything-llm-frontend` at package level | `package.json` name is `anything-llm-frontend` | Rename package identity when repo normalization starts |
| Medium | `anything-llm` | PrismAI overlay mixed into core product fork | Prism and Metacanon files live under `frontend/src` alongside base product | Track overlay as its own internal unit |
| Medium | `council-engine` and `lensforge-app` and `sphere-thread-engine` | Shared package identity obscures boundaries | all present as `council-engine` | Deep-pass this family before repo moves |
| Medium | non-repo app roots | Active products exist without repo boundaries | `sovereign-jewel-next` and `metacanon-ddos` and `council-engine` and `lensforge-app` are not repos | Promote or mark unmanaged explicitly |
| Low | generated artifacts mixed near source | `.next` and `target` and `.pnpm-store` and generated prisma outputs increase confusion | generated folders present beside active roots | Keep them excluded from product ownership decisions |

## Notes

- This matrix is for separation planning only.
- It does not prescribe code deletion in this pass.
- No source roots should be removed until the target repo/worktree matrix is approved.
