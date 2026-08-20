# GetPro Stitch project map

**Last updated:** 2026-08-19  
**Purpose:** Canonical registry of Stitch design projects per GetPro product. Treat each row as an isolated design source of truth.

## Isolation rules (mandatory)

Before retrieving or implementing any Stitch screen via MCP:

1. Confirm the **target product** (`blessboard` or `activeclinic`).
2. For ActiveClinic, confirm the **surface** (public/booking/portal vs internal operations vs clinic mini-website CMS) and its Stitch project ID.
3. Call `list_screens` / `get_screen` / `download_assets` **only** against that project ID.
4. Record the Stitch **project ID**, **screen name**, and **screen ID** in the product map / visual-parity matrix.
5. Do **not** claim “no Stitch reference” until the ActiveClinic projects for that surface have been checked (public, internal ops, and mini-website CMS).
6. Do **not** import BlessBoard navigation, terminology, layouts, or church-specific components into ActiveClinic (or the reverse).

**Never** modify, move, rename, regenerate, or delete screens in another product’s Stitch project.

Shared GetPro platform architecture (host routing, sessions, multi-tenant provisioning) may be reused. Each product keeps its **own** design system, navigation, roles, and domain workflows.

---

## Product ↔ Stitch project registry

| Product code | Product | Stitch project name | Stitch project ID | Domain / surface | Pilot / notes | Screen map |
|--------------|---------|---------------------|-------------------|------------------|---------------|------------|
| `blessboard` | BlessBoard | GetPro Church Platform | `projects/17124191473876947591` | Church management only | Existing church tenants | [`docs/gui/STITCH_SCREEN_MAP.md`](./gui/STITCH_SCREEN_MAP.md) |
| `activeclinic` | ActiveClinic | ActiveClinic Public Ecosystem & Booking Flow | `projects/17813606734422395399` | Public platform, tenant sites, booking, My Booking, patient portal | **Authoritative** for P21–P27 | [`docs/activeclinic/stitch/ACTIVECLINIC_V7_VISUAL_PARITY_MATRIX.md`](./activeclinic/stitch/ACTIVECLINIC_V7_VISUAL_PARITY_MATRIX.md) |
| `activeclinic` | ActiveClinic | ActiveClinic – Juflona Pilot | `projects/12272131183982732110` | Authenticated clinic operations (shell + P01–P07) | **Authoritative** for internal ops; Juflona pilot | [`docs/activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md`](./activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md) |
| `activeclinic` | ActiveClinic | ActiveClinic Universal Authentication Interface (mini-website CMS screens) | `projects/10611909237747031838` | Clinic mini-website, editor, pages, sections, blocks, media, drafts/publishing, branding & settings, reusable content | **Authoritative** for MW01–MW10 website management screens actually generated here | [`docs/activeclinic/stitch/ACTIVECLINIC_MINIWEBSITE_STITCH_INVENTORY.md`](./activeclinic/stitch/ACTIVECLINIC_MINIWEBSITE_STITCH_INVENTORY.md) |

### MCP quick reference

| Product code | Surface | `projectId` (no `projects/` prefix) |
|--------------|---------|-------------------------------------|
| `blessboard` | Church | `17124191473876947591` |
| `activeclinic` | Public / tenant / booking / portal | `17813606734422395399` |
| `activeclinic` | Internal authenticated operations | `12272131183982732110` |
| `activeclinic` | Clinic mini-website / CMS (MW01–MW10) | `10611909237747031838` |

---

## BlessBoard (`blessboard`)

| Field | Value |
|-------|--------|
| Product code | `blessboard` |
| Stitch project name | GetPro Church Platform |
| Stitch project ID | `projects/17124191473876947591` |
| Scope | Church-management screens only |
| Design system | Sacred Modernity (Hanken Grotesk, BlessBoard Violet `#6C5CE7`) |
| Detail map | [`docs/gui/STITCH_SCREEN_MAP.md`](./gui/STITCH_SCREEN_MAP.md) |
| Inventory (legacy V4 paths) | [`docs/blessboard-stitch-screen-inventory.md`](./blessboard-stitch-screen-inventory.md) |

Application routes, screen names, screen IDs, and implementation status live in the BlessBoard screen map (196+ Stitch screens). Do not duplicate that inventory here — update the BlessBoard map when implementing church screens.

---

## ActiveClinic (`activeclinic`) — authoritative Stitch projects by surface

ActiveClinic design authority is **split by surface**. Do not use BlessBoard Stitch for ActiveClinic. Do not import screens across these projects.

### Project 1 — Public / tenant / booking / portal

| Field | Value |
|-------|--------|
| Stitch project name | ActiveClinic Public Ecosystem & Booking Flow |
| Stitch project ID | `projects/17813606734422395399` |
| URL | https://stitch.withgoogle.com/projects/17813606734422395399 |
| Surfaces | Public platform website, clinic directory, clinic onboarding/registration, Juflona mini-website, doctors, services, pricing, consultation booking, procedure booking, My Booking, patient authentication, patient portal, public/mobile state variants |
| Typical phases | P21–P27 |
| Live screens (MCP 2026-08-11) | **189** |

### Project 2 — Internal / authenticated clinic operations

| Field | Value |
|-------|--------|
| Stitch project name | ActiveClinic – Juflona Pilot |
| Stitch project ID | `projects/12272131183982732110` |
| URL | https://stitch.withgoogle.com/projects/12272131183982732110 |
| Surfaces | Authenticated shell, dashboard, patients, appointments, reception, clinical/triage/consultations, pharmacy, laboratory, radiology/diagnostics, billing, cashier, internal mobile variants, operational states |
| Typical phases | P01–P07 (+ P13 staff activation patterns) |
| Live screens (MCP 2026-08-11) | **199** |
| Detail map | [`docs/activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md`](./activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md) |
| Inventory | [`docs/activeclinic/ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md`](./activeclinic/ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md) |

### Project 3 — Clinic mini-website / CMS

| Field | Value |
|-------|--------|
| Stitch project name | ActiveClinic Universal Authentication Interface |
| Stitch project ID | `projects/10611909237747031838` |
| URL | https://stitch.withgoogle.com/projects/10611909237747031838 |
| Surfaces | Public clinic mini-website, website editor, pages, sections, content blocks, media library, drafts, publishing, version history, branding, website settings, reusable content library |
| Typical phases | MW01–MW10 |
| Live screens (MCP 2026-08-20) | **45** (38 mini-website + 7 auth N/A for this task) |
| Inventory | [`docs/activeclinic/stitch/ACTIVECLINIC_MINIWEBSITE_STITCH_INVENTORY.md`](./activeclinic/stitch/ACTIVECLINIC_MINIWEBSITE_STITCH_INVENTORY.md) |

### Shared ActiveClinic fields

| Field | Value |
|-------|--------|
| Product code | `activeclinic` |
| Pilot tenant | Juflona Hospital & Medical Centre |
| Design system | ActiveClinic clinical / public design system (**separate** from BlessBoard; do not reuse Sacred Modernity / church chrome) |
| Visual parity matrix | [`docs/activeclinic/stitch/ACTIVECLINIC_V7_VISUAL_PARITY_MATRIX.md`](./activeclinic/stitch/ACTIVECLINIC_V7_VISUAL_PARITY_MATRIX.md) |

### Overlap selection rules

If equivalent or overlapping screens exist in both ActiveClinic projects:

1. Prefer the project whose screen clearly belongs to that product surface.
2. Prefer the more recent/current approved design when repository evidence establishes recency.
3. Preserve newer V7 functional requirements.
4. Record genuine conflicts as `PRODUCT_DECISION_DIFFERENCE` (do not invent an unevidence hybrid).

Examples of intentional surface separation (not hybrids):

- P27 patient portal register/login/dashboard → **public** project `17813606734422395399`
- P01 staff login/shell/dashboard and P02 staff patient registration/profile → **internal** project `12272131183982732110`
- P24/P25 booking patient details → **public** project; P02 Edit Patient Details → **internal** project

### Screen / route implementation table

Status legend: **PLANNED** · **STITCH_READY** · **PARTIAL** · **MATCHED** · **MISSING** · **DUPLICATE** · **STITCH_GAP**

Full inventory lives in the ActiveClinic inventory + V7 visual parity matrix. Tracker snapshot (internal):

| Area | Screen name | Desktop Stitch ID | Mobile Stitch ID | Application route | Implementation status | Notes |
|------|-------------|-------------------|------------------|-------------------|------------------------|-------|
| Auth | P01 – Login | `ca8a34cf…` | `026f619c…` | `/login` | PARTIAL | Internal project |
| Shell | P01 – Shared Application Shell | `01b91250…` | drawer `9f55cec7…` | `/app/*` | PARTIAL | Internal project |
| Home | P01 – Dashboard | `390032bf…` | `8be466d4…` | `/app` | PARTIAL | Internal project |
| Clinical | P02–P07 | see inventory | see inventory | `/app/*` | PARTIAL/MISSING | Internal project; Pass 3 focus |
| Public/booking/portal | P21–P27 | see parity matrix | see parity matrix | `/`, `/clinics/*` | PARTIAL | Public project |

When implementing a screen:

1. Confirm product = `activeclinic` and select the **surface-correct** project ID.
2. `list_screens` / `get_screen` against **that** project (check the other ActiveClinic project before claiming no reference).
3. Update inventory / parity matrix with **Stitch project ID + screen ID**.
4. Mirror status in the relevant ActiveClinic screen map.

---

## Cross-product checklist

| Check | BlessBoard | ActiveClinic |
|-------|------------|--------------|
| Stitch project isolated | Yes — `17124191473876947591` | Yes — **three** projects by surface: `17813606734422395399` + `12272131183982732110` + `10611909237747031838` |
| May reuse GetPro platform shells | Architecture only | Architecture only |
| May reuse other product’s Stitch screens | **No** | **No** (and no BlessBoard→ActiveClinic) |
| Own navigation / roles / workflows | Church | Clinical + public/booking/portal |
| Own design tokens / CSS scope | `blessboard` / church selectors | `activeclinic` / `ac-public-*` / `acp-*` / app selectors |
