# V2.04 AC Services/Doctors Catalogue — Distorted GUI Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_AC_CATALOGUE_GUI_DISTORTION_AUDIT` |
| **Mode** | **READ-ONLY** — no code or deploy changes |
| **Date** | 2026-10-02 |
| **Host** | `https://activeclinic.neuniversity.org` |
| **Frozen tip** | `7dbe945d6c93` (`moovex-platform-v8-testing`) |
| **QA tenant** | `ac-hqa-v8-muq9wn7a9a3d` (credentials from `.env.v8-qa-tenants.local`) |
| **Affected routes** | `/app/settings/website/catalogue?tab=services` · `?tab=doctors` (+ optional `returnTo`) |

---

## Executive finding

Desktop catalogue pages are visually broken because the Clinic Editor root element carries **both** classes:

```html
<div class="ac-mw-editor ac-mw-nav" …>
```

Legacy hub rule `.ac-mw-nav { display: flex; flex-wrap: wrap; }` (pill-tab strip) is applied to the Stitch Clinic Editor chrome that was authored as **block + floated left rail**.

At **1440px** the editor becomes a **horizontal flex row**:

| Region | Observed |
|--------|----------|
| `.ac-mw-editor__top` (“Clinic Editor” dark bar) | ~730×844px column (not a thin sticky header) |
| `.ac-mw-editor__rail` | parked on the **right** of that column (`x≈770`) |
| Catalogue body siblings | still get `margin-left: 15.5rem` as if a **left** rail existed |

Result: tall dark chrome block, displaced tools rail, indented C01/C02 content, staff page title still above the CMS chrome — the “distorted GUI” report.

`returnTo` does **not** change layout (navigation-only). Doctors and Services share the same chrome include → same bug.

Mobile ≤899px already forces `.ac-mw-editor { display: block }` (comment in CSS acknowledges the flex squeeze). Horizontal overflow is controlled, but stacked dual chrome (staff page header + CMS editor + re-enabled `.ac-topbar` + bottom nav) still fails clean Stitch mobile parity.

---

## 1. Authenticated repro (visual defects)

### Desktop 1440px (services & doctors)

| Defect | Observed |
|--------|----------|
| Header/sidebar displacement | Staff sidebar CSS-hidden; Clinic Editor top bar rendered as a **tall flex column**; tools rail on the **right** instead of left |
| Content width | Catalogue block indented `248px` (`15.5rem`) into remaining viewport; misaligned with actual rail |
| Cards/tables | Desktop table present (`min-width: 56rem` / 896px) inside scroll wrap; visually secondary to broken chrome |
| Fonts | Inter / Material Symbols load; not primary defect |
| Buttons | Editor “Preview/Publish” and tab pills compressed into left dark column |
| Spacing | Large empty grey regions beside/below distorted chrome |
| Overflow | `overflowX=false` at 1440 in this probe (clip + no page-level X scroll); layout still broken |
| Sticky | Editor top intended sticky header fails (flex child stretches to ~viewport height) |
| Modal geometry | Not required to prove chrome bug; E03 modals live on form routes using same `--mw` shell |

### Mobile ~390px

| Defect | Observed |
|--------|----------|
| Editor display | `block` (flex collision mitigated) |
| Cards | `data-ac-catalogue-mobile` → `grid`; table hidden |
| Overflow X | **No** (`scrollWidth === innerWidth`) |
| Sticky actions | Catalogue sticky bar `display:flex` |
| Dual chrome | Staff **page header** + CMS editor stack + `.ac-topbar` re-shown + mobile bottom nav still in DOM |
| Truncation | Publish label can clip in narrow editor top actions |

---

## 2. `returnTo` comparison

| Route | Editor `display` / `flex-direction` | Distortion |
|-------|-------------------------------------|------------|
| `?tab=services` | `flex` / `row` | YES |
| `?tab=services&returnTo=/clinics/…` | `flex` / `row` (identical metrics) | YES |
| Doctors ± `returnTo` | Same shared `website-cms-nav` include | YES |

`returnTo` is only `sanitizeCatalogueReturnTo` → pageData / post-save redirect. **No template branch changes chrome CSS.**

**RETURN_TO_CAUSES_GUI_BUG=NO**

---

## 3. Template composition / DOM nesting

```
layouts/app-shell.ejs
  body.ac-app-body.ac-app-body--mw          ← websiteCmsShell flag
  .ac-app
    aside.ac-sidebar                       ← display:none via --mw
    .ac-main-wrap
      header.ac-topbar                     ← hidden desktop; re-shown ≤899px
      header.ac-desktop-header             ← display:none via --mw
      main.ac-content
        [staff breadcrumbs / page-header]
        → content: website-cms-catalogue.ejs
           section.ac-mw.ac-mw-catalogue--stitch
             partial website-cms-nav.ejs
               .ac-mw-editor.ac-mw-nav      ← dual class (root cause)
                 header.ac-mw-editor__top
                 aside.ac-mw-editor__rail
             breadcrumb / banner / head / stats / table|cards / sticky
```

Forms (`website-cms-catalogue-*-form.ejs`) use the same `renderShell` → same nav partial.

**DUPLICATE_SHELL=YES** (staff shell DOM retained + second CMS editor chrome; not a second full app mount, but dual chrome / dual chrome CSS regimes).

---

## 4. CSS collision audit

### Primary collision (definitive)

```css
/* website-cms.css — legacy pill strip */
.ac-mw-nav {
  display: flex;
  flex-wrap: wrap;
  …
}

/* website-cms-nav.ejs — Stitch Clinic Editor root reuses that class */
<div class="ac-mw-editor ac-mw-nav" …>
```

Desktop editor chrome expects block layout + `float:left` rail + sibling `margin-left: 15.5rem`. Flex-row breaks that contract.

Mobile already documents the conflict:

```css
/* max-width: 899px */
/* The editor chrome shares a flex row with the tools rail (the element also
   carries .ac-mw-nav). … */
.ac-mw-editor { display: block; }
```

### Secondary contributors

| Item | Effect |
|------|--------|
| `.ac-app-body--mw` hides sidebar/desktop header; zeros `.ac-content` max-width | Intentional full-bleed CMS inside staff shell |
| `.ac-app-body--mw .ac-mw > *:not(.ac-mw-editor)` → `margin-left: 15.5rem` | Assumes left rail; wrong when rail is flex-right |
| `.ac-mw-c-table { min-width: 56rem }` | Forces wide table (contained by overflow wrap) |
| Unscoped `dialog { max-width: calc(100vw - 1.5rem) }` inside a media query | Mild broad selector; not primary catalogue distortion |
| Generic `.container/.card/.table` leaks | **Not found** as unscoped rules in `website-cms.css` |

**CSS_SCOPE_LEAK=YES** (class-name collision / unintended cascade of `.ac-mw-nav` onto editor root; plus `--mw` shell override regime).

---

## 5. CSS load order

From `views/activeclinic/layouts/app-shell.ejs`:

1. platform colors  
2. `gp-ops-shared.css`  
3. `ac-tokens.css` / `ac-app-tokens.css`  
4. `ac-app.css` (staff shell)  
5. `ac-urp.css`  
6. `phone-field.css`  
7. **`website-cms.css`** (last product sheet before media-field)  
8. `website-media-field.css`

Later CMS sheet intentionally overrides staff shell under `.ac-app-body--mw`. The distortion is **intra-file class reuse**, not an accidental later third-party overwrite.

**LOAD_ORDER_COLLISION=NO**

---

## 6. Stitch parity vs embedded shell

Frozen screens (C01/C02 desktop+mobile IDs in catalogue `data-ac-stitch-*`) assume a coherent Clinic Editor frame + catalogue surface.

Live desktop embeds that Stitch chrome **inside** staff `app-shell` while also applying hub `.ac-mw-nav` flex semantics → chrome geometry ≠ Stitch.

**STANDALONE_STYLE_INSIDE_APP_SHELL=YES**

| Viewport | Parity vs frozen Stitch |
|----------|-------------------------|
| Desktop C01/C02 | **FAIL** (flex-broken editor + wrong rail side) |
| Mobile C01/C02 | **FAIL** (stacked staff header/topbar/bottom-nav + CMS chrome; cards themselves OK) |

---

## 7. Responsive summary

| Check | Result |
|-------|--------|
| DESKTOP_OVERFLOW | **NO** (page-level X); layout still **FAIL** |
| MOBILE_OVERFLOW | **NO** |
| SIDEBAR_WIDTH_ACCOUNTED_FOR | **NO** on desktop (margin assumes left rail; flex places rail right) |
| Desktop table force | `min-width: 56rem` with wrap overflow-x auto |
| Mobile cards | Activate correctly ≤899px |
| Sticky bar | Shows on mobile; may compete with staff bottom nav |

---

## 8. Root cause classification

**Primary:** `.ac-mw-editor` also has `.ac-mw-nav` → inherits `display:flex`, destroying Clinic Editor header/rail geometry on desktop (and was already patched only for ≤899px).

**Contributing:** Stitch CMS chrome embedded in staff app shell (`ac-app-body--mw`) with left-rail margin contract that no longer matches flex layout.

**Not causes:** `returnTo` query parsing; generic unscoped `.container/.card` leaks; production/deploy drift.

| Class | Selected |
|-------|----------|
| CSS_SCOPE_LEAK | Yes (primary mechanism) |
| DUPLICATE_APP_SHELL | Partial (dual chrome) |
| STANDALONE_STITCH_LAYOUT_EMBEDDED_IN_SHELL | Yes (contributing) |
| LOAD_ORDER_COLLISION | No |
| FIXED_WIDTH_OVERFLOW | Secondary only (table min-width) |
| RETURN_TO_STATE_BUG | No |
| **MULTIPLE_CAUSES** | **YES — report as primary class** |
| OTHER | — |

### Minimum fix direction (not implemented)

1. Remove `ac-mw-nav` from Clinic Editor root **or** scope `.ac-mw-nav { display:flex }` to true pill strips (e.g. `.ac-mw-nav:not(.ac-mw-editor)` / `.ac-mw-c-tabs`).  
2. Force `.ac-mw-editor { display:block; }` at all breakpoints (mobile already does).  
3. Re-validate left-rail float + sibling margin contract (or replace float with grid).  
4. Optionally reduce dual chrome on catalogue (hide staff page-header / bottom-nav under `--mw` consistently).

Shared across Services + Doctors (+ other website CMS pages using the same nav partial).

---

## Evidence

| Artifact | Detail |
|----------|--------|
| Live CDP @1440 | `editorDisplay=flex`, `flexDirection=row`, `topH≈844`, `railX≈770`, content `ml=248px` |
| Live CDP @390 | `editorDisplay=block`, cards grid, no X overflow, topbar flex, bottom nav present |
| `returnTo` A/B | Identical flex metrics |
| Source | `website-cms-nav.ejs` L12; `website-cms.css` L14–18 & L795–801 |

---

## Return markers

```
ROOT_CAUSE=.ac-mw-editor also has .ac-mw-nav so display:flex breaks Clinic Editor header/rail; content still margin-left for a left rail
ROOT_CAUSE_CLASS=MULTIPLE_CAUSES
RETURN_TO_CAUSES_GUI_BUG=NO
DUPLICATE_SHELL=YES
CSS_SCOPE_LEAK=YES
LOAD_ORDER_COLLISION=NO
STANDALONE_STYLE_INSIDE_APP_SHELL=YES
DESKTOP_PARITY=FAIL
MOBILE_PARITY=FAIL
SERVICES_AFFECTED=YES
DOCTORS_AFFECTED=YES
SHARED_FIX_LIKELY=YES
CODE_FIX_REQUIRED=YES
FINAL=V2_04_AC_CATALOGUE_GUI_DISTORTION_AUDIT_COMPLETE
```
