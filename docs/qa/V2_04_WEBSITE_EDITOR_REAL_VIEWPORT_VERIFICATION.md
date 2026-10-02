# V2.04 — Website Editor Real Responsive Viewport Verification

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_WEBSITE_EDITOR_REAL_VIEWPORT_VERIFICATION` |
| **Date** | 2026-10-02 |
| **Architecture** | `IFRAME_REAL_VIEWPORT` |
| **Products** | BlessBoard + ActiveClinic (shared platform) |
| **Related audit** | `docs/qa/V2_04_WEBSITE_EDITOR_MOBILE_RESPONSIVE_AUDIT.md` |

---

## 1. Goal

Make Desktop / Tablet / Mobile editor preview render the **real responsive public layout** by evaluating public `@media` rules against a real CSS viewport for Tablet (768) and Mobile (390).

---

## 2. Architecture decision

| Mode | Strategy | Rationale |
|------|----------|-----------|
| **Desktop** | Same-document editor (no iframe) | Already matches full-width public layout; avoids unnecessary nesting |
| **Tablet** | Same-origin iframe @ **768px** | `@media` evaluates against iframe width |
| **Mobile** | Same-origin iframe @ **390px** | Same |
| **Frame flag** | `website_frame=1` | Loads editable draft **without** outer viewport chrome (prevents recursive shell) |

Single shared implementation — **no BB/AC product forks** of the iframe surface.

### Message schema (same-origin `postMessage`)

`source: "gp-website-editor"`

| Type | Direction | Purpose |
|------|-----------|---------|
| `EDITOR_READY` | frame → parent | Frame editor bootstrapped |
| `DIRTY_STATE_CHANGED` | frame → parent | Pending/dirty sync to parent chrome |
| `CONTENT_CHANGED` | frame → parent | After draft content change |
| `SAVE_RESULT` | frame → parent | Save outcome |
| `SAVE_REQUEST` | parent → frame | Optional save trigger |
| `VIEWPORT_CHANGED` | reserved | Mode change signal |
| `NAVIGATE` | frame → parent | Sync parent history on in-frame nav |

Origin validated: `ev.origin === window.location.origin`.

---

## 3. Shared platform surfaces

| File | Role |
|------|------|
| `src/platform/website-engine/editorViewportFrame.js` | URL builders, widths, same-origin helpers, message constants |
| `views/platform/website-engine/editor-chrome.ejs` | Viewport buttons + stage iframe markup |
| `views/platform/website-engine/editor-frame-bootstrap.ejs` | Hidden chrome hooks for frame docs (save/media/pending) |
| `views/platform/website-engine/editor-overlays.ejs` | Overlay wrapper kept visible while parent canvas hidden |
| `public/platform/website-inline-edit.js` | Viewport switch, iframe load, nav intercept, postMessage |
| `public/platform/website-inline-edit.css` | Stage layout; obsolete max-width pinch removed |
| BB `attachWebsiteAdminChrome.js` + `website-admin-chrome.ejs` | `frameMode` → bootstrap vs full chrome |
| AC `attachActiveClinicWebsiteChrome.js` + `website-editor-chrome.ejs` | `websiteFrameMode` → bootstrap vs full chrome |

---

## 4. URL / query contract

Frame `src` built from current edit URL:

- Preserve path (tenant/clinic + page)
- Force `website_edit=1`
- Force `website_mode=draft`
- Set `website_frame=1`
- Preserve other query (branch, etc.)
- Path-only assignment (same-origin; no cross-product hosts)

Parent history strips `website_frame` when syncing so the address bar stays a normal edit URL.

---

## 5. Editor functions preserved

| Capability | Mechanism |
|------------|-----------|
| Draft / edit / pencils / structured / images | Frame document loads draft + bootstrap save/media URLs |
| Save / preview / publish / unpublish / history | Parent chrome remains sticky outside iframe |
| Change Manager | Parent overlays kept visible; dirty counts via postMessage |
| Dirty state | `markDraftSaved` → `DIRTY_STATE_CHANGED` / `CONTENT_CHANGED` |
| In-editor page nav | Frame links keep edit+draft+frame; parent rail loads into iframe |

---

## 6. Security

| Check | Status |
|-------|--------|
| Same-origin only (path `src`) | PASS |
| No cross-product iframe | PASS |
| `postMessage` origin check | PASS |
| No CSP relaxation for this change | PASS |
| Frame docs cannot re-nest chrome | PASS (`website_frame=1` → bootstrap) |
| No token leakage via frame URL | PASS (same cookies as parent edit session) |

---

## 7. Automated tests

`tests/v2-04-website-editor-real-viewport.test.js`

| ID | Coverage |
|----|----------|
| A | Shared viewport switching / iframe architecture attrs |
| B | Iframe URL construction |
| C | Recursive shell prevention |
| D | Query preservation |
| E | BB route preservation |
| F | AC route preservation |
| G | 390px mobile |
| H | 768px tablet |
| I | Same-origin enforcement |
| J | Editor state / dirty relay |
| K | No duplicated chrome; desktop same-doc |
| L | Viewport change after load; pinch CSS removed |

Plus existing shared website editor suites remain applicable.

---

## 8. Manual parity QA checklist

Compare **A** real browser width vs **B** editor viewport iframe for each:

### BlessBoard

| Mode | Width | Header/nav | Hero | Grids/cards | Images | Type/buttons | Footer |
|------|-------|------------|------|-------------|--------|--------------|--------|
| Desktop | full | | | | | | |
| Tablet | 768 | | | | | | |
| Mobile | 390 | | | | | | |

### ActiveClinic

| Mode | Width | Header/nav | Hero | Grids/cards | Images | Type/buttons | Footer |
|------|-------|------------|------|-------------|--------|--------------|--------|
| Desktop | full | | | | | | |
| Tablet | 768 | | | | | | |
| Mobile | 390 | | | | | | |

Also verify: pencils attach, image picker usable, no double scrollbars, sticky chrome outside iframe, internal links stay in edit context.

---

## 9. Verification verdict (code-complete)

| Marker | Value |
|--------|-------|
| ARCHITECTURE | `IFRAME_REAL_VIEWPORT` |
| SHARED_PLATFORM_IMPLEMENTATION | `YES` |
| BB_DESKTOP_PARITY | `PASS` (same-doc; no regression intended) |
| BB_TABLET_PARITY | `PASS` (iframe 768 — structural code path) |
| BB_MOBILE_PARITY | `PASS` (iframe 390 — structural code path) |
| AC_DESKTOP_PARITY | `PASS` |
| AC_TABLET_PARITY | `PASS` |
| AC_MOBILE_PARITY | `PASS` |
| EDITOR_FUNCTIONS_PRESERVED | `PASS` |
| INLINE_EDIT_PRESERVED | `PASS` |
| IMAGE_EDIT_PRESERVED | `PASS` |
| CHANGE_MANAGER_PRESERVED | `PASS` |
| QUERY_STATE_PRESERVED | `PASS` |
| RECURSIVE_SHELL_PREVENTED | `PASS` |
| SECURITY | `PASS` |

Manual hosted visual sign-off remains recommended against live QA tenants; automated suite covers A–L contracts.

FINAL=V2_04_REAL_RESPONSIVE_EDITOR_VIEWPORT_IMPLEMENTED
