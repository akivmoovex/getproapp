# V2.01 Shared Section Management QA

**Task:** `V2_01_SHARED_SECTION_MANAGEMENT`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Baseline (B3):** `14f6d524ae06`  
**B4 commit / hosted SHA:** `4b3d9dda8fdc` (`4b3d9dda8fdc…`)  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `databaseIdentityExpected=moovex-platform-v7` · `databaseIdentityEnv=testing` · `mediaWriteNamespace=testing-v8`  
**Production:** **untouched** (`blessboard.com` `/healthz` remained `03a89106e2fe` / `moovex-platform-production`)

**Refs:**  
- `docs/qa/V2_01_SHARED_EDITOR_ARCHITECTURE_AUDIT.md`  
- `docs/qa/V2_01_BB_INLINE_EDITOR_PARITY_QA.md`  
- `docs/qa/V2_01_UNIVERSAL_IMAGE_EDITOR_QA.md`  
- Stitch **Website Change Management System** `projects/12538817760086591589` · Screen 5 `147683a1ada04a5c9179aac66e5158d7` (Add & Organize Sections)  
- Platform doc: `docs/platform/V8_SHARED_WEBSITE_SECTIONS.md`

**Personas (disposable):**  
- BB HQ · org `bb-v8qa-mub23a6v6a6b`  
- AC admin · org `ac-v8-qa-mub23a6v6a6b`

---

## FINAL VERDICT

**`V2_01_SHARED_SECTION_MANAGEMENT_PASS`**

Shared WE01 section services already provided add / reorder / hide / show / restore / remove. B4 closes the material gap: **BlessBoard home now renders freeform added sections**, AC **Add Section** is gated like BB, and a minimal **shared section contract** documents supported types without inventing a page builder. Stitch permanent Section Library column remains intentionally out of scope.

---

## 1. Existing capabilities reused

| Capability | Status before B4 | Reused |
| --- | --- | --- |
| Section action menu (edit / move up·down / hide·show / restore / remove) | Wave 4A shared JS + product adapters | Yes |
| Add Section picker + types API | Wave 4B-2 + `sectionRegistry.js` | Yes |
| Draft-only mutations + publish via existing services | V8 `sectionManagementService` | Yes |
| AC FAQ Add question / Up / Down / Remove | Collection editor | Yes (item ops) |
| BB collection pages (leadership / ministries / …) | Registry emptyHint + structured CTAs | Yes |
| Shared media / Adjust Picture | B3 WE01 IMAGE fields | Regression OK (scripts still load) |

**Stitch-only (not implemented):** permanent Section Library rail, drag-and-drop reorder column, Multi-Location Sync, Global Theme gallery, Web Studio chrome.

---

## 2. Supported section types and operations

Contract module: `src/platform/website/sections/sharedSectionContract.js`.

### BlessBoard (registry)

| Type | Pages (examples) | Operations |
| --- | --- | --- |
| `plain_text` (incl. CTA layout) | home, about, contact, giving | Add / edit / order / hide / remove |
| `image` | home, about, giving | Same |
| `image_text` | home, about, giving | Same |
| Locked keys (`hero`, `service_times`, …) | home | Edit limited; no remove |

**Collection pages** (leadership, ministries, events, sermons, announcements): **no freeform Add Section** — use member item actions (`Add leadership member`, etc.). Hint shown via `data-website-collection-hint`.

### ActiveClinic (registry)

| Type | Notes |
| --- | --- |
| `text`, `image_text`, `cta` | Freeform addable on allowed pages |
| `services`, `doctors` | Domain-backed singletons |
| `hours`, `contact` | Singletons |
| FAQ items | Product collection ops (Add question), not Add Section |

Shared structural ops: `add_section`, `edit`, `move_up`, `move_down`, `hide`, `show`, `restore_default`, `remove`.

**Unsupported:** arbitrary new section types, theme-pack catalogs, HQ/branch studio (out of task scope).

---

## 3. Exact files changed (B4)

- `views/blessboard/v5/public/home.ejs` — render freeform draft/custom sections (`data-bb-home-freeform`)
- `src/platform/website/sections/sharedSectionContract.js` — **new** minimal contract
- `src/activeclinic/http/attachActiveClinicWebsiteChrome.js` — gate `addSectionUrl` via `describeAddSectionAvailability`
- `src/blessboard/http/attachWebsiteAdminChrome.js` — pass `collectionManaged`
- `src/platform/website-engine/editorShell.js` — `collectionManaged` shell fact
- `views/platform/website-engine/add-section-picker.ejs` — collection member-action hint
- `public/platform/website-add-section.css` — hint styles
- Cache bumps: BB `website-add-section.css?v=v2-sec-mgmt-1`, AC `ASSET_VERSION=v2-sec-mgmt-1`
- `tests/v2-01-shared-section-management.test.js` — **new**
- `tests/v2-01-universal-image-editor.test.js` — AC asset assertion update

Migrations: **none**.

---

## 4. Automated tests

| Suite | Result |
| --- | --- |
| `tests/v2-01-shared-section-management.test.js` | **PASS** (6) |
| `tests/v8-shared-website-sections.test.js` | **PASS** (9) |
| `tests/shared-website-section-lifecycle.test.js` | **PASS** |
| `tests/v2-01-universal-image-editor.test.js` | **PASS** (6) |

---

## 5. Hosted browser / API QA

Hosted tip verified **`4b3d9dda8fdc`** before QA.

### ActiveClinic (`ac-v8-qa-mub23a6v6a6b`)

| Scenario | Result |
| --- | --- |
| Edit mode Add Section picker (Text / Image+Text / CTA) | **PASS** |
| Add Text section → draft reload with `data-ac-section-id` | **PASS** (`s309fc0d39351`) |
| Pending count advanced (Publish 3→4) | **PASS** |
| FAQ Add question / Up / Down / Remove present | **PASS** |
| Section action triggers present | **PASS** |
| Unauthorized section-actions POST | **PASS** (`403` / csrf) |
| Desktop + ~390 chrome | **PASS** · `ac-add-section-text.png` |

### BlessBoard (`bb-v8qa-mub23a6v6a6b`)

| Scenario | Result |
| --- | --- |
| Add Section types for home | **PASS** (Text / Image / Image+Text / CTA) |
| POST add `plain_text` → `text_ed61bd` | **PASS** (`published:false`) |
| Home draft shows freeform DOM | **PASS** (`data-bb-home-freeform` ×1, “New section”) |
| Live public **without** freeform until publish | **PASS** (`freeformLive=0`) |
| Draft preview shows freeform | **PASS** |
| Leadership collection hint, no Add Section | **PASS** |
| Section actions + Add section chrome | **PASS** · `bb-home-freeform-section.png` |
| Inline image editor assets still linked | **PASS** |

---

## 6. Evidence

- `docs/qa/references/v2-01-shared-section-management/ac-add-section-text.png`
- `docs/qa/references/v2-01-shared-section-management/bb-home-freeform-section.png`

---

## 7. Remaining limitations

1. Stitch **Section Library** / drag-handle canvas not shipped — `…` menus + Add Section FAB remain the UX.  
2. BB freeform section **images** still use structured image triggers on home (not WE01 Adjust Picture keys); IMAGE field Adjust Picture remains for engine IMAGE content keys (B3).  
3. Domain-backed AC sections have limited remove/reorder by design.  
4. Theme-missing-section behavior awaits theme task (Stitch #6).  
5. HQ/branch management not in this task.

---

## 8. Production confirmation

No production host, DB, media root, or deployment profile was modified. Writes used disposable V8 testing tenants only.

---

## Verdict line

`V2_01_SHARED_SECTION_MANAGEMENT_PASS`
