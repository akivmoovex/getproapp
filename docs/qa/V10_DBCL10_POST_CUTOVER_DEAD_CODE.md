# V10 DBCL10 — Post-Cutover Dead Code Sweep

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_DBCL10_POST_CUTOVER_DEAD_CODE` |
| **Date** | 2026-09-27 |
| **Prerequisite** | DBCL09 `DBCL09_LEGACY_SERVER_REVIEW_PASS` |
| **Mode** | Delete only statically + behaviorally proven dead code |

---

## Deleted / removed

| Item | Proof |
|------|-------|
| `src/platform/registration/statusCompatibility.js` | Empty maps post-DBCL07; zero runtime importers |
| `src/activeclinic/services/activeClinicPublicSchemaStatus.js` | Throw-only stub post-DBCL08; zero requires |
| `insertRole` / `updateRoleStatus` (`blessBoardAuthRepository`) | Zero callers post-DBCL06 freeze |
| `isReviewHold` / `isOperational` (`lifecycle.js`) | Never imported; product helpers stay private |
| `/__ac/public-schema-status` tombstone | Probe gone DBCL08; route unused |

## Explicitly kept

`server.legacy.js`, `compareLegacyHostContext`, audit `COLS_LEGACY`, `syncDraftToEngine`, overlay dual-write, `publishFromLegacy`, `blessboardBridge`, `v7CompatibleWebsitePublish`, classic CMS adapters, v4ToV5/v5ToV7, website backfills, `v8DbCompatibilityContract`, `organizationKeyCompat`, V5 session functions.

## Regression notes

- `test:architecture` PASS (7/7)
- DBCL07/08/10 + AC clinic-registration + unified registration + PL06: **67/67**
- BB RBAC foundation / staff-access / V2.02 legacy-removal / DBCL04: **72/72**
- `test:v8:regression` / BB+AC V8 gates: residual **pre-existing** failures unrelated to this sweep (host matrix PLATFORM_LINE, frontend media-picker pin, AC publish copy / Facility context / F07 availability)

---

```text
DBCL10_POST_CUTOVER_DEAD_CODE_PASS

FILES_DELETED: 2
FUNCTIONS_REMOVED: 5
LOC_REMOVED: ~266
```
