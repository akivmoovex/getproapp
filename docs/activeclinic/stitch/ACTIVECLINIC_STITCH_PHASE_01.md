# ActiveClinic Stitch — Phase 1 (`P01`)

**Exact Stitch phase label:** `P01`
**Module:** Authentication / Application shell
**Audited:** 2026-08-04
**Screens:** 7 (Desktop 4 · Mobile 3 · Tablet 0)

Auth, dashboard, shared shell, shared states

## Status summary

| Status | Count |
|--------|------:|
| PARTIAL | 7 |

## Screens

| Exact name | ID | Form | Viewport | Route | View | Loader | Write | Permission | Backend | Status | Notes |
|------------|----|------|----------|-------|------|--------|-------|------------|---------|--------|-------|
| P01 – Dashboard – Desktop | `390032bf54ca44ee851673a4800f9af3` | DESKTOP | 2560×2176 | `GET /app` | `views/activeclinic/app/home-content.ejs` | `loadActiveClinicDashboardHome` | `—` | `authenticated` | PARTIAL | PARTIAL | Real data where available; Stitch sample KPIs/clinical fields not fabricated |
| P01 – Dashboard – Mobile | `8be466d48814446ab8bb087baacc6ec9` | MOBILE | 780×2052 | `GET /app` | `views/activeclinic/app/home-content.ejs` | `loadActiveClinicDashboardHome` | `—` | `authenticated` | PARTIAL | PARTIAL | Real data where available; Stitch sample KPIs/clinical fields not fabricated |
| P01 – Login – Desktop | `ca8a34cf1ecb4fefa2ed31fb9873ae45` | DESKTOP | 2560×2048 | `GET/POST /login` | `views/activeclinic/auth/login.ejs` | `authenticateActiveClinicIdentity` | `POST /login` | `public` | READY | PARTIAL |  |
| P01 – Login – Mobile | `026f619c35b04a5c8dde16eca9f7cf35` | MOBILE | 780×1768 | `GET/POST /login` | `views/activeclinic/auth/login.ejs` | `authenticateActiveClinicIdentity` | `POST /login` | `public` | READY | PARTIAL |  |
| P01 – Navigation Drawer – Mobile | `9f55cec7eb884dbebc2e01c6fb0fe58e` | MOBILE | 780×1768 | `(chrome) /app/*` | `layouts/app-shell + ac-shell-nav.js` | `activeClinicNavigation` | `—` | `authenticated` | READY | PARTIAL |  |
| P01 – Shared Application Shell – Desktop | `01b9125044634434b60223746b815b25` | DESKTOP | 2560×2048 | `(chrome) /app/*` | `views/activeclinic/layouts/app-shell.ejs` | `buildActiveClinicShellViewModel` | `—` | `authenticated` | READY | PARTIAL |  |
| P01 – Shared States – Desktop | `9b881d25874c41f9986246c61de32f41` | DESKTOP | 2560×2048 | `access-state / lifecycle-state / error handler` | `views/activeclinic/app/access-state.ejs + auth/lifecycle-state.ejs` | `renderActiveClinicAccessState` | `—` | `varies` | PARTIAL | PARTIAL | Real data where available; Stitch sample KPIs/clinical fields not fabricated |

## Unprefixed duplicates (do not implement)

- **Login - Desktop** (`8bf5c500e0d14014944618029212b2c9`) → SUPERSEDED/DUPLICATE of **P01 – Login – Desktop**
- **Login - Mobile** (`6e3cbe4963c3428196b10d3bb27421d5`) → SUPERSEDED/DUPLICATE of **P01 – Login – Mobile**
- **Dashboard - Desktop** (`c54b0a846c054044aa0ca05194e320ef`) → SUPERSEDED/DUPLICATE of **P01 – Dashboard – Desktop**
- **Dashboard - Mobile** (`d19b0d5c33ae42e08ca767a11b12e591`) → SUPERSEDED/DUPLICATE of **P01 – Dashboard – Mobile**
- **Application Shell - Desktop** (`9f3abb837fc3413aa128949afce0d8c4`) → SUPERSEDED/DUPLICATE of **P01 – Shared Application Shell – Desktop**
- **Navigation Drawer - Mobile** (`87c5a80e0fcb40179c0d1ce7ea906762`) → SUPERSEDED/DUPLICATE of **P01 – Navigation Drawer – Mobile**

## Platform states (unphased, shared with shell)

- **Access Restricted** (`8731b06bbfa747e98e05372c9aafb3e9`) — status PARTIAL
- **Shared Error State** (`72357dec37864a5a926a1d2b5c551b16`) — status PARTIAL
- **Shared Loading State** (`8a3f15c0be9c47efb192f206df104d5c`) — status PARTIAL
- **Shared Offline State** (`4d31c82537634b5f981c359662d224b3`) — status PARTIAL

## Checkpoint

See `ACTIVECLINIC_STITCH_IMPLEMENTATION_LEDGER.md`.
