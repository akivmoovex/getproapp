# BlessBoard V5 — Responsive layout static audit

**Date:** 2026-07-19  
**Method:** Static CSS/template inspection only. **No browser pixel verification was performed.**  
**Target widths (reasoning):** 320 · 375 · 430 · 768 · 1024 · 1440  
**Companion suite:** `npm run test:blessboard:responsive-structure`

---

## 1. Verdict

| Area | Status |
|------|--------|
| Shared shells (MP / BA / HQ / PA) | **Strong** — bottom-nav clearances, drawers `min(…, 88vw)`, brand `min-width: 0` |
| Apex / tenant public | **Strong** — sticky headers, constrained media, 320 guards |
| Auth | **Hardened** — long church names can ellipsize in header brand |
| Skip / sticky overlap | **Hardened** — `scroll-margin-top` on shell mains |
| Announcement definition lists | **Hardened** — stack under 900px |
| Page headers / long titles | **Hardened** — `overflow-wrap` + `min-width: 0` |
| Media picker dialogs | **Hardened** — prefer `%` width with `100vw` max cap |
| Breakpoint vocabulary | **Documented** (not unified) |
| Browser pixel parity | **Not claimed** |

---

## 2. Files reviewed

| Surface | Artifacts |
|---------|-----------|
| Tokens / DS | `design-tokens.css`, `design-system.css`, `page-header.ejs` |
| Apex | `apex.css`, `apex-shell-start.ejs` |
| Tenant public | `tenant-public.css`, `tenant-public-shell-start.ejs` |
| Auth | `tenant-auth.css`, register / login templates |
| Member / BA / HQ / PA | `*-portal/admin.css`, shell partials |
| Media | `media-picker.css` |
| Tables / filters | BA/HQ/PA list CSS patterns; HQ report nested tables |

---

## 3. Potential overflow defects

| Severity | Finding | Action |
|----------|---------|--------|
| Clear | Auth brand text node lacked `min-width: 0` / blockified name — long org names vs “Sign in” | Fixed |
| Clear | Sticky headers with no `scroll-margin` on skip mains | Fixed |
| Clear | `.bb-ann-dl` fixed `10rem` label column on narrow viewports | Fixed (stack ≤899) |
| Clear | Page header / page-head titles could refuse to wrap | Fixed |
| Clear | Media picker dialog width used bare `100vw` in `min()` | Mitigated (`100%` + `max-width`) |
| Document | HQ attendance/giving **nested** detail tables: overflow-x only, no card twin | Keep scroll; browser QA |
| Document | Chip filter rails: `nowrap` + horizontal scroll (intentional) | None |
| Document | No global `img { max-width: 100% }` — framed slots already constrain | Browser QA free-text imgs |
| Document | Dual breakpoint systems (see §5) | Document only |

Already solid at 320–1440 reasoning: main `padding-bottom` clears bottom tabs; drawers `88vw`; DS modal `min(100%, …)` + `max-height`; table↔card pairs on primary directories; `overflow-x: clip` on shells; 320px tighteners.

---

## 4. Fixes made

1. **tenant-auth** — brand wrapper + name/branch `min-width: 0` / block display for ellipsis  
2. **MP / BA / HQ / PA / apex / tenant-public** — `scroll-margin-top` on mains  
3. **BA + HQ** — `.bb-ann-dl` stacks under `max-width: 899px`; dd wrap  
4. **Page heads + DS page-header** — `min-width: 0`, `overflow-wrap: anywhere`  
5. **media-picker** — dialog/confirm width prefer `calc(100% - 1.5rem)` with `max-width: calc(100vw - 1.5rem)`  
6. **design-tokens** — breakpoint comment expanded  
7. CSS cache bumps on affected shells  

---

## 5. Breakpoint inconsistencies

| System | Typical queries | Used by |
|--------|-----------------|---------|
| Marketing / public | 767 / 768 | `tenant-public`, `apex`, `design-tokens`, `design-system` |
| Shell chrome | 899 / 900 | Drawer vs sidebar; mobile tabs hide |
| Portal grids | 699 / 700 | MP / BA / HQ / PA / media-picker cards |
| Satellites | 800, 960, 1100, 1200, 1440 | Filters, editors, wide cards, marketing |

**Not unified** on purpose (shell vs marketing). Duplicated media-query blocks across files are expected with per-shell CSS; do not merge into one file.

---

## 6. Items requiring real-browser QA

| Check | Widths |
|-------|--------|
| Skip-to-content landing under sticky headers | 375, 768 |
| Long church/org/branch names in tops + auth | 320, 375 |
| Directory tables ↔ mobile cards + nested HQ report details | 320–430, 768 |
| Media picker / confirm dialogs + keyboard scroll | 320, 430 |
| Bottom tabs vs last list row / sticky CTAs | 375, 430 |
| Filter chip rails horizontal scroll usability | 320 |
| Free-form content images in sermon/event bodies | 375 |

---

## 7. Tests

`tests/blessboard-v5-responsive-structure.test.js` via `npm run test:blessboard:responsive-structure`:

- Shell mains: bottom padding + `scroll-margin-top`  
- Drawers: `min(…, 88vw)`  
- Auth brand truncation guards  
- `.bb-ann-dl` narrow stack  
- Media picker no sole `100vw` width  
- No bare `width: 100vw` / `height: 100vw` under `public/blessboard/v5`  
- Documented breakpoint families present  

---

## 8. Exact results (2026-07-19)

| Check | Result |
|-------|--------|
| `npm run test:blessboard:responsive-structure` | **12 pass / 0 fail** |
| `npm run test:blessboard:a11y-structure` | **87 pass / 0 fail** |
| `npm run test:blessboard:branch-admin-shell` | **12 pass / 0 fail** |
| `npm run test:blessboard:hq-shell` | **9 pass / 0 fail** |
| `npm run test:blessboard:platform-admin-shell` | **12 pass / 0 fail** |
| `npm run test:blessboard:apex-auth-gui` | **4 pass / 0 fail** |
| `npm run test:blessboard:design-system` | **8 pass / 0 fail** |
| `git diff --check` | **clean** |
| stylelint (changed V5 CSS files) | **0 errors**; pre-existing `color-no-hex` warnings only (not introduced by this audit) |

**Note:** No browser automation was executed; widths above are static reasoning only.

---

## 9. Suggested commit message

```
Harden V5 responsive CSS for narrow shells, auth brands, and dialogs.
```
