# ActiveClinic — Stitch screen map (Juflona Pilot)

**Updated:** 2026-08-03 (AC-V6-11 inventory)  
**Product code:** `activeclinic`  
**Stitch project name:** ActiveClinic – Juflona Pilot  
**Stitch project ID:** `projects/12272131183982732110`  
**Pilot tenant:** Juflona Hospital & Medical Centre  
**Parent registry:** [`docs/stitch-project-map.md`](../stitch-project-map.md)

## Isolation

- Retrieve screens **only** from `projectId` `12272131183982732110`.
- Do **not** use BlessBoard project `17124191473876947591` for ActiveClinic work.
- Do **not** import BlessBoard navigation, terminology, layouts, or church-specific components.
- ActiveClinic must maintain its own design system, navigation, roles, and clinical workflows.
- Shared GetPro architecture (routing, sessions, multi-tenant provisioning) may be reused at the platform layer only.

## MCP preflight (every screen)

1. Target product = `activeclinic`
2. Stitch project ID = `projects/12272131183982732110`
3. `list_screens` / `get_screen` against that project only
4. Record screen name + screen ID in the **authoritative inventory** and status below
5. Implement against ActiveClinic routes/views — never BlessBoard EJS/CSS

## Authoritative inventory

**Full table (114 screens):** [`ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md`](ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md)

Supporting: route matrix · permission matrix · waves · shell gap · product decisions.

## Status legend

| Status | Meaning |
|--------|---------|
| **PLANNED** | Intended surface; no Stitch screen yet |
| **STITCH_READY** | Screen exists in Stitch; not yet wired in app |
| **PARTIAL** | Route/view exists; Stitch chrome incomplete |
| **MATCHED** | Side-by-side Stitch ↔ live browser parity claimed |
| **MISSING** | Stitch screen exists; no app route/view yet |
| **DUPLICATE** | Superseded by canonical P01 twin — do not target |
| **STITCH_GAP** | App surface exists; no Stitch design |

## Snapshot (AC-V6-11)

| Metric | Value |
|---:|---|
| Stitch screens | 114 |
| Desktop | 88 |
| Mobile | 26 |
| Packages | P01–P07 + platform states |
| Canonical foundation series | **P01** |
| Clinical STITCH_READY / MISSING | P02–P07 (no backend) |
| Admin STITCH_GAP | Facilities, Staff, Access, Settings, Activate/Forgot/Reset |

## First-wave status tracker

| Area | Screen name | Desktop Stitch ID | Mobile Stitch ID | Intended route | Current route | Status |
|------|-------------|-------------------|------------------|----------------|---------------|--------|
| Auth | P01 – Login | `ca8a34cf1ecb4fefa2ed31fb9873ae45` | `026f619c35b04a5c8dde16eca9f7cf35` | `/login` | `/login` | PARTIAL (S01) |
| Auth | Login (unprefixed) | `8bf5c500e0d14014944618029212b2c9` | `6e3cbe4963c3428196b10d3bb27421d5` | — | — | DUPLICATE |
| Shell | P01 – Shared Application Shell | `01b9125044634434b60223746b815b25` | drawer `9f55cec7…` | `/app/*` | shell | PARTIAL (S02) |
| Shell | Application Shell (unprefixed) | `9f3abb837fc3413aa128949afce0d8c4` | — | — | — | DUPLICATE |
| Nav | P01 – Navigation Drawer | — | `9f55cec7eb884dbebc2e01c6fb0fe58e` | drawer | `ac-shell-nav.js` | PARTIAL |
| Home | P01 – Dashboard | `390032bf54ca44ee851673a4800f9af3` | `8be466d48814446ab8bb087baacc6ec9` | `/app` | `/app` | PARTIAL (S02) |
| States | Shared Error / Loading / Offline / Access Restricted | see inventory | — | chrome | helpers | STITCH_READY |
| Admin | Facilities / Staff / Access / Settings | — | — | `/app/facilities` etc. | exists | STITCH_GAP |
| Clinical | P02–P07 (97 screens) | see inventory | see inventory | future | none | MISSING |

## Design system

| Item | Status |
|------|--------|
| ActiveClinic design tokens / theme | In-app `ac-app.css` foundation; Stitch DS may exist separately — confirm via MCP before regenerate |
| Clinical navigation IA | Present in Stitch dashboards; **do not** ship until Wave 2+ |
| Role model (clinical) | Separate from foundation roles — TBD |

When a design system is created/applied via Stitch MCP, record the asset ID here and apply it only to ActiveClinic screens.


S01 detail: [`stitch/AC_V6_S01_AUTHENTICATION_PARITY.md`](stitch/AC_V6_S01_AUTHENTICATION_PARITY.md).


S02 detail: [`stitch/AC_V6_S02_DASHBOARD_SHELL_PARITY.md`](stitch/AC_V6_S02_DASHBOARD_SHELL_PARITY.md).
