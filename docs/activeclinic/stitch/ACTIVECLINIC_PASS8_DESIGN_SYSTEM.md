# ActiveClinic design system (Pass 8)

## Layers

| Layer | File | Scope |
|-------|------|--------|
| Shared tokens | `public/activeclinic/ac-tokens.css` | All shells |
| Public / tenant / booking | `ac-public.css` | `body.ac-public-body` |
| Patient portal | `ac-patient.css` | `body.ac-patient-body` |
| Authenticated app | `ac-app.css` | `body.ac-app-body` (indigo Stitch ops) |
| Staff auth | `ac-auth.css` | `body.ac-auth-body` (navy login) |
| PhoneField | `ac-phone-field.css` | Shared control |

Public/portal teal (`--acp-*`) and ops indigo (`--ac-*`) stay separate by design (two Stitch projects).

## Typography

Tokens: `--acp-text-display|h1|h2|h3|body|body-lg|small|label|caption|badge`  
Utilities: `.acp-type-display`, `.acp-type-h1`, `.acp-type-h2`, `.acp-type-h3`, `.acp-type-body`, `.acp-type-lede`, `.acp-type-label`, `.acp-type-caption`

## Buttons (public)

| Variant | Class |
|---------|--------|
| Primary | `.ac-btn.ac-btn--primary` |
| Secondary | `.ac-btn.ac-btn--secondary` |
| Ghost | `.ac-btn.ac-btn--ghost` |
| Pill | `.ac-btn--pill` |
| Block | `.ac-btn--block` |

Touch min-height: `var(--acp-touch)` / `var(--ac-touch)`.

## Cards

Prefer composition over new one-offs:

- Media cards: `.acp-clinic-card`, `.ac-doctor-card`, `.ac-service-card`
- Selection: `.acp-choice-card`
- Auth/lookup: `.acp-auth-card`, `.acp-lookup-card`
- Summary: `.ac-booking-summary` / booking detail cards

## Status badges

Base + semantic: `.acp-status-badge` + `--pending|--confirmed|--done|--danger|--neutral` in `ac-tokens.css`.  
Booking-specific aliases remain in `ac-public.css` (`--cancellation-requested`, etc.).

## State partials

- `ac-loading-state.ejs` / `ac-success-state.ejs` / `acp-shared-state.ejs`
- Directory: `public-directory-state.ejs`

## Breakpoints

| Token (docs) | Value | Use |
|--------------|-------|-----|
| mobile max | 767px | Pass 7/8 mobile |
| tablet min | 768px | 2-col |
| app shell | 899/900px | sidebar ↔ drawer |
| desktop | 1024px | dense grids |
| wide | 1440px | content padding |

## Justified `!important`

| Location | Why |
|----------|-----|
| `prefers-reduced-motion` | Accessibility override |
| `.ac-sr-only` | Screen-reader clip |
| `[hidden]` drawers | Ensure closed state wins |
| Choice-card selected borders | Beat base border utility |
| Nav login color | Beat generic nav link color |
| `display:flex !important` on nav-item | Beat legacy `display` on anchors |

## Tenant safety

Juflona media/branding via `activeClinicPublicMediaService` + clinic locals — not hardcoded in CSS.
