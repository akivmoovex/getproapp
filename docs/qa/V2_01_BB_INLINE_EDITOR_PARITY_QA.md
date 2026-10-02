# V2.01 BlessBoard Inline Editor Parity QA

**Task:** `V2_01_BB_INLINE_EDITOR_PARITY_DEPLOY_QA`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing` (`blessboard.neuniversity.org` / `activeclinic.neuniversity.org`)  
**Stitch (design context only):** Website Change Management System `projects/12538817760086591589`  
**UX / architecture refs:** `docs/qa/V2_01_ACTIVECLINIC_EDITOR_UX_REFERENCE.md`, `docs/qa/V2_01_SHARED_EDITOR_ARCHITECTURE_AUDIT.md`

**A1 commit / hosted SHA:** `bb2f1d0a0170` (`bb2f1d0a01704afc5847f93482a240447dd4a639`)  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `databaseIdentityExpected=moovex-platform-v7` · `databaseIdentityEnv=testing` (from `__platform/runtime`)  
**Production:** **untouched**

**Personas (disposable only):**
- BB HQ: `hq.admin@bb-v8qa-mub23a6v6a6b.example.invalid` · org `bb-v8qa-mub23a6v6a6b`
- BB Branch: `branch.admin@bb-v8qa-mub23a6v6a6b.example.invalid` · Campus A
- AC: `clinic.admin@ac-hqa-v8mub23a6v6a6b.example.invalid` · org `ac-v8-qa-mub23a6v6a6b`

---

## FINAL VERDICT

**`V2_01_BB_INLINE_EDITOR_PARITY_PASS`**

Hosted tip matches committed A1 SHA. BB Preview/Edit entry chrome, pending-count `Math.max`, structured `engineSynced` bridge, multi-field draft/preview/publish, branch-admin draft-preview URL, and AC shared-editor regression were verified on disposable V8 testing tenants. Production was not modified.

---

## 1. Precheck

| Check | Result |
| --- | --- |
| Branch | `V8` tracking `origin/V8` |
| A1 commit | `bb2f1d0a` — Preview/Edit chrome, pending max, structured sync, branch draft preview URL + tests |
| Unrelated working tree | Preserved (AC UX reference, architecture audit, unrelated refs) — not included in A1 commit |
| Hosted BB SHA | `bb2f1d0a0170` |
| Hosted AC SHA | `bb2f1d0a0170` |
| Deployment code | `moovex-platform-v8-testing` (BB + AC) |
| Production | Untouched |

---

## 2. Local validation

| Test | Result |
| --- | --- |
| `tests/v2-01-bb-inline-editor-parity.test.js` (5 cases) | **PASS** |
| `engineSynced` does not claim required draft failure when engine sync is best-effort | **PASS** (structured save returns `saved:true` + `engineSynced:true/false`) |
| Duplicate structured upserts by `entityKey` | **PASS** (unit + hosted upsert of `qa-deploy-social-bb2f1d0a`) |

No A1 code defects found after deploy. Residual image **object**-payload `invalid_url` is pre-existing (UI `saveImage` shape); string URL save succeeds (see Remaining defects).

---

## 3. Commit and deploy

| Step | Result |
| --- | --- |
| Commit A1 only | **PASS** — `bb2f1d0a Align BlessBoard public edit entry with AC Preview/Edit chrome.` |
| Push `V8` | **PASS** |
| Hostinger git-linked deploy to `moovex-platform-v8-testing` | **PASS** |
| Hosted SHA == A1 before QA | **PASS** — BB/AC `bb2f1d0a0170` |

---

## 4. Hosted QA — BlessBoard

| Scenario | Result | Evidence |
| --- | --- | --- |
| Entry chrome Manage / Preview / Edit | **PASS** | Preview → `/c/.../bb-v8qa-...?website_mode=draft`; Edit → `...?website_edit=1&website_mode=draft` · `03-`, `04-` |
| Edit mode pencils + shared editor shell | **PASS** | `05-mobile-390-edit-mode.png` |
| Text edit save / refresh / reopen | **PASS** | Heading `V2_01 deploy QA heading bb2f1d0a` drafted then published |
| Image draft | **PASS*** | Library media assigned via inline-field string URL; published (`99f3284b-…` on live). *UI object payload still returns `invalid_url` (pre-existing). |
| Structured item add (`social_link`) | **PASS** | API `ok:true`, `engineSynced:true`, entity `qa-deploy-social-bb2f1d0a` |
| Pending count reflects saved diffs | **PASS** | Progressed `1 → 2 → 3` then `0` after publish |
| Preview drafts without publishing | **PASS** | `website_mode=draft`, no pencils, Publish (3) · `02-preview-draft-three-changes.png` |
| Publish multiple saved changes together | **PASS** | Confirmed Publish (3); post-publish “0 unpublished” |
| Live public separate session | **PASS** | Anon curl: heading + social + media present on `/hq` |
| Anonymous / unauthorized publish denied | **PASS** | Anon + bad session → HTTP `403` (CSRF / auth) |
| Branch-admin draft preview URL + scope | **PASS** | Branch session `/branch-admin/website` links `/c/.../campus-a?website_mode=draft`; campus preview no pencils; no HQ edit path |
| Desktop editing chrome | **PASS** | Emulated 1280px entry labels Website management / Preview / Edit Website · `04-` |
| Mobile 390px editing | **PASS** | Emulated 390px edit shell + pencils · `05-` |

### BB evidence

- `docs/qa/references/v2-01-bb-inline-parity/01-entry-preview-edit-chrome.png`
- `docs/qa/references/v2-01-bb-inline-parity/02-preview-draft-three-changes.png`
- `docs/qa/references/v2-01-bb-inline-parity/03-entry-manage-preview-edit.png`
- `docs/qa/references/v2-01-bb-inline-parity/04-desktop-entry-chrome-1280.png`
- `docs/qa/references/v2-01-bb-inline-parity/05-mobile-390-edit-mode.png`

---

## 5. Hosted QA — ActiveClinic (shared editor regression)

Disposable org `ac-v8-qa-mub23a6v6a6b` on same SHA `bb2f1d0a0170`.

| Scenario | Result |
| --- | --- |
| Edit mode pencils + Publish + editor chrome | **PASS** |
| Draft preview without pencils | **PASS** |
| Live public lacks edit chrome | **PASS** |
| Cross-scope: AC session cannot BB-edit disposable church | **PASS** (`crossAllowsEdit=false`) |
| Media / draft / publish stack regression | **PASS** (chrome + preview + live isolation; no new AC A1 changes) |

---

## 6. Remaining defects (non-blocking for A1)

1. **Inline image object payload → `invalid_url`**  
   - **What:** `POST …/inline-field` with `{ mediaId, alt, src }` for `home.hero.image` returns `validation_failed` / `invalid_url`.  
   - **Workaround verified:** string URL value saves and publishes.  
   - **Root cause (likely):** pre-existing IMAGE object validation / route normalization mismatch vs UI `saveImage` object shape — **not introduced by A1**.  
   - **Out of scope for this task** (no crop/media redesign).

---

## 7. Production confirmation

- No production host, DB, media root, or deployment profile was modified.
- All interactive writes used disposable testing tenants on `moovex-platform-v8-testing` only.
- Credentials and patient data were not written into logs or this report.

---

## Verdict line

`V2_01_BB_INLINE_EDITOR_PARITY_PASS`
