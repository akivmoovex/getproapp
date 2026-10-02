# V2.04 — Website Editor Mobile View Responsive Parity Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_WEBSITE_EDITOR_MOBILE_RESPONSIVE_AUDIT` |
| **Mode** | **READ-ONLY** — no code changes, no deploy |
| **Date** | 2026-10-02 |
| **Products** | BlessBoard (BB) + ActiveClinic (AC) |
| **Example BB route** | `https://blessboard.neuniversity.org/c/demo-c-2044?website_edit=1&website_mode=draft` |
| **Primary code tree** | `Documents/DocumentsAkiv/.../getpro` |
| **Shared surfaces** | `views/platform/website-engine/editor-chrome.ejs`, `public/platform/website-inline-edit.js`, `public/platform/website-inline-edit.css` |

**Bug (confirmed):** Selecting toolbar **Mobile** narrows the canvas visually, but the **content layout does not match** a real browser viewport at ~390px. Same mechanism for BB and AC.

---

## 1. Viewport implementation trace

### EDITOR_RENDER_MODE

**`SAME_DOCUMENT`**

- Public page HTML is rendered in the **same document** as the WE01 editor chrome.
- BB: `views/blessboard/v5/partials/website-admin-chrome.ejs` → includes `platform/website-engine/editor-chrome`.
- AC: `views/activeclinic/partials/website-editor-chrome.ejs` → includes the **same** shared `editor-chrome`.
- No preview iframe wraps the editable public site in edit mode.
- (Unrelated: platform-admin **version visual** preview uses an iframe in `website-version-preview.ejs` — not the inline WE01 editor.)

### VIEWPORT_CONTROL_SOURCE

| Layer | File / function | Role |
|-------|-----------------|------|
| Toolbar buttons | `views/platform/website-engine/editor-chrome.ejs` | `data-website-viewport="desktop\|tablet\|mobile"` |
| Click handler | `public/platform/website-inline-edit.js` → `bindEditorShell()` | Toggles body classes + `aria-pressed` / `is-current` |
| Canvas CSS | `public/platform/website-inline-edit.css` | `body.gp-website-viewport-mobile\|tablet … { max-width: … }` |
| Product hosts | BB `website-admin-chrome.ejs`, AC `website-editor-chrome.ejs` | Thin includes only — **no product viewport override** |

Exact JS (entire Mobile behavior):

```15:25:public/platform/website-inline-edit.js
    document.querySelectorAll("[data-website-viewport]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-website-viewport");
        document.body.classList.toggle("gp-website-viewport-mobile", mode === "mobile");
        document.body.classList.toggle("gp-website-viewport-tablet", mode === "tablet");
        document.querySelectorAll("[data-website-viewport]").forEach(function (other) {
          var on = other === btn;
          other.classList.toggle("is-current", on);
          other.setAttribute("aria-pressed", on ? "true" : "false");
        });
      });
    });
```

### Target widths

| Mode | MOBILE_TARGET_WIDTH / TABLET | Mechanism |
|------|------------------------------|-----------|
| **Mobile** | **390px** | `max-width: 390px` on main/home selectors |
| **Tablet** | **768px** | `max-width: 768px` on same selectors |
| **Desktop** | *(none)* | Both body classes cleared |

```573:590:public/platform/website-inline-edit.css
body.gp-website-viewport-mobile .bb-tp-main,
body.gp-website-viewport-mobile .ac-tenant-main,
body.gp-website-viewport-mobile [data-bb-home],
body.gp-website-viewport-mobile .ac-tenant-home,
body.gp-website-viewport-mobile #ac-public-main {
  max-width: 390px;
  margin-left: auto;
  margin-right: auto;
}
body.gp-website-viewport-tablet .bb-tp-main,
body.gp-website-viewport-tablet .ac-tenant-main,
body.gp-website-viewport-tablet [data-bb-home],
body.gp-website-viewport-tablet .ac-tenant-home,
body.gp-website-viewport-tablet #ac-public-main {
  max-width: 768px;
  margin-left: auto;
  margin-right: auto;
}
```

**Report fields**

| Field | Value |
|-------|--------|
| **EDITOR_RENDER_MODE** | `SAME_DOCUMENT` |
| **VIEWPORT_CONTROL_SOURCE** | `website-inline-edit.js` `bindEditorShell` + `website-inline-edit.css` body viewport classes; buttons in `editor-chrome.ejs` |
| **MOBILE_TARGET_WIDTH** | `390` |
| **TABLET_TARGET_WIDTH** | `768` |

Prior inventory already documented the intent: *“CSS canvas width classes — not real device/UA emulation”* (`docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md`).

---

## 2. What “Mobile” actually changes

When Mobile is selected, code changes **only**:

| Change | Happens? | Detail |
|--------|----------|--------|
| **A. Actual layout viewport width** | **NO** | `window.innerWidth` / CSS viewport unchanged |
| **B. Container width** | **YES** | `max-width: 390px` + centered margin on listed main/home nodes |
| **C. CSS transform scale** | **NO** | No shell `transform`/`scale`/`zoom` for device preview |
| **D. max-width** | **YES** | Primary effect |
| **E. Visual shell/device frame** | **PARTIAL** | Narrow centered column only — no phone chrome / iframe |

### Exact DOM / CSS mutations

1. `document.body` gains class `gp-website-viewport-mobile` (removes `gp-website-viewport-tablet` if present).
2. Viewport buttons: clicked button gets `is-current` + `aria-pressed="true"`; siblings cleared.
3. CSS applies `max-width: 390px; margin-left/right: auto` to:
   - BB: `.bb-tp-main`, `[data-bb-home]`
   - AC: `.ac-tenant-main` (legacy/unused class name in live shell), `.ac-tenant-home`, **`#ac-public-main`** (live AC main)

**Not changed:** `style.width`, `min-width`, `transform`, `zoom`, container-query context, iframe width, `<meta name="viewport">`, or any rewrite of `@media` evaluation.

**Selectors NOT constrained by Mobile:** BB/AC **headers/nav** (outside `#bb-tp-main` / `#ac-public-main`), footers sibling to main, sticky editor toolbar. Headers remain full browser width while main content is pinched.

---

## 3. Responsive breakpoint behavior

### Public-site breakpoints (representative)

**BlessBoard** (`public/blessboard/v5/tenant-public.css`):

| Breakpoint | Typical effects |
|------------|-----------------|
| `min-width: 768px` | Hero 2-col grid; desktop eyebrows; card/grid densification |
| `min-width: 900px` | Desktop nav (`display: flex`); hamburger hidden; larger gutters/hero |
| `max-width: 767px` / `899px` / `430px` / `390px` | Mobile stacks, typography, touch targets |

Comment in source: `/* —— Breakpoints: 768 tablet / 900+ desktop nav —— */`.

**ActiveClinic** (`public/activeclinic/ac-public.css`, `ac-stitch-public.css`):

| Breakpoint | Typical effects |
|------------|-----------------|
| Default (&lt;768) | `.ac-public-nav--desktop { display: none }`; hamburger toggle visible |
| `min-width: 768px` | Desktop nav shown; hero/grids multi-column |
| `min-width: 1024px` / `1100px` | Wider grids |
| `max-width: 767px` / `390px` | Mobile stacks / spacing |

**Shared image framing** (`website-inline-edit.css`):

```2743:2751:public/platform/website-inline-edit.css
@media (max-width: 767px) {
  .gp-website-image--placed {
    object-fit: var(--gp-img-mobile-fit, var(--gp-img-fit, cover));
    ...
    transform: scale(var(--gp-img-mobile-zoom, var(--gp-img-zoom, 1)));
```

Mobile image placement vars activate only when the **browser viewport** is ≤767px — **not** when editor Mobile class is set.

### Critical media-query question

| Question | Answer |
|----------|--------|
| What do `@media (max-width/min-width)` evaluate against? | **Real browser window / layout viewport** |
| Does narrowing an inner `div`/`main` trigger those queries? | **NO** (standard CSS; no container queries on public layout) |
| Does editor Mobile flip those queries? | **NO** |

| Field | Value |
|-------|--------|
| **MEDIA_QUERY_REFERENCE** | `WINDOW` |
| **EDITOR_MOBILE_TRIGGERS_REAL_BREAKPOINTS** | `NO` |

At a typical editor desktop window (~1280–1440px) with Mobile selected:

- `@media (min-width: 768px)` → **true** (desktop layout rules apply inside the 390px column)
- `@media (min-width: 900px)` → **true** (BB desktop nav)
- `@media (max-width: 767px)` → **false** (true-mobile rules + mobile image framing **do not** apply)

---

## 4. True mobile vs editor Mobile

Method: static differential analysis of CSS + shell structure (same shared viewport engine). Live edit session was not required to prove media-query reference; mismatches follow directly from SAME_DOCUMENT + WINDOW media queries.

### Comparison matrix (window ~1280px + editor Mobile vs window ~390px public)

| Surface | True ~390px viewport | Editor Mobile @ desktop window |
|---------|----------------------|--------------------------------|
| BB header / nav | Hamburger; desktop nav hidden (&lt;900px) | **Desktop nav still shown**; hamburger still hidden |
| BB hero | Single column; mobile eyebrow | **2-col `grid-template-columns` still active** (768+); desktop eyebrow rules still apply — cramped in 390px column |
| BB card grids / shortcuts | Stacked / fewer cols | **Desktop multi-col grids still active** |
| BB footer | Mobile stack rules | Desktop footer grid rules may still apply |
| BB typography (`max-width: 767px` clamps) | Mobile type scale | **Desktop type scale** inside narrow column |
| AC header / nav | Toggle visible; desktop nav `display:none` | **Desktop nav `display:flex`** (768+) while main is 390px |
| AC hero / feature grids | Single column | **Multi-column grids still active** |
| AC stitch sections (`ac-stitch-public.css`) | Visit/contact stacks | **768+ multi-col still active** |
| Image mobile framing | `--gp-img-mobile-*` applied | **Desktop framing** (767px MQ false) |
| Editor pencils / overlays | Mobile editor chrome via window MQs | Desktop editor chrome + pencils on desktop layout squeezed into 390px |
| Header width vs content | Header ≈ 390px | **Header full window width**; main max 390px — visual mismatch |

### Concrete mismatches (8)

1. **BB desktop nav visible** in editor Mobile; hidden on true mobile.
2. **BB hamburger / menu button hidden** in editor Mobile; shown on true mobile.
3. **BB hero remains 2-column** inside 390px shell; true mobile is single column.
4. **BB desktop vs mobile hero eyebrows** stay on desktop variant.
5. **AC desktop nav visible** in editor Mobile; true mobile uses toggle-only chrome.
6. **AC multi-column hero/feature/stitch grids** remain multi-col under editor Mobile.
7. **Shared hero/logo mobile image placement** does not activate under editor Mobile.
8. **Header full-bleed vs centered 390px main** — editor Mobile never constrains header/nav nodes.

| Field | Value |
|-------|--------|
| **BB_PARITY** | `FAIL` |
| **AC_PARITY** | `FAIL` |

---

## 5. Fixed desktop width constraints

### Editor-only canvas rules

- Mobile/tablet preview uses **`max-width` only** — not a hard `width: 390px` on `html`/`body`.
- No editor class sets `min-width` that forces desktop layout width on the public canvas.
- WE01 chrome has its own desktop `max-width: 1440px` toolbar shells — unrelated to public breakpoints.

### Public-site constraints that matter

- Public layouts correctly use `min-width: 0` in many flex/grid children (good for shrinking).
- The failure is **not** primarily a `min-width: 1024px` lock on the canvas.
- Failure is that **desktop `@media (min-width: …)` rules keep applying** while the shell is only visually narrowed.

### Selector gap

Viewport CSS targets main/home IDs/classes but **omits**:

- `.bb-tp-header` / `.bb-tp-nav*`
- `.ac-public-header` / `.ac-public-nav*`
- footers

Even a perfect container-width illusion would still leave chrome at full window width under the current selector list.

---

## 6. Viewport meta / iframe behavior

| Check | Result |
|-------|--------|
| Inline editor uses iframe? | **NO** (`SAME_DOCUMENT`) |
| `<meta name="viewport">` | Present on public shells (`width=device-width, initial-scale=1`) — describes **browser** viewport, not editor canvas |
| `matchMedia('(max-width: 767px)')` inside page | Reports **window** width; editor Mobile does not change it |
| Can same-document inner `max-width` trigger normal viewport MQs? | **Architecturally no** without container queries, iframe, or rewriting MQ source |

True viewport media-query simulation with the **current** same-document approach is **not** possible: CSS viewport MQs are bound to the browsing context viewport, not an arbitrary descendant’s used width.

---

## 7. Mobile override mechanism

| Mechanism | Present? | Coverage |
|-----------|----------|----------|
| `body.gp-website-viewport-mobile` | **YES** | Only `max-width: 390px` centering on main/home |
| `[data-website-viewport="mobile"]` | **YES** | Toolbar button attribute only |
| `.website-viewport-mobile` / `.editor-mobile` public layout mirrors | **NO** | Not used to duplicate product `@media` rules |
| Manual duplication of BB/AC responsive stacks | **NO** | Drift risk avoided by omission — but **parity fails** |

**Assessment:** Partial “fake mobile” via canvas max-width only. **None** of the meaningful public `@media` responsive behaviors are reproduced under the editor class. Drift risk for OPTION C would be high if that path were expanded later.

Image framing has a separate Desktop/Mobile **dialog** mode (`data-website-frame-mode`) — that edits placement data; it does **not** make the page canvas evaluate public mobile media queries.

---

## 8. Root cause classification

**Primary class:** `SAME_DOCUMENT_MEDIA_QUERY_LIMITATION`

Supporting factors (secondary, not primary):

- Visual-only `max-width` canvas (`FIXED_EDITOR_CANVAS_WIDTH` partial / visual)
- Incomplete selector set (header outside constrained nodes)
- No transform-scale emulation (`TRANSFORM_SCALE_ONLY` = **no**)
- Not an iframe misconfiguration (`IFRAME_VIEWPORT_CONFIGURATION` = N/A)
- Not a BB-vs-AC product conflict — **shared platform** cause (`PRODUCT_OVERRIDE_CONFLICT` = **no**)
- Override is incomplete by design (`PARTIAL_MOBILE_OVERRIDE` secondary)

---

## 9. Architectural options (analyze only — not implementing)

### OPTION A — Real iframe at 390px / 768px

Load (or isolate) the public preview document in an iframe whose width is set to the device target so native `@media` and `matchMedia` evaluate correctly.

| Criterion | Assessment |
|-----------|------------|
| Parity reliability | **Highest** — uses real public CSS as-is |
| Shared BB/AC compatibility | **Strong** — one shared editor host; products already share chrome |
| Implementation scope | **Medium–High** — chrome/iframe host, postMessage or same-origin edit bridge for pencils/save, focus/scroll, Change Manager coupling |
| Maintenance risk | **Low** for layout parity; **medium** for editor interaction plumbing |

### OPTION B — Container-query–aware public CSS

Rewrite BB/AC (and shared presentation) responsive rules to `@container` against the editor canvas (and keep window MQs for true public pages, or dual-write).

| Criterion | Assessment |
|-----------|------------|
| Parity reliability | **High if complete**; easy to miss rules |
| Shared BB/AC compatibility | Requires **both** product CSS trees + shared components |
| Implementation scope | **Very high** — hundreds of MQs across `tenant-public.css`, `ac-public.css`, stitch CSS, themes |
| Maintenance risk | **High** — dual responsive systems or wholesale migration |

### OPTION C — Editor-specific override selectors mirroring every breakpoint

Expand `body.gp-website-viewport-mobile …` (and tablet) to hand-copy every public mobile rule.

| Criterion | Assessment |
|-----------|------------|
| Parity reliability | **Poor long-term** — perpetual drift |
| Shared BB/AC compatibility | Must mirror **two** product CSS surfaces |
| Implementation scope | **High ongoing**; initial pass large |
| Maintenance risk | **Highest** |

**Recommendation (evidence complete):** Prefer **OPTION A** for parity reliability with shared BB/AC. B is viable only as a long-term public CSS modernization. C should be rejected for production parity.

---

## 10. Summary tables

### Trace checklist

| Item | Finding |
|------|---------|
| Desktop/Tablet/Mobile buttons | Shared `editor-chrome.ejs` |
| `data-website-viewport` | Button attrs only |
| Canvas sizing | Body class → `max-width` on main/home |
| iframe in WE01 edit | **No** |
| transform/scale/zoom shell | **No** |
| Breakpoint evaluation | **Window** |

### Classification

| Field | Value |
|-------|--------|
| **ROOT_CAUSE_CLASS** | `SAME_DOCUMENT_MEDIA_QUERY_LIMITATION` |
| **SHARED_PLATFORM_CAUSE** | `YES` |
| **PRODUCT_SPECIFIC_CAUSE** | `NO` |
| **CODE_FIX_REQUIRED** | `YES` |

---

ROOT_CAUSE=Editor Mobile only toggles body class + main max-width:390px in SAME_DOCUMENT; public @media still evaluates against the browser window, so desktop layout rules remain active
ROOT_CAUSE_CLASS=SAME_DOCUMENT_MEDIA_QUERY_LIMITATION
EDITOR_RENDER_MODE=SAME_DOCUMENT
MOBILE_TARGET_WIDTH=390
MEDIA_QUERY_REFERENCE=WINDOW
EDITOR_MOBILE_TRIGGERS_REAL_BREAKPOINTS=NO
BB_MOBILE_PARITY=FAIL
AC_MOBILE_PARITY=FAIL
SHARED_PLATFORM_CAUSE=YES
PRODUCT_SPECIFIC_CAUSE=NO
CODE_FIX_REQUIRED=YES
RECOMMENDED_ARCHITECTURE=A
FINAL=V2_04_WEBSITE_EDITOR_MOBILE_RESPONSIVE_AUDIT_COMPLETE
