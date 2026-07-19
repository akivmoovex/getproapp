# BlessBoard V5 — Demo minimum dataset tool

**Date:** 2026-07-19  
**Companions:** [`V5_DEMO_MINIMUM_DATASET.md`](./V5_DEMO_MINIMUM_DATASET.md) · [`V5_DEMO_PROVISIONING_COMMAND_AUDIT.md`](./V5_DEMO_PROVISIONING_COMMAND_AUDIT.md) · [`V5_DEMO_TENANT_REMEDIATION_PLAN.md`](./V5_DEMO_TENANT_REMEDIATION_PLAN.md)

**Purpose:** One safe CLI that prepares the **sparse** V5 demo content set for a single organization / church / deployment. Dry-run by default. Writes require `--confirm`.

**Do not run against hosted production data.** Use ephemeral or approved testing databases only.

---

## Commands

```bash
# Plan (dry-run — default)
DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… npm run demo:v5:plan -- \
  --organization-key diagnostic-church \
  --church-key diagnostic-church \
  --deployment blessboard-org-v5 \
  --hostname diagnostic.blessboard.org

# Apply (explicit confirm)
DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… npm run demo:v5:apply -- --confirm \
  --organization-key diagnostic-church \
  --church-key diagnostic-church \
  --deployment blessboard-org-v5 \
  --hostname diagnostic.blessboard.org \
  --actor-email demo.hq+smoke@example.test
```

| npm script | Behavior |
|------------|----------|
| `demo:v5:plan` | `node db/scripts/demo-v5-dataset.js` (dry-run unless `--confirm`) |
| `demo:v5:apply` | Same entrypoint; pass `--confirm` to write |

Optional: `--actor-email` of an **existing** staff user (created via `blessboard:user:create` / role assign). Required to apply announcement / resource / form / attendance / giving entry rows. Without it, CMS/content still applies; ops rows are skipped (or planned in dry-run).

---

## Safety gates

| Gate | Behavior |
|------|----------|
| Dry-run default | No writes unless `--confirm` (and not combined with `--dry-run`) |
| Identity | `DATABASE_IDENTITY_EXPECTED` must match `platform.database_identity` |
| Deployment | `--deployment` must exist, be `active`, and match `PLATFORM_DEPLOYMENT_CODE` when that env is set |
| GETPRO | Refuses if `GETPRO_DATABASE_URL` is set |
| Legacy tables | Refuses if `public.tenants` or `public.session` exist |
| Explicit keys | Requires `--organization-key`, `--church-key`, `--deployment` |
| No passwords | Never creates users or credentials — use approved user CLIs |
| Conflict stop | Stops if a non-demo published/custom page is present |
| Legacy SQL | Uses only existing V5 schemas/services — no `public.church_*` directory fill |

Stdout = JSON machine report; stderr = short human summary. Secrets are redacted.

---

## Records planned (sparse)

Aligned with [`V5_DEMO_MINIMUM_DATASET.md`](./V5_DEMO_MINIMUM_DATASET.md). Spec constants live in `src/blessboard/services/demoMinimumDatasetSpec.js`.

### Catalogue (idempotent provision if missing)

- Platform org + BlessBoard enrolment + domain (needs `--hostname` when org missing)
- Church + HQ branch `hq`

### CMS / public content

| Record | Demo marker |
|--------|-------------|
| 8 pages (`home`…`giving`) + `demo_body` section each | Titles/copy include `[Demo]`; `layout_metadata.bb_demo` |
| 1 leader | `Alex Rivera (Demo)` |
| 1 ministry | `[Demo] Welcome Team` |
| 1 event | `[Demo] Midweek Gathering` (D0+3) |
| 1 sermon | `[Demo] Introduction` (D0−7) |
| 1 contact channel | `demo.contact@example.test` |
| 1 giving method | `[Demo] Bank transfer info` |

### Ops (requires `--actor-email`)

| Record | Demo marker |
|--------|-------------|
| 1 announcement | `[Demo] This week` |
| 1 resource | `[Demo] Welcome leaflet` |
| 1 form | `[Demo] Feedback` |
| 1 attendance event + entry | `[Demo] Sunday service`, adults=8 |
| 1 giving entry | reference `bb-demo-v5:giving-entry`, amount 12.50 |

### Explicitly omitted

- Users / passwords / role grants (use `blessboard:user:*`)
- Member registration / member requests (smoke UI)
- Media binaries (upload via media picker)
- Apex V4 directory rows (`public.church_*`)
- Second campus / vanity metrics

---

## Idempotency

- Match existing rows by deterministic demo titles / names / references.
- Second apply reports `already_present` for entities; may re-assert page publish + metadata.
- Relative dates use calendar D0 (UTC day of run) for event / sermon / attendance / giving.

---

## Conflict behavior

Stops with `status=conflict` when a target `public_pages` row is:

- published or archived **and** not demo-owned (`[Demo]` in title or `layout_metadata.bb_demo`), or
- draft with a **custom** non-default title (not the empty-shell defaults Home/About/…)

Does **not** overwrite real published tenant content. Resolve manually (unpublish / rename) then re-run.

---

## Cleanup identification

Report includes `cleanup_index` and notes:

| Marker | Where |
|--------|--------|
| `[Demo]` | Titles, headings, copy |
| `section_key=demo_body` | Page sections |
| `layout_metadata.bb_demo` / `bb_demo_tool=demo:v5` | Pages & sections |
| `bb-demo-v5:*` | Giving entry reference |

Prefer soft-unpublish / archive via product UI. Do not invent hard-delete SQL.

---

## Implementation map

| Piece | Path |
|-------|------|
| Spec | `src/blessboard/services/demoMinimumDatasetSpec.js` |
| Service | `src/blessboard/services/demoMinimumDatasetService.js` |
| CLI | `db/scripts/demo-v5-dataset.js` |
| Shared safety | `db/scripts/lib/provisionCliSafety.js` |
| Tests | `tests/blessboard-demo-v5-dataset.test.js` |

---

## Tests

```bash
npm run test:blessboard:demo-v5-dataset
```

Covers: dry-run, first apply, second apply, non-demo conflict, wrong identity, wrong deployment, cleanup identification, no legacy table usage in tool sources.
