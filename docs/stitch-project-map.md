# GetPro Stitch project map

**Last updated:** 2026-08-03  
**Purpose:** Canonical registry of Stitch design projects per GetPro product. Treat each row as an isolated design source of truth.

## Isolation rules (mandatory)

Before retrieving or implementing any Stitch screen via MCP:

1. Confirm the **target product** (`blessboard` or `activeclinic`).
2. Confirm the **Stitch project ID** for that product (table below).
3. Call `list_screens` / `get_screen` / `download_assets` **only** against that project ID.
4. Record the Stitch **screen name** and **screen ID** in this map (and the product screen map).
5. Do **not** import BlessBoard navigation, terminology, layouts, or church-specific components into ActiveClinic (or the reverse).

**Never** modify, move, rename, regenerate, or delete screens in another product’s Stitch project.

Shared GetPro platform architecture (host routing, sessions, multi-tenant provisioning) may be reused. Each product keeps its **own** design system, navigation, roles, and domain workflows.

---

## Product ↔ Stitch project registry

| Product code | Product | Stitch project name | Stitch project ID | Domain | Pilot / notes | Screen map |
|--------------|---------|---------------------|-------------------|--------|---------------|------------|
| `blessboard` | BlessBoard | GetPro Church Platform | `projects/17124191473876947591` | Church management only | Existing church tenants | [`docs/gui/STITCH_SCREEN_MAP.md`](./gui/STITCH_SCREEN_MAP.md) |
| `activeclinic` | ActiveClinic | ActiveClinic – Juflona Pilot | `projects/12272131183982732110` | Healthcare / clinical only | **Juflona Hospital & Medical Centre** | [`docs/activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md`](./activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md) |

### MCP quick reference

| Product code | `projectId` (no `projects/` prefix) |
|--------------|-------------------------------------|
| `blessboard` | `17124191473876947591` |
| `activeclinic` | `12272131183982732110` |

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

## ActiveClinic (`activeclinic`)

| Field | Value |
|-------|--------|
| Product code | `activeclinic` |
| Stitch project name | ActiveClinic – Juflona Pilot |
| Stitch project ID | `projects/12272131183982732110` |
| Scope | Healthcare screens only |
| Pilot tenant | Juflona Hospital & Medical Centre |
| Design system | ActiveClinic clinical design system (**separate** from BlessBoard; do not reuse Sacred Modernity / church chrome) |
| Detail map | [`docs/activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md`](./activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md) |
| Authoritative inventory | [`docs/activeclinic/ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md`](./activeclinic/ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md) (AC-V6-11) |
| Stitch project created | 2026-08-03 via MCP `create_project` |
| Screens in Stitch (AC-V6-11) | **114** (88 desktop · 26 mobile · packages P01–P07 + platform states) |

### Screen / route implementation table

Status legend: **PLANNED** · **STITCH_READY** · **PARTIAL** · **MATCHED** · **MISSING** · **DUPLICATE** · **STITCH_GAP**

Full inventory lives in the ActiveClinic inventory doc. Tracker snapshot:

| Area | Screen name | Desktop Stitch ID | Mobile Stitch ID | Application route | Implementation status | Notes |
|------|-------------|-------------------|------------------|-------------------|------------------------|-------|
| Auth | P01 – Login | `ca8a34cf…` | `026f619c…` | `/login` | PARTIAL | Canonical; unprefixed Login = DUPLICATE |
| Shell | P01 – Shared Application Shell | `01b91250…` | drawer `9f55cec7…` | `/app/*` | PARTIAL | AC-V6-10 shell exists |
| Home | P01 – Dashboard | `390032bf…` | `8be466d4…` | `/app` | PARTIAL | |
| Clinical | P02–P07 (97) | see inventory | see inventory | future | MISSING | No clinical backend |
| Admin | Facilities / Staff / Access | — | — | `/app/facilities` etc. | STITCH_GAP | Backend read UI without Stitch |

When implementing a screen:

1. Confirm product = `activeclinic` and project ID = `12272131183982732110`.
2. `list_screens` / `get_screen` against **that** project only.
3. Update inventory + screen map status (`STITCH_READY` → `PARTIAL` → `MATCHED`).
4. Mirror the same row in [`docs/activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md`](./activeclinic/ACTIVECLINIC_STITCH_SCREEN_MAP.md).

---

## Cross-product checklist

| Check | BlessBoard | ActiveClinic |
|-------|------------|--------------|
| Stitch project isolated | Yes — `17124191473876947591` | Yes — `12272131183982732110` |
| May reuse GetPro platform shells | Architecture only | Architecture only |
| May reuse other product’s Stitch screens | **No** | **No** |
| Own navigation / roles / workflows | Church | Clinical |
| Own design tokens / CSS scope | `blessboard` / church selectors | `activeclinic` selectors (to be introduced) |
