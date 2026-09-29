# V2.04 — QA Release Freeze + Handoff

**Status:** FROZEN · HOSTED ACCEPTANCE PASS  
**Date:** 2026-09-29  
**Branch:** V4  
**Gate:** `QA_RELEASE_FREEZE_HANDOFF`

---

## 1. Frozen application candidate

| Field | Value |
| --- | --- |
| `FROZEN_QA_CANDIDATE` | `117b03ef4b96bb1e859190dcb10fa7d3035e045f` |
| Short SHA | `117b03ef4b96` |
| Branch | `V4` |
| Environment | `testing` |
| Deployment | `moovex-platform-v8-testing` |
| Hosts | `blessboard.neuniversity.org`, `activeclinic.neuniversity.org` |

At freeze verification:

| Check | Result |
| --- | --- |
| `git branch --show-current` | `V4` |
| `git rev-parse HEAD` | `117b03ef4b96bb1e859190dcb10fa7d3035e045f` |
| `git rev-parse origin/V4` | `117b03ef4b96bb1e859190dcb10fa7d3035e045f` |
| `HEAD_ORIGIN_PARITY` | **PASS** |

Any **docs-only** tip after this freeze does **not** reopen application behavior. The authoritative **application** QA candidate remains **`117b03ef4b96…`**.

---

## 2. Hosted candidate (read-only)

| Field | Value |
| --- | --- |
| `BB_HOSTED_SHA` | `117b03ef4b96` |
| `AC_HOSTED_SHA` | `117b03ef4b96` |
| `SHA_PARITY` | **PASS** |
| `HOSTED_QA_CANDIDATE` | **PASS** |
| Hosted branch label | `UNKNOWN testing` |
| `HOSTED_BRANCH_METADATA_DEBT` | `GETPRO_GIT_BRANCH` not configured on Hostinger |
| Branch metadata functional blocker | **NO** |

Recommended later (operator, not a release blocker):

```text
GETPRO_GIT_BRANCH=V4
```

---

## 3. Frozen color-system evidence

Authoritative sources: `docs/qa/V2_04_COLOR_SYSTEM_FINAL_FREEZE.md`, `docs/qa/V2_04_COLOR_MIGRATION_BATCH_8.md`.

| Metric | Frozen value |
| --- | ---: |
| `FOUNDATION_COMPARABLE_BASELINE` | **1291** |
| `FINAL_RAW_COLORS` | **41** |
| `TOTAL_LOCATIONS_REMOVED` | **1250** |
| `FINAL_MIGRATION_PERCENT` | **96.8** |
| `UNJUSTIFIED_PLATFORM_GUI_RAW_COLORS` | **0** |

Retained raw colors (41):

| Category | Count |
| --- | ---: |
| `TENANT_BRANDING_RETAINED` | **8** |
| `CONTENT_COLOR_RETAINED` | **23** |
| `BRAND_ASSET_RETAINED` | **2** |
| `PRINT_EXPORT_RETAINED` | **8** |

Architecture health:

| Metric | Value |
| --- | ---: |
| `UNDEFINED_TOKENS` | **0** |
| `CIRCULAR_REFERENCES` | **0** |
| `COMPATIBILITY_ALIASES` | **0** |
| `SEMANTIC_DUPLICATION_GROUPS` | **0** |
| `UNUSED_TOKENS` | **0** |
| `DEPRECATED_TOKENS` | **0** |
| `MAX_ALIAS_CHAIN` | **2** |

Do **not** reopen migration batches 1–8 unless evidence shows these frozen numbers are invalid.

Brand primaries (authoritative):

| Surface | Primary |
| --- | --- |
| BlessBoard | `#6c5ce7` |
| ActiveClinic public / auth | `#006068` |
| ActiveClinic staff | `#2563eb` |

---

## 4. Frozen hosted acceptance (neuniversity testing)

Gate: `FINAL_HOSTED_ACCEPTANCE` against candidate `117b03ef4b96…`.

| Area | Result |
| --- | --- |
| `HOSTED_RELEASE_CANDIDATE` | **PASS** |
| `CACHE_BUST_HOSTED` (`v204-qa-1`) | **PASS** |
| `AC_HOME_PRIMARY_CTA` | **PASS** (`#006068`) |
| `AC_CLINIC_PRIMARY_CTA` | **PASS** (`#006068`) |
| `AC_LOGIN_PRIMARY_CTA` | **PASS** (`#006068`) — prior cache failure resolved |
| `BB_THEME_SMOKE` | **PASS** (`#6c5ce7`) |
| `HOSTED_BRAND_ISOLATION` | **PASS** (`BB_TOKEN_LEAK_INTO_AC=0`, `AC_TOKEN_LEAK_INTO_BB=0`) |
| `HOSTED_RESPONSIVE_THEME_SMOKE` | **PASS** (desktop + 390px) |
| `BB_QA_LOGIN` | **PASS** (testing-only password-reset sync) |
| `BB_REPEAT_EDIT_HOSTED` | **PASS** (saves 1–3, final value, 0 false conflicts) |
| `BB_HOSTED_POST_SAVE_TOKEN_SYNC` | **PASS** |
| `BB_HOSTED_SHARED_KEY_TOKEN_SYNC` | **PASS** |
| `HOSTED_TRUE_CONCURRENT_EDIT_DETECTION` | **PASS** (409 stale second session) |
| `AC_REPEAT_EDIT_HOSTED` | **PASS** |
| `DRAFT_PUBLISH_SEPARATION` | **PASS** |
| `BB_ROUTE_HEALTH` / `AC_ROUTE_HEALTH` | **PASS** |
| Final | **`V2_04_FINAL_HOSTED_ACCEPTANCE_PASS`** |

Supporting commits (ancestors of freeze tip):

| Commit | Role |
| --- | --- |
| `5a99cd68…` | Product-scoped theme alias hotfix |
| `fe269ce7…` | Mini-website repeat-edit / token sync |
| `117b03ef…` | Static asset cache-bust (`v204-qa-1`) + freeze tip |

Cache strategy: centralized `V204_BROWSER_ASSET_VERSION` in `src/platform/ui/theme/browserAssetVersion.js`. Static assets remain long-cacheable; URL `?v=` must bump when V2.04 theme/editor assets change.

---

## 5. Pronline / V10 + production

| Check | Result |
| --- | --- |
| Pronline BB/AC `branch` | `V10` |
| Pronline BB/AC `gitSha` | `05b2afe1caff` |
| `PRONLINE_V10_PRESERVED` | **PASS** |
| Production deploy / DB / credential / env mutation | **NONE** |
| `PRODUCTION` | **UNTOUCHED** |

---

## 6. What this freeze authorizes / forbids

**Authorized**

- Treat `117b03ef4b96…` as the V2.04 testing QA application candidate.
- Use neuniversity hosted evidence above for release readiness of V2.04 color system + mini-website repeat-edit.
- Operator follow-ups: configure `GETPRO_GIT_BRANCH=V4`; keep testing QA credentials synced via `blessboard:user:password-reset` (stdin only).

**Forbidden without a new gate**

- Application behavior changes, theme token redesign, editor concurrency weakening.
- Reopening color migration batches for cosmetic cleanup.
- Production deploy / restart / DB mutation.
- Pronline / V10 mutation or V2.04 testing on pronline.

---

## 7. Handoff checklist (next owners)

1. **QA / Release:** Cite this freeze + `V2_04_FINAL_HOSTED_ACCEPTANCE_PASS` for V2.04 testing sign-off.  
2. **Ops:** Optional Hostinger `GETPRO_GIT_BRANCH=V4` (metadata only).  
3. **QA data:** Prefer testing-only `npm run blessboard:user:password-reset -- --email <qa> --password-stdin --confirm` when credentials drift; never commit passwords.  
4. **Future CSS/JS theme edits:** Bump `V204_BROWSER_ASSET_VERSION` (or successor) so browsers invalidate prior caches.  
5. **Production:** Separate deliberate promotion gate — not this freeze.

---

## 8. Freeze verdict

```text
VERSION=2.04
BRANCH=V4
GATE=QA_RELEASE_FREEZE_HANDOFF
FROZEN_QA_CANDIDATE=117b03ef4b96bb1e859190dcb10fa7d3035e045f
HEAD_ORIGIN_PARITY=PASS
HOSTED_QA_CANDIDATE=PASS
HOSTED_BRANCH_METADATA_DEBT=GETPRO_GIT_BRANCH not configured
COLOR_SYSTEM_FROZEN=PASS
HOSTED_ACCEPTANCE_FROZEN=PASS
PRONLINE_V10_PRESERVED=PASS
PRODUCTION=UNTOUCHED
FINAL=V2_04_QA_RELEASE_FREEZE_PASS
```
