# ActiveClinic Stitch Parity — Wave 1 Before/After

**Branch:** V7  
**Phase:** Shared tokens, typography, spacing, form controls  
**Baseline:** `ACTIVECLINIC_STITCH_PARITY_BASELINE_2026-08-26.md`  
**Started:** 2026-08-26

---

## 1. Safety (pre-edit)

| Check | Value |
|-------|-------|
| Branch | V7 |
| HEAD | `fc99fa5a35166d5971fcbbb085333bf4efe1291c` |
| origin/V7 | `fc99fa5a35166d5971fcbbb085333bf4efe1291c` |
| Environment | testing |
| DB identity | moovex-platform-v7 |
| Production touched | NO |

---

## 2. Canonical validation targets

| Screen | Stitch ID | Route | Baseline overall |
|--------|-----------|-------|-----------------:|
| P01 – Login – Desktop | `ca8a34cf1ecb4fefa2ed31fb9873ae45` | `/login` | 91 |
| P01 – Dashboard – Desktop | `390032bf54ca44ee851673a4800f9af3` | `/app` | 90 |

Excluded duplicates: `8bf5c500…` (Login), `c54b0a84…` (Dashboard).

---

## 3. BEFORE scores (canonical)

### P01 – Login – Desktop (`ca8a34cf…`)

| Design | Text | Assets | Responsive | Overall |
|-------:|-----:|-------:|-----------:|--------:|
| 91 | 93 | 87 | 91 | **91** |

**Concrete differences vs Stitch P01 HTML (live MCP):**

| Dimension | Stitch P01 | V7 before |
|-----------|------------|-----------|
| Layout | Split 1024px grid (brand + form) | MF01 centered single card (~26rem) — **composition gap (Wave 2+)** |
| Page background | `#f7f9fb` | `#f8f9ff` |
| Primary CTA | `#003c90` navy | `#00685f` teal |
| Card radius | `rounded-xl` (8px) | MF card `1rem` (16px) |
| Input/button radius | 2px (`rounded-DEFAULT`) | 2px — aligned |
| Label typography | 12px / 500 caption | 12px / 500 — aligned |
| H1 “Sign In” | 24px / 600 | 24px / 600 — aligned |
| Button height | ~48px (py-3) | 48px (3rem) — aligned |
| Font | Inter + Plus Jakarta | Inter + Hanken Grotesk |

### P01 – Dashboard – Desktop (`390032bf…`)

| Design | Text | Assets | Responsive | Overall |
|-------:|-----:|-------:|-----------:|--------:|
| 90 | 92 | 86 | 90 | **90** |

**Concrete differences:**

| Dimension | Stitch P01 | V7 before |
|-----------|------------|-----------|
| Page background | `#f7f9fb` / surface tones | `#f8fafc` |
| Panel/card radius | 8px (`rounded-xl` family) | 16px (`--ac-radius-lg`) on panels/stat cards |
| Form control radius | 8px in app contexts | 10px hardcoded on `.ac-input` |
| Section/card padding | 16px stack-md | 16px (`--ac-space-4`) — close |
| Metric card typography | 14px labels, bold values | 11.5px uppercase labels — close |
| KPI content | Clinical operational KPIs | Foundation setup metrics — **product scope (not Wave 1)** |

---

## 4. Stitch token audit (recurring values)

From live Stitch HTML — P01 Login Desktop (`ca8a34cf…`):

### Typography

| Role | Stitch | V7 token before |
|------|--------|-----------------|
| Caption / label | 12px / 500 / 16px lh | 0.75rem — match |
| Body md | 14px / 400 / 20px lh | 0.875rem — match |
| Body lg | 16px / 400 / 24px lh | 1rem — match |
| Headline sm | 20px / 600 | — |
| Headline md (Sign In) | 24px / 600 / 32px lh | 1.5rem — match |
| Button text | 14px / 600 / 20px lh | 0.875rem / 600 — match |

### Spacing (Stitch `spacing` scale)

| Token | px |
|-------|---:|
| unit | 4 |
| stack-sm | 8 |
| gutter | 16 |
| stack-md | 16 |
| stack-lg | 24 |
| container-margin | 24 |

Maps to V7 `--ac-space-1` (4) through `--ac-space-5` (24).

### Radius

| Element | Stitch |
|---------|--------|
| Input / button | 2px |
| Card / panel | 8px (`xl` = 0.5rem) |

### Controls

| Control | Stitch | V7 before |
|---------|--------|-----------|
| Input padding | 8px 12px | ~8px 12px |
| Input height | ~40px | 44px (2.75rem) |
| Button padding | 12px 16px | 12px 16px |
| Button height | ~48px | 48px |

---

## 5. Proposed shared token changes

| CURRENT_VALUE | STITCH_TARGET | REASON | AFFECTED_SURFACES |
|---------------|---------------|--------|-------------------|
| `--ac-auth-bg: #f8f9ff` | `#f7f9fb` | P01 login page background | Auth shell |
| `--ac-auth-primary: #00685f` | `#003c90` | P01 canonical primary navy | Auth buttons, links, mark |
| `--ac-auth-primary-hover: #0f766e` | `#0f52ba` | P01 primary-container hover | Auth CTA hover |
| `--ac-auth-radius: 0.5rem` (unused on MF) | enforce on MF card | Card `rounded-xl` 8px | Login, MF auth |
| MF card `border-radius: 1rem` | `var(--ac-auth-radius)` 8px | Card chrome parity | `/login` |
| `--ac-bg-page: #f8fafc` | `#f7f9fb` | Shell page background | All `/app/*` |
| `--ac-radius-lg: 16px` | `8px` | Dashboard/panel Stitch radius | App panels, metrics |
| `.ac-input` `border-radius: 10px` | `var(--ac-radius-sm)` 8px | Form control parity | App forms |
| `--ac-space-7: 2.5rem` (app override) | `var(--ac-space-7)` from tokens 3rem | Remove drift from shared scale | App spacing |
| New `--ac-text-*` in tokens | Stitch headline/body scale | Shared typography reference | All shells |

---

## 6. AFTER (filled post-implementation)

**Completed:** 2026-08-26  
**Verdict:** `ACTIVECLINIC_STITCH_WAVE1_COMPLETE_WITH_GAPS`

### Changed files

| File | Change |
|------|--------|
| `public/activeclinic/ac-tokens.css` | Wave 1 typography scale, `--ac-control-radius`, `--ac-card-radius`, `--ac-space-8` |
| `public/activeclinic/ac-auth.css` | P01 navy primary `#003c90`, bg `#f7f9fb`, MF card 8px radius, caption typography tokens |
| `public/activeclinic/ac-app.css` | P01 page bg, navy primary, 8px panel/card radius, Stitch muted `#434653`, form control tokens |
| `src/activeclinic/http/renderActiveClinicAuth.js` | Asset bump `v7-wave1-a1` |
| `src/activeclinic/services/buildActiveClinicShellViewModel.js` | Asset bump `v7-wave1-1` |
| `src/activeclinic/http/renderActiveClinicPublic.js` | Asset bump `v7-wave1-p1` |
| `src/activeclinic/http/renderActiveClinicPatient.js` | Asset bump `v7-wave1-pt1` |
| `tests/activeclinic-phase8-mobile.test.js` | Asset version contract |
| `tests/activeclinic-phase9-a11y.test.js` | Asset + muted color contract |
| `tests/activeclinic-mw-stitch-parity.test.js` | Asset version contract |
| `tests/activeclinic-acw09-registration.test.js` | Asset version contract |

### Tokens changed (summary)

| Token | Before | After |
|-------|--------|-------|
| `--ac-auth-primary` | `#00685f` | `#003c90` |
| `--ac-auth-bg` | `#f8f9ff` | `#f7f9fb` |
| `--ac-auth-radius` (MF card) | `1rem` hardcoded | `8px` via `--ac-card-radius` |
| `--ac-bg-page` | `#f8fafc` | `#f7f9fb` |
| `--ac-primary` (app) | `#1d4ed8` | `#003c90` |
| `--ac-muted` (app) | `#475569` | `#434653` (Stitch on-surface-variant) |
| `--ac-radius-lg` (panels) | `16px` | `8px` |
| `.ac-input` radius | `10px` | `2px` (Stitch control DEFAULT) |
| Typography | ad hoc rem | `--ac-text-*` scale in tokens |

### Canonical re-score

| Screen | Design | Text | Assets | Responsive | Overall | Delta |
|--------|-------:|-----:|-------:|-----------:|--------:|------:|
| P01 Login (`ca8a34cf…`) | 91→**94** | 93→93 | 87→87 | 91→91 | **91→94** | **+3** |
| P01 Dashboard (`390032bf…`) | 90→**93** | 92→92 | 86→86 | 90→91 | **90→93** | **+3** |

**Why not ≥95:**

- **Login:** V7 uses MF01 centered card; canonical P01 Stitch is split-pane 1024px grid with brand panel. Wave 1 explicitly did not restructure layout.
- **Dashboard:** V7 shows foundation setup metrics; Stitch shows clinical operational KPIs. Content scope difference caps text/assets scores.

### Sample cascade (12 screens)

| Screen | Before | After | Δ |
|--------|-------:|------:|--:|
| P01 Login Desktop | 91 | 94 | +3 |
| P01 Dashboard Desktop | 90 | 93 | +3 |
| P01 Login Mobile | 93 | 94 | +1 |
| ACW homepage | 90 | 92 | +2 |
| Clinics directory | 93 | 94 | +1 |
| Patient dashboard | 90 | 91 | +1 |
| Booking select service | 94 | 94 | 0 |
| Appointments list | 86 | 88 | +2 |
| Clinical triage | 82 | 84 | +2 |
| Pharmacy dashboard | 86 | 88 | +2 |
| Billing dashboard | 90 | 91 | +1 |
| CMS website editor | 93 | 93 | 0 |

**Estimated cascade:** SCREENS_IMPROVED ≈ 320 · UNCHANGED ≈ 95 · REGRESSED ≈ 0 (no screen >2pt drop observed in sample)

### Tests

| Suite | Result |
|-------|--------|
| `activeclinic-auth-stitch-parity` | **PASS** |
| `activeclinic-dashboard-shell-parity` | **PASS** |
| `activeclinic-phase8-mobile` | **PASS** |
| `activeclinic-phase9-a11y` | **PASS** |
| `activeclinic-mw-stitch-parity` | **PASS** |
| `activeclinic-acw09-registration` | **PASS** |

### Remaining gaps (Wave 2+)

- P01 login split-pane layout (brand panel + form) — Wave 3 auth structure
- P07 billing/cashier P0 cluster (59 screens <80) — Wave 8 deep pass
- Data table/filter bar density — Wave 2 staff shell
- App form control 2px radius may need module-specific 8px for dense clinical forms — monitor in Wave 2

### Safety (post-implementation)

| Check | Value |
|-------|-------|
| CODE_CHANGED | YES (CSS + asset bumps + test contracts) |
| SCHEMA_CHANGED | NO |
| COMMITTED | pending |
| PUSHED | NO |
| HOSTED_CURRENT | not verified |
| PRODUCTION_TOUCHED | NO |
