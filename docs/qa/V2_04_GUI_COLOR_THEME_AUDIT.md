# V2.04 GUI Color Theme Audit

**Date:** 2026-09-29  
**Branch:** V4  
**Mode:** READ-ONLY AUDIT  
**Production:** UNTOUCHED  
**Application code changed:** NO  

## Baseline verification

| Check | Result |
| --- | --- |
| Current branch | `V4` |
| `git rev-parse HEAD` | `05b2afe1caffaee8238cb0d4b3a6fb2f8f8a43d7` |
| `git rev-parse origin/V4` | `05b2afe1caffaee8238cb0d4b3a6fb2f8f8a43d7` |
| `git rev-parse origin/V10` | `05b2afe1caffaee8238cb0d4b3a6fb2f8f8a43d7` |
| Expected V10 / V2.03 baseline | `05b2afe1caffaee8238cb0d4b3a6fb2f8f8a43d7` |
| SHA parity | PASS |

No branches switched. No deploy. No DB or production changes.

## Scan scope

- Scanned production UI under `public/`, `views/`, `src/`, `frontend/`
- Extensions: `.css`, `.ejs`, `.js`, `.svg`, `.html`, `.mjs`, `.cjs`
- Excluded: `docs/`, `tests/`, `.storybook/`, `node_modules/`, `*.test.js`
- Files scanned: **2693**
- Files with color literals / color-bearing CSS: **130**
- Normalized unique HEX colors (HEX/RGB/HSL collapsed): **663**
- CSS custom-property definitions observed: **1239**

Equivalent forms (`#fff`, `#ffffff`, `rgb(255,255,255)`) are normalized to `#FFFFFF`. Visually similar but distinct HEX values are kept separate.

---

## 1. Executive summary

V4 already has **multiple parallel color systems**, not one platform theme:

1. **Platform / GetPro DS** — `public/theme.css` (+ `public/design-system.css`, `public/styles.css`) — violet-first Material/DS tokens.
2. **BlessBoard V5 tokens** — `public/blessboard/v5/design-tokens.css` — Sacred Modernity violet `#6C5CE7` + warm neutrals.
3. **BlessBoard legacy church shell** — `public/church/church.css` — overlapping violet brand with a **different** cool-neutral surface system (`--church-*`).
4. **ActiveClinic public/portal** — `public/activeclinic/ac-tokens.css` — teal `#006068`.
5. **ActiveClinic staff app** — `public/activeclinic/ac-app-tokens.css` — blue `#2563EB` (intentional second AC brand surface).
6. **Shared auth/registration chrome** — `public/platform/gp-auth-reg.css` — product-scoped via `data-gp-product`.
7. **Shared ops chrome** — `public/platform/gp-ops-shared.css` — defaults to AC staff blue; BB should override via product tokens.

**Key findings**

- Products correctly keep **distinct brand primaries** (BB violet vs AC teal vs AC staff blue). That must remain.
- **Semantic status colors drift** across systems (3 error reds, 3–4 success greens, 3 warnings).
- **Neutral typography / borders drift** heavily (`#1A1C1E` vs `#111827` vs `#0F172A` vs `#121417`; border `#D1DCE0` vs `#E5E7EB` vs `#E2E8F0` vs `#C4C7C9`).
- **Hardcoded HEX is the main risk**: ~**1123** unique file×color locations outside token-definition lines; heaviest in `church.css`, BB admin/public CSS, `ac-app.css`, platform website editor CSS.
- Existing `--product-*` aliases in BB/AC tokens are a good bridge toward shared component tokens.
- Accessibility: primary text/button pairs mostly pass AA; notable risks on GetPro orange as text, disabled/subtle greys, and some AC staff status chips.

**Recommendation direction (not implemented):** common semantic token architecture + product brand scopes; migrate high-traffic shells off literals; do **not** force identical brand colors between BlessBoard and ActiveClinic.

| Metric | Value |
| --- | --- |
| BlessBoard unique colors | 398 |
| ActiveClinic unique colors | 208 |
| Platform shared unique colors | 230 |
| Colors appearing in both BB and AC files | 71 |
| Hardcoded file×color locations | 1123 |
| Semantic drift groups | 16 |
| Accessibility risks (checked pairs) | 5 |

---

## 2. BlessBoard palette (source of truth in code)

Canonical tokens: `public/blessboard/v5/design-tokens.css` (loaded by V5 shells via `views/blessboard/v5/partials/head-design-system.ejs`).

Legacy parallel tokens still live in `public/church/church.css` and are still linked from many `views/church/**` shells.

### Sacred Modernity (design-tokens.css)

| Role | Token | Color |
| --- | --- | --- |
| Primary | `--bb-color-primary` | `#6C5CE7` |
| Primary hover/dark | `--bb-color-primary-hover` | `#5341CD` |
| Primary light/soft | `--bb-color-primary-soft` | `#EFEAFF` |
| Primary deep | `--bb-color-primary-deep` | `#3D348B` |
| Accent | `--bb-color-accent` | `#FF9800` |
| Accent readable (text) | `--bb-color-accent-readable` | `#C2410C` |
| On primary | `--bb-color-on-primary` | `#FFFFFF` |
| Page background | `--bb-color-page` | `#FBF9F6` |
| Surface/card | `--bb-color-surface` | `#FFFFFF` |
| Surface dim | `--bb-color-surface-dim` | `#F2F0ED` |
| Primary text | `--bb-color-ink` | `#1A1C1E` |
| Secondary/muted text | `--bb-color-muted` | `#44474E` |
| Border / input border | `--bb-color-border` | `#D1DCE0` |
| Link | `--product-link` → primary | `#6C5CE7` |
| Success | `--bb-color-success` | `#0F766E` |
| Warning | `--bb-color-warning` | `#B54708` |
| Error | `--bb-color-error` | `#B3261E` |
| Info | `--bb-color-info` | `#026AA2` |
| Disabled | `--bb-disabled` | `#9A93A8` |
| Focus ring | `--bb-color-focus-ring` | `rgba(108,92,231,0.45)` |
| Navigation / header | Consumes primary + surface tokens in apex/admin CSS | violet + white/warm |
| Sidebar | Portal/admin CSS | primary soft + ink |
| Button primary | primary / on-primary | `#6C5CE7` / `#FFFFFF` |
| Button secondary | outline primary on surface | border `#6C5CE7` |

### Legacy church.css divergence (still rendered)

| Role | church token (examples) | Color | Notes |
| --- | --- | --- | --- |
| Primary | `--church-violet` / `--church-primary` | `#6C5CE7` | Brand aligned |
| Primary dark | `--church-violet-dark` | `#5341CD` | Aligned |
| Page/surfaces | `--church-surface*` | `#F1FBFF`, `#EAF5FA`, `#E4F0F4`, … | **Cool blue-greys — not warm `#FBF9F6`** |
| Text | `--church-text` / `--church-navy` | `#131D21` | Differs from `#1A1C1E` |
| Muted | `--church-muted` | `#586062` | Differs from `#44474E` |
| Border | `--church-outline` / `--church-border` | `#C8C4D7` / `#E2E8F0` | Differs from `#D1DCE0` |
| Accent | `--church-getpro-orange` | `#FF9800` | Aligned |

**UI areas using BB colors:** PUBLIC_WEBSITE (`apex.css`, `tenant-public.css`), AUTH/REGISTRATION (`apex-auth`, `tenant-auth`, `gp-auth-reg` blessboard theme), ADMIN (`platform-admin`, `hq-admin`), STAFF_APP (`branch-admin`), MEMBER_PORTAL, WEBSITE_EDITOR (BB theme CSS + platform website CSS), SHARED_COMPONENT (design tokens).

---

## 3. ActiveClinic palette (source of truth in code)

ActiveClinic is **intentionally dual-branded by surface**.

### A) Public / tenant / patient / auth teal (`ac-tokens.css`, `ac-auth.css`, `ac-public.css`, `ac-patient.css`)

| Role | Token | Color |
| --- | --- | --- |
| Primary | `--acp-primary` | `#006068` |
| Primary hover | `--acp-primary-hover` | `#0F766E` |
| Primary strong | `--acp-primary-strong` | `#004F56` |
| Primary light | `--acp-primary-soft` | `#D5FAFF` |
| Accent / navy heading | `--acp-navy` | `#213145` |
| Page background | `--acp-bg` | `#F8F9FF` |
| Surface | `--acp-surface` | `#FFFFFF` |
| Surface low | `--acp-surface-low` | `#F1F4F6` |
| Primary text | `--acp-ink` | `#181C1E` |
| Secondary text | `--acp-muted` | `#3E494A` |
| Border | `--acp-border` | `#C4C7C9` |
| Outline / input emphasis | `--acp-outline` | `#BAC6EC` |
| Link | `--product-link` | `#004F56` |
| Success | `--ac-status-success` | `#027A48` |
| Warning | `--ac-status-warning` | `#B54708` |
| Error/danger | `--acp-error` / `--ac-status-danger` | `#BA1A1A` |
| Info | `--ac-status-info` | `#026AA2` |
| Focus | `--acp-focus` | `#006068` |
| Button primary | primary / on-primary | `#006068` / `#FFFFFF` |

Auth shell maps `--ac-auth-*` → `--acp-*` (good token hygiene; few literals).

### B) Staff / admin app blue (`ac-app-tokens.css`, `ac-app.css`, `gp-ops-shared.css`)

| Role | Token | Color |
| --- | --- | --- |
| Primary | `--ac-primary` | `#2563EB` |
| Primary hover/dark | `--ac-primary-dark` | `#1D4ED8` |
| Primary light | `--ac-primary-light` | `#EFF6FF` |
| Page background | `--ac-background` | `#F8FAFC` |
| Surface | `--ac-surface` | `#FFFFFF` |
| Primary text | `--ac-text-primary` | `#111827` |
| Secondary text | `--ac-text-secondary` | `#6B7280` |
| Border | `--ac-border` | `#E5E7EB` |
| Success | `--ac-success` | `#16A34A` |
| Warning | `--ac-warning` | `#D97706` |
| Error | `--ac-danger` | `#DC2626` |
| Info | `--ac-info` | `#2563EB` (same as primary) |
| Disabled | `--ac-disabled` | `#9CA3AF` |
| Focus | `--ac-focus` | `#2563EB` |
| Navigation / sidebar / header | staff chrome in `ac-app.css` | blue + slate neutrals |
| Button primary | `--ac-primary` | `#2563EB` |

**Important:** staff tokens comment that Batch 2 slate values (`#0F172A` / `#64748B` / `#E2E8F0`) should normalize to ODS neutrals — but those slate literals still appear widely as hardcoded drift in component CSS.

---

## 4. Shared / platform palette

Canonical: `public/theme.css` (GetPro DS / M3-aligned). Still violet-branded at platform level.

| Role | Token | Color |
| --- | --- | --- |
| Primary | `--color-primary` / `--base-violet-500` | `#6C5CE7` |
| Primary dark/hover | `--wf-primary-dark` / `--base-violet-600` | `#5A4BD1` |
| Primary soft | `--base-primary-container` | `#EDE9FE` |
| Accent | `--color-accent` / `--base-purple-600` | `#7C3AED` |
| Page background | `--color-background` / `--base-canvas` | `#F6F7FB` |
| Surface | `--color-surface` | `#FFFFFF` |
| Surface muted | `--base-surface-muted` | `#F1F3F9` |
| Primary text | `--color-text-primary` / `--base-text` | `#121417` |
| Secondary text | `--base-text-muted` | `#5F6B7A` |
| Muted/subtle text | `--base-text-subtle` | `#8A94A6` |
| Border | `--base-outline` | `#E4E8F0` |
| Border strong | `--base-outline-strong` | `#D6DBE6` |
| Success | `--base-success` | `#16A34A` |
| Warning | `--base-warning` | `#F59E0B` |
| Error | `--base-error` | `#DC2626` |
| Focus | `--color-focus` | primary |
| Button primary | `--btn-primary-*` | violet |

Also present:

- `public/platform/gp-auth-reg.css` — shared AUTH/REGISTRATION structure; brand via `body[data-gp-product]`
- `public/platform/gp-ops-shared.css` — shared ops primitives; default primary `#2563EB` (AC staff-leaning)
- Website editor CSS under `public/platform/website-*.css` — mixed literals + `var(--product-*)` / local vars
- Dark-mode overrides in `theme.css` (`[data-theme="dark"]`) — separate dark neutrals (`#121212`, `#1E1E1E`, …)

Platform `theme-colors.css` is explicitly **not** loaded by V7 AC/BB shells (legacy reference only).

---

## 5. Complete normalized color inventory

Full unique normalized set size: **663**. Below: top **80** by approximate occurrence count (production UI scan). Remaining colors are mostly one-off decorative / SVG / marketing / tenant-theme samples.

| NORMALIZED_HEX | RGB | PRODUCT | UI_AREA | SEMANTIC_USAGE | FILES | APPROX_USAGE_COUNT | HARDCODED_OR_TOKEN | NOTES |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #FFFFFF | rgb(255,255,255) | SHARED_BB_AC | ADMIN,AUTH,MEMBER_PORTAL,OTHER | Surface / on-primary | 58 | 1135 | MIXED | --ac-about-card; --ac-auth-on-primary; --ac-auth-surface; --ac-mw-surface |
| #6C5CE7 | rgb(108,92,231) | BLESSBOARD | ADMIN,AUTH,MEMBER_PORTAL,OTHER | BB/platform brand primary | 36 | 575 | MIXED | --base-violet-500; --bb-apex-primary; --bb-apex-shadow-md; --bb-auth-shadow |
| #EFEAFF | rgb(239,234,255) | BLESSBOARD | AUTH,MEMBER_PORTAL,OTHER,PUBLIC_WEBSITE | BB primary soft | 12 | 161 | MIXED | --bb-color-primary-soft; --bb-gradient-mesh; --bb-gradient-page |
| #000000 | rgb(0,0,0) | SHARED_BB_AC | ADMIN,AUTH,OTHER,PATIENT_PORTAL | Black (shadows/SVG) | 28 | 158 | MIXED | --bb-apex-shadow-sm; --bb-shadow-sm; --bb-urp-shadow; --bb-urp-shadow-lg |
| #44474E | rgb(68,71,78) | BLESSBOARD | AUTH,PUBLIC_WEBSITE | BB muted text | 10 | 140 | MIXED | --bb-apex-text-secondary; --bb-auth-muted; --bb-color-muted; --bb-wm-muted |
| #D1DCE0 | rgb(209,220,224) | BLESSBOARD | AUTH,PUBLIC_WEBSITE | BB border | 11 | 108 | MIXED | --bb-apex-border; --bb-auth-line; --bb-color-border; --bb-wm-border |
| #0F172A | rgb(15,23,42) | SHARED_BB_AC | AUTH,OTHER,PUBLIC_WEBSITE,REGISTRATION | Slate-900 (hardcoded drift) | 29 | 86 | MIXED | --ac-about-primary; --acp-ink; --bb-color-on-primary; --bb-gradient-page |
| #D9E4E9 | rgb(217,228,233) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 4 | 85 | MIXED | --church-surface-variant |
| #5341CD | rgb(83,65,205) | BLESSBOARD | AUTH,MEMBER_PORTAL,OTHER,PUBLIC_WEBSITE | BB primary hover | 15 | 81 | MIXED | --bb-apex-primary-dark; --bb-auth-violet-deep; --bb-color-primary-hover; --church-primary-container |
| #C8C4D7 | rgb(200,196,215) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 2 | 81 | MIXED | --church-outline; --church-public-card-border |
| #E2E8F0 | rgb(226,232,240) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | Slate-200 (hardcoded drift) | 21 | 67 | MIXED | --ac-mw-border; --acp-border; --bb-urp-border-soft; --church-border |
| #1A1C1E | rgb(26,28,30) | BLESSBOARD | AUTH,MEMBER_PORTAL,PUBLIC_WEBSITE | BB ink / primary text | 13 | 67 | MIXED | --bb-apex-text; --bb-auth-ink; --bb-color-ink; --bb-color-overlay |
| #131D21 | rgb(19,29,33) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 3 | 62 | MIXED | --church-navy; --church-shadow-sm; --church-text |
| #0F766E | rgb(15,118,110) | SHARED_BB_AC | ADMIN,AUTH,MEMBER_PORTAL,OTHER | BB success / AC teal hover | 26 | 61 | MIXED | --ac-auth-primary-hover; --ac-teal; --acp-primary-hover; --bb-auth-ok |
| #64748B | rgb(100,116,139) | SHARED_BB_AC | ADMIN,AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | Slate-500 (hardcoded drift) | 23 | 58 | MIXED | --ac-about-tertiary; --gp-add-sec-muted; --gp-lib-muted; --mx-ann-muted |
| #2563EB | rgb(37,99,235) | SHARED_BB_AC | ADMIN,PUBLIC_WEBSITE,WEBSITE_EDITOR | AC staff primary / info | 9 | 55 | MIXED | --ac-info; --ac-primary; --gp-ops-primary |
| #F2F0ED | rgb(242,240,237) | BLESSBOARD | MEMBER_PORTAL,PUBLIC_WEBSITE | BB surface dim | 9 | 52 | MIXED | --bb-apex-surface-dim; --bb-color-surface-dim |
| #F8FAFC | rgb(248,250,252) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | AC staff / ops page bg | 17 | 49 | MIXED | --ac-background; --acp-bg; --bb-color-ink; --church-surface-muted |
| #6B7280 | rgb(107,114,128) | SHARED_BB_AC | PUBLIC_WEBSITE | AC staff / slate muted | 8 | 47 | MIXED | --ac-text-secondary; --church-powered-by-gray; --gp-ops-muted |
| #F1FBFF | rgb(241,251,255) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 4 | 41 | MIXED | --bb-gradient-page; --church-surface |
| #E5E7EB | rgb(229,231,235) | SHARED_BB_AC | ADMIN,PUBLIC_WEBSITE | AC staff border | 7 | 39 | MIXED | --ac-border; --gp-ops-border |
| #006068 | rgb(0,96,104) | ACTIVECLINIC | AUTH,PUBLIC_WEBSITE,REGISTRATION,WEBSITE_EDITOR | AC public primary teal | 11 | 34 | MIXED | --ac-auth-focus; --ac-auth-primary; --acp-primary; --gp-auth-focus |
| #111827 | rgb(17,24,39) | SHARED_BB_AC | PUBLIC_WEBSITE,WEBSITE_EDITOR | AC staff text primary | 5 | 33 | MIXED | --ac-shadow; --ac-shadow-sm; --ac-text-primary; --bb-color-surface |
| #ECFDF5 | rgb(236,253,245) | BLESSBOARD | AUTH,MEMBER_PORTAL,OTHER,PUBLIC_WEBSITE | misc / decorative | 18 | 32 | MIXED | --bb-auth-ok-bg; --bb-color-success-bg |
| #0D9488 | rgb(13,148,136) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 13 | 31 | MIXED | --palette-tenant-cyan; --tenant-theme-demo-chip-bg; --tenant-theme-demo-hero-tint |
| #BA1A1A | rgb(186,26,26) | SHARED_BB_AC | AUTH,MEMBER_PORTAL,PUBLIC_WEBSITE,WEBSITE_EDITOR | AC public / shared danger | 11 | 31 | MIXED | --ac-status-danger; --acp-error; --bb-urp-error; --gp-cm-danger |
| #FFDAD6 | rgb(255,218,214) | SHARED_BB_AC | MEMBER_PORTAL,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 12 | 31 | MIXED | --ac-status-danger-bg; --acp-error-bg; --bb-urp-error-container; --danger |
| #FBF9F6 | rgb(251,249,246) | BLESSBOARD | AUTH,MEMBER_PORTAL,PUBLIC_WEBSITE | BB page background | 11 | 28 | MIXED | --bb-apex-surface; --bb-auth-bg; --bb-color-page; --gp-auth-bg |
| #B3261E | rgb(179,38,30) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE | BB error | 10 | 25 | MIXED | --bb-apex-error; --bb-auth-err; --bb-color-error |
| #283236 | rgb(40,50,54) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 2 | 25 | MIXED | --church-charcoal; --church-inverse-surface |
| #7C3AED | rgb(124,58,237) | SHARED_BB_AC | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 7 | 24 | MIXED | --base-purple-600; --gp-we-primary-container; --palette-tenant-violet |
| #DC2626 | rgb(220,38,38) | SHARED_BB_AC | PUBLIC_WEBSITE,WEBSITE_EDITOR | AC staff / platform error | 9 | 23 | MIXED | --ac-danger; --ac-status-danger; --base-error |
| #F3F4F6 | rgb(243,244,246) | SHARED_BB_AC | PUBLIC_WEBSITE | misc / decorative | 9 | 22 | MIXED | --ac-bg-muted; --ac-status-neutral-bg; --acw-contact-surface-low |
| #1F2430 | rgb(31,36,48) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 3 | 22 | HARDCODED | literal only |
| #E4DFEC | rgb(228,223,236) | BLESSBOARD | OTHER,PUBLIC_WEBSITE | misc / decorative | 4 | 22 | MIXED | --line; --violet |
| #121417 | rgb(18,20,23) | PLATFORM_SHARED | OTHER,PUBLIC_WEBSITE | Platform text / black | 6 | 21 | MIXED | --base-black; --base-text |
| #F8F9FF | rgb(248,249,255) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | AC public page bg | 8 | 21 | MIXED | --ac-about-surface; --ac-auth-bg; --acp-bg; --bb-about-surface |
| #E4DFFF | rgb(228,223,255) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 2 | 21 | MIXED | --church-primary-fixed |
| #5B6472 | rgb(91,100,114) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 3 | 21 | HARDCODED | literal only |
| #1D4ED8 | rgb(29,78,216) | SHARED_BB_AC | ADMIN,AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | AC staff primary hover | 8 | 20 | MIXED | --ac-primary-dark; --gp-ops-primary-hover |
| #191C1E | rgb(25,28,30) | SHARED_BB_AC | AUTH,PATIENT_PORTAL,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 9 | 20 | MIXED | --ac-auth-shadow; --ac-mw-ink; --bb-urp-on-surface; --bb-wm-ink |
| #93000A | rgb(147,0,10) | SHARED_BB_AC | AUTH,MEMBER_PORTAL,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 10 | 20 | MIXED | --bb-urp-on-error-container; --urp-on-error-container; --urp-status-danger-fg |
| #FFF7ED | rgb(255,247,237) | SHARED_BB_AC | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 7 | 20 | HARDCODED | literal only |
| #9A5B00 | rgb(154,91,0) | BLESSBOARD | MEMBER_PORTAL,PUBLIC_WEBSITE | misc / decorative | 4 | 20 | HARDCODED | literal only |
| #0066CC | rgb(0,102,204) | PLATFORM_SHARED | PUBLIC_WEBSITE | misc / decorative | 3 | 19 | MIXED | --palette-tenant-blue; --tenant-theme-il-border; --tenant-theme-il-chip-bg; --tenant-theme-il-hero-tint |
| #B91C1C | rgb(185,28,28) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 11 | 19 | MIXED | --mx-ann-danger; --mx-forms-danger |
| #F59E0B | rgb(245,158,11) | BLESSBOARD | ADMIN,PUBLIC_WEBSITE | misc / decorative | 6 | 18 | MIXED | --base-warning; --bb-about-amber |
| #F1F5F9 | rgb(241,245,249) | SHARED_BB_AC | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 10 | 18 | MIXED | --color-slate-100; --gp-lib-soft; --urp-slate-chip |
| #101828 | rgb(16,24,40) | SHARED_BB_AC | PUBLIC_WEBSITE,REGISTRATION,WEBSITE_EDITOR | misc / decorative | 6 | 18 | HARDCODED | literal only |
| #0B1C30 | rgb(11,28,48) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 7 | 18 | MIXED | --bb-about-on |
| #A7F3D0 | rgb(167,243,208) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 11 | 18 | MIXED | --acp-border; --bb-color-success-border |
| #E6E8EE | rgb(230,232,238) | UNKNOWN | ADMIN,WEBSITE_EDITOR | misc / decorative | 2 | 18 | HARDCODED | literal only |
| #C6C6CD | rgb(198,198,205) | SHARED_BB_AC | PUBLIC_WEBSITE | misc / decorative | 3 | 17 | MIXED | --ac-about-outline; --bb-about-outline |
| #CCC3D8 | rgb(204,195,216) | BLESSBOARD | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 4 | 17 | MIXED | --bb-contact-border; --gp-we-outline-variant |
| #16A34A | rgb(22,163,74) | SHARED_BB_AC | PUBLIC_WEBSITE | AC staff / platform success | 6 | 16 | MIXED | --ac-status-success; --ac-success; --base-success |
| #EDE9FE | rgb(237,233,254) | BLESSBOARD | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 9 | 16 | MIXED | --base-primary-container; --mx-ann-accent-soft; --mx-forms-accent-soft |
| #3E494A | rgb(62,73,74) | ACTIVECLINIC | AUTH,PUBLIC_WEBSITE | AC public muted | 4 | 16 | MIXED | --ac-auth-muted; --acp-muted; --gp-auth-muted |
| #FEF2F2 | rgb(254,242,242) | SHARED_BB_AC | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 13 | 16 | MIXED | --ac-status-danger-bg |
| #FAF6FF | rgb(250,246,255) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 1 | 16 | MIXED | --church-on-primary-container |
| #FEF3F2 | rgb(254,243,242) | BLESSBOARD | AUTH,OTHER,PUBLIC_WEBSITE | misc / decorative | 7 | 16 | MIXED | --bb-auth-err-bg; --bb-color-error-bg; --err-bg; --violet |
| #4F46E5 | rgb(79,70,229) | SHARED_BB_AC | PUBLIC_WEBSITE | misc / decorative | 5 | 15 | MIXED | --base-indigo-600; --bb-about-secondary |
| #475569 | rgb(71,85,105) | SHARED_BB_AC | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 11 | 15 | MIXED | --acp-muted |
| #D97706 | rgb(217,119,6) | SHARED_BB_AC | MEMBER_PORTAL,PUBLIC_WEBSITE | AC staff warning | 9 | 15 | MIXED | --ac-status-warning; --ac-warning |
| #3D4947 | rgb(61,73,71) | ACTIVECLINIC | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 3 | 15 | MIXED | --acp-muted; --acw-contact-muted |
| #C6BFFF | rgb(198,191,255) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 2 | 15 | MIXED | --church-primary-fixed-dim |
| #EAF5FA | rgb(234,245,250) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 2 | 15 | MIXED | --church-surface-container-low; --church-surface-dim |
| #FF9800 | rgb(255,152,0) | BLESSBOARD | AUTH,OTHER,PUBLIC_WEBSITE | BB/GetPro accent orange | 7 | 15 | MIXED | --bb-apex-orange; --bb-auth-getpro; --bb-color-accent; --church-getpro-orange |
| #E8E4DC | rgb(232,228,220) | BLESSBOARD | MEMBER_PORTAL,PUBLIC_WEBSITE | misc / decorative | 2 | 15 | HARDCODED | literal only |
| #1A1625 | rgb(26,22,37) | BLESSBOARD | OTHER,PUBLIC_WEBSITE | misc / decorative | 4 | 15 | MIXED | --ink; --violet |
| #1E3A8A | rgb(30,58,138) | BLESSBOARD | PUBLIC_WEBSITE | misc / decorative | 4 | 14 | MIXED | --palette-tenant-navy; --tenant-theme-na-chip-bg; --tenant-theme-na-hero-tint |
| #B45309 | rgb(180,83,9) | SHARED_BB_AC | ADMIN,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 7 | 14 | HARDCODED | literal only |
| #EFF4FF | rgb(239,244,255) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 6 | 14 | MIXED | --ac-about-surface-low; --bb-about-surface-low; --bb-contact-muted-bg; --gp-we-rail-bg |
| #92400E | rgb(146,64,14) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 5 | 14 | HARDCODED | literal only |
| #BFC8CD | rgb(191,200,205) | PLATFORM_SHARED | WEBSITE_EDITOR | misc / decorative | 2 | 14 | MIXED | --gp-add-sec-border |
| #F6F7FB | rgb(246,247,251) | PLATFORM_SHARED | OTHER,PUBLIC_WEBSITE,WEBSITE_EDITOR | Platform canvas | 8 | 13 | MIXED | --base-canvas; --mx-ann-bg; --mx-forms-bg |
| #FECACA | rgb(254,202,202) | ACTIVECLINIC | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 9 | 13 | MIXED | --color-on-error-container |
| #334155 | rgb(51,65,85) | SHARED_BB_AC | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 8 | 13 | HARDCODED | literal only |
| #F7F9FB | rgb(247,249,251) | SHARED_BB_AC | AUTH,PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 5 | 13 | MIXED | --ac-mw-soft; --bb-urp-surface; --bbr08-surface |
| #121C2A | rgb(18,28,42) | BLESSBOARD | PUBLIC_WEBSITE,WEBSITE_EDITOR | misc / decorative | 3 | 13 | MIXED | --bb-contact-ink; --gp-we-on-surface |
| #198754 | rgb(25,135,84) | PLATFORM_SHARED | PUBLIC_WEBSITE | misc / decorative | 2 | 12 | TOKEN | --palette-tenant-green; --tenant-theme-zm-chip-bg; --tenant-theme-zm-hero-tint |

### Classification summary (all 663 colors)

| PRODUCT class | Unique colors |
| --- | --- |
| BLESSBOARD | 327 |
| ACTIVECLINIC | 137 |
| PLATFORM_SHARED | 110 |
| SHARED_BB_AC | 71 |
| UNKNOWN | 18 |

(Counts above are mutually exclusive classifications of each normalized HEX. Raw “appears in product path” sets are larger: BB=398, AC=208, Platform=230.)

### Named colors (color-context only)

Common named uses in UI CSS: `transparent`, `currentColor`, `white`, `black`, `inherit`. These are acceptable for non-brand roles; prefer tokens for `white`/`black` when they represent surfaces/text.

### Gradients

- BB page atmosphere: `--bb-gradient-page`, `--bb-gradient-primary`, `--bb-gradient-mesh` (violet/warm)
- Platform CTA/footer/article gradients in `theme.css`
- Marketing/home story backgrounds (`--color-home-story-bg-*`)
- Product website themes (BB contemporary fellowship; AC family wellness mint)

---

## 6. Hard-coded color inventory

**Definition used:** literal `#hex` / `rgb()` / `rgba()` appearing on a non-token-definition line in a non-token file.

| Severity bucket | Unique file×color locations |
| --- | --- |
| HIGH (buttons/nav/bg/text/error/success/focus-ish lines) | ~918 |
| MEDIUM (borders/cards/icons/surfaces) | ~170 |
| LOW | ~35 |
| **Total** | **1123** |

Severity heuristic is intentionally conservative (many literals on `color:`/`background:` lines). Treat HIGH as migration priority, not as “1123 defects.”

### Highest-concentration files

| FILE | UNIQUE_COLORS |
| --- | --- |
| public/church/church.css | 131 |
| public/blessboard/v5/platform-admin.css | 123 |
| public/blessboard/v5/hq-admin.css | 72 |
| public/styles.css | 58 |
| public/blessboard/v5/tenant-public.css | 58 |
| public/blessboard/v5/apex.css | 51 |
| public/activeclinic/ac-app.css | 49 |
| public/blessboard/v5/branch-admin.css | 42 |
| public/activeclinic/acw-platform.css | 40 |
| public/activeclinic/ac-public.css | 36 |
| public/platform/website-inline-edit.css | 33 |
| public/blessboard/v5/member-portal.css | 29 |
| public/activeclinic/website-cms.css | 26 |
| public/platform/website-theme-gallery.css | 24 |
| public/platform/website-change-manager-ui.css | 24 |
| public/blessboard/v5/tenant-auth.css | 24 |
| public/blessboard/v5/apex-auth.css | 24 |
| public/blessboard/v5/media-picker.css | 18 |
| public/platform/website-history.css | 16 |
| public/platform/website-scope-list.css | 16 |
| public/platform/forms-builder.css | 14 |
| public/platform/gp-ops-shared.css | 13 |
| public/activeclinic/ac-urp.css | 12 |
| public/platform/gp-auth-reg.css | 11 |
| public/blessboard/v5/website-theme-contemporary-fellowship.css | 11 |

### Sample HIGH hardcoded locations

| COLOR | PRODUCT | UI_AREA | FILE | LINE |
| --- | --- | --- | --- | --- |
| #15803D | PLATFORM_SHARED | OTHER | public/styles.css | color: var(--success-text, #15803d); |
| #B91C1C | PLATFORM_SHARED | OTHER | public/styles.css | color: var(--danger-text, #b91c1c); |
| #EF9A9A | PLATFORM_SHARED | OTHER | public/styles.css | border-color: #ef9a9a; |
| #FFEBEE | PLATFORM_SHARED | OTHER | public/styles.css | background: #ffebee; |
| #B71C1C | PLATFORM_SHARED | OTHER | public/styles.css | color: #b71c1c; |
| #2563EB | PLATFORM_SHARED | OTHER | public/styles.css | background: color-mix(in srgb, var(--accent, #2563eb) 12%, transparent); |
| #1D4ED8 | PLATFORM_SHARED | OTHER | public/styles.css | color: var(--accent, #1d4ed8); |
| #0F172A | PLATFORM_SHARED | OTHER | public/styles.css | box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground, #0f172a) 6%, transparent); |
| #E2E8F0 | PLATFORM_SHARED | OTHER | public/styles.css | border-color: color-mix(in srgb, var(--accent, #2563eb) 35%, var(--border, #e2e8f0)); |
| #B45309 | PLATFORM_SHARED | OTHER | public/styles.css | background: color-mix(in srgb, var(--warn, #b45309) 12%, transparent); |
| #E5E7EB | PLATFORM_SHARED | OTHER | public/styles.css | border-bottom: 1px solid color-mix(in srgb, var(--border, #e5e7eb) 80%, transparent); |
| #991B1B | PLATFORM_SHARED | OTHER | public/styles.css | color: #991b1b; |
| #166534 | PLATFORM_SHARED | OTHER | public/styles.css | color: #166534; |
| #111827 | PLATFORM_SHARED | OTHER | public/styles.css | color: #111827; |
| #F3F4F6 | PLATFORM_SHARED | OTHER | public/styles.css | background: #f3f4f6; |
| #E0E7FF | PLATFORM_SHARED | OTHER | public/styles.css | background: linear-gradient(135deg, #e0e7ff, #ede9fe); |
| #EDE9FE | PLATFORM_SHARED | OTHER | public/styles.css | background: linear-gradient(135deg, #e0e7ff, #ede9fe); |
| #6B7280 | PLATFORM_SHARED | OTHER | public/styles.css | color: #6b7280; |
| #F9FAFB | PLATFORM_SHARED | OTHER | public/styles.css | background: #f9fafb; |
| #9CA3AF | PLATFORM_SHARED | OTHER | public/styles.css | color: #9ca3af; |
| #F59E0B | PLATFORM_SHARED | OTHER | public/styles.css | color: #f59e0b; |
| #374151 | PLATFORM_SHARED | OTHER | public/styles.css | color: #374151; |
| #4B5563 | PLATFORM_SHARED | OTHER | public/styles.css | color: #4b5563; |
| #6366F1 | PLATFORM_SHARED | OTHER | public/styles.css | background: linear-gradient(90deg, #6366f1, #7c3aed); |
| #7C3AED | PLATFORM_SHARED | OTHER | public/styles.css | background: linear-gradient(90deg, #6366f1, #7c3aed); |
| #FAFAFA | PLATFORM_SHARED | OTHER | public/styles.css | background: #fafafa; |
| #E8F5E9 | PLATFORM_SHARED | OTHER | public/styles.css | background: #e8f5e9; |
| #2E7D32 | PLATFORM_SHARED | OTHER | public/styles.css | color: #2e7d32; |
| #A5D6A7 | PLATFORM_SHARED | OTHER | public/styles.css | border-color: #a5d6a7; |
| #FFF8E1 | PLATFORM_SHARED | OTHER | public/styles.css | background: #fff8e1; |
| #F57F17 | PLATFORM_SHARED | OTHER | public/styles.css | color: #f57f17; |
| #FFE082 | PLATFORM_SHARED | OTHER | public/styles.css | border-color: #ffe082; |
| #D1D5DB | PLATFORM_SHARED | OTHER | public/styles.css | border-color: #d1d5db; |
| #EEF2FF | PLATFORM_SHARED | OTHER | public/styles.css | background: #eef2ff; |
| #4338CA | PLATFORM_SHARED | OTHER | public/styles.css | color: #4338ca; |
| #C7D2FE | PLATFORM_SHARED | OTHER | public/styles.css | border-color: #c7d2fe; |
| #E3F2FD | PLATFORM_SHARED | OTHER | public/styles.css | background: #e3f2fd; |
| #1565C0 | PLATFORM_SHARED | OTHER | public/styles.css | color: #1565c0; |
| #90CAF9 | PLATFORM_SHARED | OTHER | public/styles.css | border-color: #90caf9; |
| #C62828 | PLATFORM_SHARED | OTHER | public/styles.css | color: #c62828; |

### Token files (definitions — good)

- `public/blessboard/v5/design-tokens.css`
- `public/activeclinic/ac-tokens.css`
- `public/activeclinic/ac-app-tokens.css`
- `public/theme.css`
- Partial token blocks in `church.css`, `gp-ops-shared.css`, `gp-auth-reg.css`, `ac-auth.css`

---

## 7. Semantic color drift

Same semantic purpose, different concrete colors across products/files:

| SEMANTIC_ROLE | COLOR_1 | COLOR_2 | COLOR_3 | MORE | PRODUCTS | RECOMMENDED_CONSOLIDATION |
| --- | --- | --- | --- | --- | --- | --- |
| primary | #6C5CE7 | #2563EB | #006068 | +5 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | Keep product brand primaries separate (BB violet / AC public teal / AC staff blue); unify via --color-brand-primary product scopes |
| primary_hover | #5341CD | #1D4ED8 | #0F766E | +3 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | Map each product hover to --color-brand-primary-hover only |
| primary_light | #EFEAFF | #EFF6FF | #D5FAFF | +2 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | One soft container token per product brand |
| accent | #FF9800 | #C2410C | #7C3AED | +1 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED | BB keeps GetPro orange; platform marketing accents stay product-scoped |
| page_bg | #FBF9F6 | #F8F9FF | #F8FAFC | +3 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | Collapse neutrals to --color-background (+ optional product warm/cool tint) |
| surface | #FFFFFF | #F2F0ED | #F1F4F6 | +1 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | --color-surface / --color-surface-dim only |
| text_primary | #1A1C1E | #181C1E | #111827 | +3 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | One --color-text-primary (near-black); stop slate-900 vs ink drift |
| text_secondary | #44474E | #3E494A | #6B7280 | +2 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | One --color-text-secondary |
| text_muted | #44474E | #6B7280 | #8A94A6 | +3 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | Alias muted→secondary or distinct tertiary with AA check |
| border | #D1DCE0 | #C4C7C9 | #E5E7EB | +4 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | --color-border-default + --color-border-strong |
| success | #0F766E | #027A48 | #16A34A | +1 | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED | Platform semantic --color-success (pick one green family) |
| warning | #B54708 | #D97706 | #F59E0B |  | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | Platform --color-warning |
| error | #B3261E | #BA1A1A | #DC2626 |  | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED | Platform --color-danger (pick one red family) |
| info | #026AA2 | #2563EB |  |  | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | Platform --color-info (not brand primary unless intentional) |
| disabled | #9A93A8 | #9CA3AF | #8A94A6 |  | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED | Platform --color-disabled |
| focus | #6C5CE7 | #2563EB | #006068 |  | ACTIVECLINIC, BLESSBOARD, PLATFORM_SHARED, UNKNOWN | --color-focus → brand primary per product |

### Highest-impact drift narratives

1. **Three brand primaries in one platform** — BB `#6C5CE7`, AC public `#006068`, AC staff `#2563EB`. Keep all three as brand themes; stop leaking staff blue into BB or public teal into staff inconsistently.
2. **Error reds** — `#B3261E` (BB), `#BA1A1A` (AC public), `#DC2626` (platform + AC staff).
3. **Success greens** — `#0F766E` (BB; also AC hover teal), `#027A48` (AC public status), `#16A34A` (platform/AC staff).
4. **Muted text** — `#44474E`, `#3E494A`, `#6B7280`, `#64748B`, `#5F6B7A`, `#586062`.
5. **Borders** — `#D1DCE0`, `#C4C7C9`, `#E5E7EB`, `#E2E8F0`, `#E4E8F0`, `#C8C4D7`.
6. **Page backgrounds** — warm BB `#FBF9F6`, AC public `#F8F9FF`, AC staff `#F8FAFC`, platform `#F6F7FB`, church cool `#F1FBFF`.
7. **Slate leftover literals** — `#0F172A` / `#64748B` / `#E2E8F0` still hardcoded despite AC staff token normalization comments.

---

## 8. Brand colors vs semantic colors

### A. Platform semantic colors (should converge)

| Semantic token (proposed) | Current candidates to consolidate |
| --- | --- |
| `--color-background` | `#FBF9F6` / `#F8F9FF` / `#F8FAFC` / `#F6F7FB` (allow product tint override) |
| `--color-surface` | `#FFFFFF` |
| `--color-surface-dim` | `#F2F0ED` / `#F1F4F6` / `#F1F3F9` / `#F3F4F6` |
| `--color-text-primary` | `#1A1C1E` / `#181C1E` / `#111827` / `#121417` / `#0F172A` |
| `--color-text-secondary` | muted family above |
| `--color-text-muted` | tertiary / disabled-adjacent |
| `--color-border-default` | border family above |
| `--color-border-strong` | stronger borders / outlines |
| `--color-success` | pick one green + soft bg/border |
| `--color-warning` | pick one amber/brown + soft |
| `--color-danger` | pick one red + soft |
| `--color-info` | pick one (not necessarily brand primary) |
| `--color-disabled` | grey family |
| `--color-focus` | usually brand-driven |

### B. Product brand colors (must remain distinct)

**BlessBoard**

- `--color-brand-primary`: `#6C5CE7`
- `--color-brand-primary-hover`: `#5341CD`
- `--color-brand-primary-light`: `#EFEAFF`
- `--color-brand-accent`: `#FF9800` (+ readable `#C2410C` for small text)

**ActiveClinic public/portal/auth**

- `--color-brand-primary`: `#006068`
- `--color-brand-primary-hover`: `#0F766E`
- `--color-brand-primary-light`: `#D5FAFF`
- `--color-brand-accent`: `#213145` (navy headings) or dedicated accent if product decides

**ActiveClinic staff/admin**

- `--color-brand-primary`: `#2563EB`
- `--color-brand-primary-hover`: `#1D4ED8`
- `--color-brand-primary-light`: `#EFF6FF`
- `--color-brand-accent`: optional teal `#0F766E` already present as `--ac-teal`

### C. Component semantic tokens (shared names, brand-resolved values)

Examples to standardize:

- `--button-primary-bg` / `-hover` / `-text`
- `--button-secondary-bg` / `-border` / `-text`
- `--input-bg` / `--input-border` / `--input-border-focus`
- `--card-bg` / `--card-border`
- `--nav-bg` / `--nav-text` / `--nav-active-bg` / `--nav-active-text`
- `--link-color` / `--link-hover`

Existing bridges: `--product-primary`, `--product-bg`, `--product-surface`, `--product-text`, `--product-muted`, `--product-border`, `--product-focus`, `--product-link` in BB and AC token files; `--gp-auth-*` and `--gp-ops-*` in platform CSS.

---

## 9. Accessibility observations

Checked WCAG contrast (approximate relative luminance). Threshold: AA normal text ≥ 4.5; large/UI ≥ 3.0.

### Risks

| PAIR | FG | BG | RATIO | STATUS |
| --- | --- | --- | --- | --- |
| BB accent orange on white | #FF9800 | #FFFFFF | 2.16 | FAIL |
| BB disabled on page | #9A93A8 | #FBF9F6 | 2.81 | FAIL |
| AC staff success / bg | #16A34A | #F0FDF4 | 3.15 | LARGE_ONLY |
| AC staff danger / bg | #DC2626 | #FEF2F2 | 4.41 | LARGE_ONLY |
| Platform subtle / canvas | #8A94A6 | #F6F7FB | 2.86 | FAIL |

### Additional notes

- BB primary button white-on-`#6C5CE7` ≈ **4.86** — passes AA but tight; avoid lightening primary without checking.
- Platform/BB violet primary is OK for buttons; **do not** use `#FF9800` for small body text (use `--bb-color-accent-readable`).
- AC staff success `#16A34A` on `#F0FDF4` and danger `#DC2626` on `#FEF2F2` are weak for small badge text — prefer darker text tokens or stronger backgrounds.
- Disabled greys failing AA is often acceptable for disabled controls, but ensure disabled state is not conveyed by color alone.
- No automated full-page audit of every component; risks above are from token-level pairs.

---

## 10. Proposed common token architecture

**Do not create yet.** Preferred conceptual location (per V2.04 request + platform ownership of mechanisms):

`src/platform/ui/theme/colors.css`

Runtime delivery in this repo today is via `public/**/*.css`. Practical equivalent that matches existing platform CSS loading:

`public/platform/theme/colors.css`

(optionally generated/copied from `src/platform/ui/theme/` if a build step is introduced later).

### Conceptual structure

```css
:root {
  /* Neutral surfaces */
  --color-background: ...;
  --color-surface: ...;
  --color-surface-dim: ...;

  /* Typography */
  --color-text-primary: ...;
  --color-text-secondary: ...;
  --color-text-muted: ...;

  /* Borders */
  --color-border-default: ...;
  --color-border-strong: ...;

  /* Semantic states */
  --color-success: ...;
  --color-warning: ...;
  --color-danger: ...;
  --color-info: ...;
  --color-disabled: ...;

  /* Component aliases (resolved from brand + semantic) */
  --button-primary-bg: var(--color-brand-primary);
  --button-primary-hover: var(--color-brand-primary-hover);
  --button-primary-text: #FFFFFF;
  --input-border: var(--color-border-default);
  --input-border-focus: var(--color-brand-primary);
  --card-bg: var(--color-surface);
  --card-border: var(--color-border-default);
  --nav-bg: var(--color-surface);
  --nav-active-bg: var(--color-brand-primary-light);
  --nav-active-text: var(--color-brand-primary);
  --link-color: var(--color-brand-primary);
  --color-focus: var(--color-brand-primary);
}

[data-product="blessboard"] {
  --color-brand-primary: #6C5CE7;
  --color-brand-primary-hover: #5341CD;
  --color-brand-primary-light: #EFEAFF;
  --color-brand-accent: #FF9800;
  --color-background: #FBF9F6; /* optional product tint */
}

[data-product="activeclinic"][data-surface="public"] {
  --color-brand-primary: #006068;
  --color-brand-primary-hover: #0F766E;
  --color-brand-primary-light: #D5FAFF;
  --color-brand-accent: #213145;
  --color-background: #F8F9FF;
}

[data-product="activeclinic"][data-surface="staff"] {
  --color-brand-primary: #2563EB;
  --color-brand-primary-hover: #1D4ED8;
  --color-brand-primary-light: #EFF6FF;
  --color-background: #F8FAFC;
}
```

Align with existing `data-gp-product` on auth/registration and `--product-*` aliases. Preserve product CSS isolation rules (no BB↔AC domain cross-imports).

---

## 11. Proposed migration strategy

1. **Freeze inventory** (this report) on V4 baseline SHA.
2. **Introduce platform semantic + brand scopes** file; wire into shells behind existing product attributes (`data-gp-product`, future `data-surface`).
3. **Map legacy aliases** (`--bb-*`, `--acp-*`, `--ac-*`, `--church-*`, `--gp-auth-*`, `--gp-ops-*`, `--product-*`) onto the new names without visual change.
4. **Consolidate semantic status first** (success/warning/danger/info/disabled/focus neutrals) — lowest brand conflict.
5. **Replace HIGH hardcoded literals** in shared platform website editor + auth CSS with tokens.
6. **BlessBoard:** migrate `church.css` consumers to V5 tokens or make `--church-*` aliases of `--bb-color-*`; then drain literals from `platform-admin.css`, `hq-admin.css`, `apex.css`, `tenant-public.css`.
7. **ActiveClinic:** keep dual surface brands; drain literals from `ac-app.css`, `ac-public.css`, `acw-platform.css`; eliminate leftover `#0F172A/#64748B/#E2E8F0` drift.
8. **Contrast gate** for status chips and accent text before locking semantic greens/reds.
9. **No big-bang restyle** — alias-first, screenshot parity per shell, then delete dead literals.

---

## 12. Files / components likely requiring migration

### Critical (token sources / shells)

- `public/theme.css`, `public/design-system.css`, `public/styles.css`
- `public/blessboard/v5/design-tokens.css`, `public/blessboard/v5/design-system.css`
- `public/church/church.css` + `views/church/partials/*_shell_start.ejs`
- `public/activeclinic/ac-tokens.css`, `ac-app-tokens.css`, `ac-auth.css`
- `public/platform/gp-auth-reg.css`, `gp-ops-shared.css`
- Shell entrypoints: `views/blessboard/v5/partials/head-design-system.ejs`, `views/activeclinic/layouts/{public,patient,auth,app}-shell.ejs`

### High literal concentration

- BB: `platform-admin.css`, `hq-admin.css`, `apex.css`, `tenant-public.css`, `branch-admin.css`, `member-portal.css`, `media-picker.css`, `apex-auth.css`, `tenant-auth.css`
- AC: `ac-app.css`, `acw-platform.css`, `ac-public.css`, `website-cms.css`, `ac-urp.css`
- Platform website editor: `website-inline-edit.css`, `website-change-manager-ui.css`, `website-history.css`, `website-theme-gallery.css`, `forms-builder.css`, `website-scope-list.css`

### Shared components / patterns

- Buttons, cards, inputs currently split across `design-system.css`, product CSS, and `gp-ops-*`
- Status badges (AC has primitives; BB uses local feedback tokens)
- Focus rings (BB rgba violet vs AC brand focus vs platform `color-mix`)

---

## 13. Risk assessment

| Risk | Level | Notes |
| --- | --- | --- |
| Accidental brand homogenization (BB violet forced onto AC or reverse) | HIGH | Architecture must keep product brand scopes |
| AC dual-brand confusion (teal vs blue) | MEDIUM | Document `data-surface`; do not “pick one” without product decision |
| Visual regression during literal→token migration | HIGH | Alias-first; shell-by-shell visual parity |
| church.css vs design-tokens.css dual BB systems | HIGH | Users still hit both; neutrals already diverge |
| Status color consolidation a11y regressions | MEDIUM | Re-check badge/soft-bg pairs |
| Platform `theme.css` still violet-global | MEDIUM | Fine for GetPro marketing; must not override AC shells |
| Scope creep into business logic / DB | LOW | Colors are CSS/presentation only if migration stays disciplined |
| Production impact of this audit | NONE | Read-only; report file only |

---

## Appendix A — Method notes

- SOURCE OF TRUTH = V4 application code at SHA `05b2afe1caffaee8238cb0d4b3a6fb2f8f8a43d7`.
- Documentation and test fixtures were excluded from inventory counts.
- SVG fills/strokes included when under `public/` (contributes to unique color count and some hardcoded locations).
- HSL literals were normalized to HEX when found.
- `rgba(..., α<1)` occurrences contribute their RGB base to the normalized HEX inventory; alpha variants remain relevant for overlays/focus/shadows.

## Appendix B — Final audit metrics

```
VERSION=2.04
BRANCH=V4
BB_UNIQUE_COLORS=398
AC_UNIQUE_COLORS=208
SHARED_UNIQUE_COLORS=230
HARDCODED_COLOR_LOCATIONS=1123
COLOR_DRIFT_GROUPS=16
ACCESSIBILITY_RISKS=5
PROPOSED_THEME_FILE=src/platform/ui/theme/colors.css
REPORT=docs/qa/V2_04_GUI_COLOR_THEME_AUDIT.md
APPLICATION_CODE_CHANGED=NO
PRODUCTION=UNTOUCHED
FINAL=V2_04_GUI_COLOR_THEME_AUDIT_COMPLETE
```
