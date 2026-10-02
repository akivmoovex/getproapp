# V2.02 Manual QA Handoff

**Verdict:** `V2_02_MANUAL_QA_CANDIDATE_FROZEN`  
**Authoritative prior gate:** `docs/qa/V2_02_QA_FIX_FINAL_GATE.md` → `V2_02_QA_FIXES_READY_FOR_MANUAL_RETEST`

---

## Freeze identity

| Field | Value |
|---|---|
| BRANCH | `V10` |
| PRE_FREEZE_HEAD | `c1a3911ae515121396ba5ec4b6e89f80ecc10121` |
| QA_CANDIDATE_SHA | `c73dd9b27fef0ee7483d708e2d9e8b56532221e4` |
| WORKTREE_AFTER_FREEZE | DIRTY — unrelated/pre-existing files intentionally excluded |
| PRODUCTION_STATUS | **UNTOUCHED** — no deploy, no production DB/env writes |

### Files committed (44)

Application + V2.02 tests/docs for announcements, sermon date, and Universal Image Editor structured framing/placement. See freeze commit `c73dd9b2`.

### Files excluded (left dirty)

`package.json`, `.gitignore`, `.c8rc.json`, V2.01/V2.03 docs & references, `tests/v203-*`, `scripts/analyze-test-coverage.js`, and pre-existing test-only churn (`blessboard-public-pages`, `branch-admin-shell`, `v7-blessboard-publish-engine-bridge`, `v2-01-bb-inline-editor-parity`, `v2-01-field-history-restore`).

---

## Scope of frozen candidate

Three BlessBoard QA remediations only:

1. **Announcements** — purpose-scoped `/hq|branch-admin/announcements/media/upload` via `announcements.manage`; private assets; kill-switch preserved; **no** `website.edit` grant for attachment upload.
2. **Sermons** — browser `YYYY-MM-DD` + ISO accepted; empty/locale/malformed/impossible dates → controlled **400**; URL policy unchanged.
3. **Universal Image Editor** — canonical `GpUniversalImageEditor.openFraming`; structured Category-A mounts; placement persist/render via platform helpers; **no** duplicated framing engine; **no** ActiveClinic application patches.

---

## Dirty-worktree classification (pre-commit)

### Included in freeze commit

| Classification | Paths |
|---|---|
| V2_02_ANNOUNCEMENTS_FIX | `src/blessboard/http/announcementAdminRoutes.js`, `src/blessboard/http/blessBoardMediaUploadHttp.js`, `src/blessboard/http/contentAdminRoutes.js` (shared upload helper + sermon date error copy) |
| V2_02_SERMON_FIX | `src/blessboard/services/publicContentAdminService.js`, `views/blessboard/v5/content-admin/entity-fields.ejs` |
| V2_02_IMAGE_EDITOR_FIX | `public/platform/website-inline-edit.js`, `public/blessboard/v5/website-structured-edit.js`, `src/blessboard/website/blessboardStructuredImageFraming.js`, `src/blessboard/website/entityImagePlacement.js`, `src/blessboard/website/sectionMediaDraftFields.js`, draft/apply/validation/load/render/cache services + BB public templates + `tenant-public-shell-end.ejs` cache bump |
| V2_02_TEST | `tests/v2-02-announcements-document-upload-regression.test.js`, `tests/v2-02-sermon-creation-regression.test.js`, `tests/v2-02-universal-image-editor-coverage.test.js`, `tests/v2-02-structured-image-framing-lifecycle.test.js`, `tests/helpers/v2-02-universal-image-editor-coverage-matrix.js`, `tests/blessboard-content-admin.test.js`, `tests/blessboard-v5-route-link-audit.test.js`, `tests/v2-01-universal-image-editor.test.js` |
| V2_02_QA_DOC | `docs/qa/V2_02_*.md` remediation/gate/handoff docs listed in commit |

### Excluded (left dirty / untracked)

| Classification | Paths |
|---|---|
| UNRELATED | `package.json` V2.03 scripts, `.gitignore`, `.c8rc.json`, `scripts/analyze-test-coverage.js`, all `docs/qa/V2_01_*` + references, all `docs/qa/V2_03_*`, all `tests/v203-*` |
| PRE_EXISTING | `tests/blessboard-branch-admin-shell.test.js`, `tests/v7-blessboard-publish-engine-bridge.test.js`, `tests/blessboard-public-pages.test.js` (CSS `?v=` assert catch-up only), `tests/v2-01-bb-inline-editor-parity.test.js` (actor key string), `tests/v2-01-field-history-restore.test.js` |

---

## Pre-commit verification (re-run)

| Gate | Result |
|---|---|
| Announcements regression | **5/5 PASS** |
| Sermons regression | **13/13 PASS** |
| Image editor coverage + lifecycle + v2-01 + placement | **PASS** (core pack **44/44**; Category **A 17/17**, **B 8/8**, **D 7/7**) |
| Security (authz + publish auth + V203 critical + AC hardening) | **PASS** (combined **49/49**; marker `V203_CRITICAL_PLATFORM_COVERAGE_PASS`) |
| BB editor/publish subset | **PASS** |
| AC website hardening | **PASS** |

Confirmations:

- NEW_STITCH_SCREENS = 0  
- NEW_MIGRATIONS = 0  
- PRODUCTION = UNTOUCHED  
- ANNOUNCEMENT_WEBSITE_EDIT_GRANTED = NO  
- MEDIA_KILL_SWITCH_BYPASSED = NO  
- URL_SECURITY_WEAKENED = NO  
- FRAMING_DUPLICATED = NO  
- AC_UNNECESSARILY_CHANGED = NO  

---

## Documented debt (do not fix in this freeze)

Preserve as known stale-test / non-blocker debt from `V2_02_QA_FIX_FINAL_GATE.md`:

1. **platform_publish_denied vs role** — fixture `platform_admin` vs code `platform_administrator` (STALE_TEST; BLOCKER=NO).
2. **Content Library vs Image Library** wording in `tests/v7-image-editor-coverage.test.js` (STALE_TEST; BLOCKER=NO).
3. **Registration E2E 301** — expects 200, app redirects with `website_edit=1` (STALE_TEST; BLOCKER=NO).

---

## Manual QA focus (candidate)

Retest only the three remediations on this SHA:

1. Announcements manager: upload supported document → private → attach → save → reload → publish; confirm unauthorized / kill-switch / cross-tenant / non-private still denied.
2. Sermons: create with browser date `YYYY-MM-DD` → save → reload; confirm bad dates stay 400 (never 503).
3. Structured/entity + inline images: Adjust Picture → zoom/move/fit/fill → save → reload → publish → public placement rendering.

Do not expand manual QA into the three stale-test items above unless tracking them as separate P2 debt.

---

## FINAL VERDICT

V2_02_MANUAL_QA_CANDIDATE_FROZEN
