# BlessBoard V5 — Demo dataset local rehearsal

**Date:** 2026-07-19  
**Mode:** Local disposable foundation only — **not** hosted production / hosted V5  
**Companions:** [`V5_DEMO_DATASET_TOOL.md`](./V5_DEMO_DATASET_TOOL.md) · [`V5_DEMO_MINIMUM_DATASET.md`](./V5_DEMO_MINIMUM_DATASET.md)

**Environment type:** local_ephemeral_foundation  
**Identity key:** `blessboard-platform-v5`  
**Deployment:** `blessboard-org-v5`  
**Org / church / host keys:** `rehearsal-demo` / `rehearsal-demo` / `rehearsal-demo.blessboard.test`  
**Admin host fingerprint:** `lo***`  
**Ephemeral DB name pattern:** `blessboard_ft_*` (exact name omitted from docs; DB dropped after rehearsal)

No credentials, passwords, or database URLs are recorded in this file.

---

## Stage table

| Stage | Command | Result | Records | Conflicts | Evidence |
|-------|---------|--------|---------|-----------|----------|
| 0. Bootstrap ephemeral foundation | resetFoundationDatabase + migrate + ensureDatabaseIdentity | PASS | foundation schemas + seeds + identity | none | db_name_prefix=blessboard_ft_; identity=blessboard-platform-v5 |
| 1. Plan | npm run demo:v5:plan -- (dry-run default) | PASS | {"total":24,"by_status":{"planned":23,"skipped":1}} | 0 | mode=dry_run; status=planned |
| 2. Dry run | demo:v5 with --dry-run | PASS | {"total":24,"by_status":{"planned":23,"skipped":1}} | 0 | requires_confirm=true |
| 3. Apply with confirmation (CMS) | npm run demo:v5:apply -- --confirm … | PASS | {"total":26,"by_status":{"applied":24,"already_present":1,"skipped":1}} | 0 | status=applied; cleanup_index=25 |
| 3b. Persona provision (approved user/role services) | createBlessBoardUser + assignBlessBoardRole (in-process; password not logged) | PASS | demo.hq+rehearsal@example.test:church_hq_admin:assigned; demo.pa+rehearsal@example.test:platform_admin:assigned; demo.ba+rehearsal@example.test:branch_admin:assigned | none | persona_count=3 |
| 3c. Apply ops with --actor-email | demo:v5:apply -- --confirm … --actor-email … | PASS | {"total":32,"by_status":{"already_present":26,"applied":6}} | 0 | status=applied |
| 4. Verification | SQL + service list checks (identity/domain/content/ops/entitlement/legacy) | PASS | demo_pages=8; ops={"announcements":1,"resources":1,"forms":1,"attendance_events":1,"giving_entries":1} | n/a | {"identity_ok":true,"deployment_ok":true,"org_ok":true,"enrolment_ok":true,"domain_ok":true,"church_ok":true,"hq_ok":true,"primary_ok":true,"users_ok":true,"content_ok":true,"ops_ok":true,"entitlement_ok":true,"no_duplicates":true,"no_legacy":true} |
| 5. Second apply | npm run demo:v5:apply -- --confirm (repeat) | PASS | {"total":32,"by_status":{"already_present":32}} | 0 | PASS — second apply reported already_present for core demo entities; no duplicates |
| 6. Cleanup / rollback rehearsal | soft-archive demo-marked pages/sections/entities (no hard DELETE) | PASS | {"pages_archived":8,"sections_archived":8,"leaders_archived":1,"ministries_archived":1,"events_archived":1,"sermons_archived":1,"contact_channels_archived":1,"giving_methods_archived":1,"announcements_archived":1,"resources_archived":1,"forms_archived":1,"attendance_events_left":1,"giving_entries_left":1,"marker":"[Demo]","method":"soft_archive_demo_marked_rows"} | none | attendance/giving left labeled; ephemeral DB will be dropped |

---

## Verification checklist

| Check | Result | Evidence |
|-------|--------|----------|
| Database identity | PASS | `blessboard-platform-v5` / `testing` |
| Deployment | PASS | `{"deployment_code":"blessboard-org-v5","status":"active"}` |
| Organization | PASS | `rehearsal-demo` status=`active` |
| Enrolment | PASS | `{"status":"active","product_tenant_key":"rehearsal-demo"}` |
| Domain | PASS | hostname=`rehearsal-demo.blessboard.test` deployment=`blessboard-org-v5` |
| Church | PASS | `rehearsal-demo` |
| HQ branch | PASS | key=`hq` type=`hq` |
| Primary branch | PASS | `{"branch_key":"hq","is_primary":true,"branch_type":"hq","status":"active"}` |
| Users and roles | PASS | 3 role rows for PA/HQ/BA personas |
| Public content | PASS | pages=8 demo; leader/ministry/event present |
| Operational content | PASS | `{"announcements":1,"resources":1,"forms":1,"attendance_events":1,"giving_entries":1}` |
| Package entitlement | PASS | `{"plan_key":"free","status":"active"}` |
| No duplicate records | PASS | `{"leader":false,"ministry":false,"event":false,"announcement":false,"giving_entry":false}` |
| No legacy table use | PASS | tenants=false session=false |

---

## Idempotency

- **First apply:** ok=true; {"total":26,"by_status":{"applied":24,"already_present":1,"skipped":1}}
- **Second apply:** ok=true; {"total":32,"by_status":{"already_present":32}}
- **Verdict:** PASS — second apply reported already_present for core demo entities; no duplicates

---

## Cleanup / rollback rehearsal

- **Supported method:** soft-archive demo-marked CMS/ops rows (titles containing `[Demo]`, `layout_metadata.bb_demo`, `section_key=demo_body`, giving reference `bb-demo-v5:*`).
- **Hard delete:** not used (no DELETE SQL teardown CLI).
- **Result:** {"pages_archived":8,"sections_archived":8,"leaders_archived":1,"ministries_archived":1,"events_archived":1,"sermons_archived":1,"contact_channels_archived":1,"giving_methods_archived":1,"announcements_archived":1,"resources_archived":1,"forms_archived":1,"attendance_events_left":1,"giving_entries_left":1,"marker":"[Demo]","method":"soft_archive_demo_marked_rows"}
- **Ephemeral DB:** dropped after rehearsal

---

## Defects found

During rehearsal, one tool defect was found and **fixed before the successful run**:

- Demo form schema omitted required `version: 1` → create failed with `schema_version`. Updated `demoMinimumDatasetSpec.js` FORM schema.

No remaining defects on the successful local rehearsal pass.

---

## Readiness for supervised hosted use

CONDITIONALLY READY for **supervised** hosted use: local plan/dry-run/apply/idempotency/cleanup succeeded. Hosted still requires operator confirmation phrase, correct hosted identity, unset `GETPRO_DATABASE_URL`, and a disposable/approved org key — do not point at production congregations.

---

## Notes

- Operator `.env` may point at hosted databases; this rehearsal **did not** use that URL (child processes got an explicit ephemeral `DATABASE_URL` only).
- Personas used disposable `@example.test` emails; passwords were generated in-memory and never written to disk.
- Ops content requires `--actor-email` of an existing staff user (created via approved `createBlessBoardUser` / role assign services during rehearsal).
- Reproducible runner (local only): `node scripts/rehearse-demo-v5-dataset-local.js`
