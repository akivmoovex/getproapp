# V2.03 QA — BlessBoard Regression Test Readiness (QA10)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BB_REGRESSION_TEST_READINESS` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | QA09 · V10 consolidation / DB cleanup · [V2_03_TEST_COVERAGE_MATRIX](./V2_03_TEST_COVERAGE_MATRIX.md) · [V2_02_LEGACY_ROLE_ZERO_CHECK](./V2_02_LEGACY_ROLE_ZERO_CHECK.md) |
| **Mode** | MAP + ADD cutover / dual-write preservation proofs + curated regression pack |
| **Proof rule** | Surface evidence map + `user_roles` runtime R/W = 0 + URA behavior + **retain** website dual-write/bridge |
| **Verdict** | **`V203_BB_REGRESSION_TEST_READINESS_PASS`** |

---

## Surface → automated evidence

| Surface | Primary tests |
|---------|---------------|
| registration | `blessboard-register-church` · `blessboard-instant-free-registration` |
| login | `blessboard-phone-login` · `blessboard-auth-http` · `blessboard-tenant-auth` |
| HQ/branch | `blessboard-hq-shell` · `branch-admin-shell` · `hq-branch-user-creation` · `v2-01-shared-hq-branch-website` |
| RBAC | `blessboard-authorization` · `rbac-foundation` · `rbac-e2e` · `v2-02-legacy-rbac-removal` · `v2-02-bb-catalogue-only-rbac` |
| role assignment | `blessboard-hq-roles` · `staff-invitation` · `v10-dbcl04` |
| staff directory | `blessboard-staff-access` |
| seat/entitlement counts | `platform-entitlements` · `phase4-website-plan-entitlements` · `v10-dbcl04` (URA seats) |
| website editor | `v2-01-bb-inline-editor-parity` · `v7-shared-website-editor` |
| inline editing | `v2-01-bb-inline-editor-parity` · `v2-01-unpublished-changes-panel` |
| structured editing | `v2-01-shared-section-management` · `v2-bb-leadership-section-management` |
| image upload | `blessboard-p1-image-persistence` · `v2-01-universal-image-editor` · `v2-bb-sermon-image-persistence` |
| CMS | `blessboard-content-admin` · `v10-pc11-cms-convergence` · `v10-pl05-canonical-cms` |
| publish | `blessboard-p0-publish-auth` · `church-website-publish` · `v7-blessboard-publish-engine-bridge` · `phase4-publish-website` |
| versions | `phase3-website-publishing-history` |
| restore | `phase4-restore-previous-website` · `phase3-website-version-compare-restore` · `v2-01-field-history-restore` |
| public pages | `blessboard-public-pages` · `church-platform-public-pages` |
| sermons | `v2-bb-sermon-image-persistence` · `church-public-events-sermons-visual` |
| giving | `blessboard-giving` · `blessboard-finance-separation` · `church-public-giving-contact-visual` |
| events | `church-branch-announcements-events` · `church-growth-advanced-events` |
| ministries | `church-branch-ministries` · `church-public-home-ministries-regression` · `v2-bb-ministry-image-edit` |
| contact | `v2-bb-contact-hours-edit` · `v2-bb-contact-image-replace` · `bb-contact-stitch` |

---

## `user_roles` cutover proof

| Check | Result |
|-------|--------|
| Product runtime SQL `FROM`/`JOIN`/`INTO`/`UPDATE`/`DELETE` on `blessboard.user_roles` under `src/blessboard`, `src/church`, `src/platform` | **0** (allowlist: testing data-reset DELETE only) |
| Authz / session / assign / staff directory | `user_role_assignments` only |
| Seat counts (`countStaffAccountsForOrganization`) | Catalogue URA role keys |
| Freeze migration `116_freeze_legacy_user_roles.sql` | Retained |
| QA10 DB smoke | Assign → URA row; `user_roles` count 0; INSERT freeze rejects; seats ≥ 2 |

---

## Website dual-write / bridge (DO NOT REMOVE)

Preserved and asserted present:

- `src/platform/website-engine/blessboardBridge.js`
- Editor overlay dual-write in `blessboardWebsiteEditorRoutes.js` / adapters
- Publish `publishFromLegacy` path + `tests/v7-blessboard-publish-engine-bridge.test.js`

---

## Added this pass

- `tests/v203-bb-regression-test-readiness.test.js`
- `npm run test:v203:bb-regression` — curated pack covering required surfaces + QA10 readiness
- Critical coverage pack includes QA10 readiness file

---

## Verification

```text
npm run test:v203:bb-regression
→ 274 pass / 0 fail (5 skipped)
V203_BB_REGRESSION_TEST_READINESS_PASS
```

---

## DEFECTS

| Severity | Item |
|----------|------|
| — | **None** — product/runtime regression from V10 consolidation not found |

### Test-contract syncs applied this pass (not product defects)

| Fix | Why |
|-----|-----|
| `blessboard-branch-admin-shell` revoke fixture sets `revoked_at` | Align with `user_role_assignments_revoked_consistency` |
| Branch shell HQ label accepts catalogue `organisation administrator` | Legacy "Church HQ admin" display cutover |
| Public pages CSS pin `v=62` → `v=67` | Match shipped `tenant-public.css` cache bust |
| Inline editor actor `branch_administrator` | Catalogue actor key (not legacy `branch_admin`) |
| Field history / publish-bridge static asserts | Shared `handleRestoreFieldHistory` + governance adapter → `publishFromLegacy` dual-write retained |
