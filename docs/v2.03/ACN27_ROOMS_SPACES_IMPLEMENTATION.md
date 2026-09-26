# ActiveClinic V2.03 — ACN27 Rooms & Spaces MVP

| Field | Value |
|-------|--------|
| **Doc ID** | `ACN27_ROOMS_SPACES_IMPLEMENTATION` |
| **Date** | 2026-09-26 |
| **Product application SHA (baseline)** | `0014616f6161b839344039ef7ed44cebeffb9f27` |
| **Stitch project** | `7300898757945019896` |
| **Desktop screen** | `b8f071b326234022afb3eecc665be9bc` |
| **Mobile 390px screen** | `74a8167ce99e45388a7dd1fbe9a92a88` |
| **Verdict** | `V2_03_ACN27_IMPLEMENTATION_PASS` |

---

## Domain contract

**New ActiveClinic domain:** Rooms & Spaces (physical inventory inside a facility).

### Canonical hierarchy

```
Organization
  → Healthcare organization
    → Facility          (B2-10 owns)
      → Room / Space    (ACN27 owns)
        → optional Department (B2-10 owns; association only)
```

### Rules

| Rule | Enforcement |
|------|-------------|
| `facility_id` **REQUIRED** | NOT NULL FK; service rejects missing/forged facility |
| `department_id` **OPTIONAL** | NULL allowed; when set must same org + same facility |
| Room MUST NOT exist outside a facility | FK `(facility_id, healthcare_organization_id)` |
| Never trust `organization_id` from request body | Derived from authenticated server context |
| Do not reuse `service_points` as rooms | Separate table `activeclinic.facility_rooms` |

### Boundary with B2-10

B2-10 remains canonical for facilities, departments, and facility configuration (`/app/facilities`).

ACN27 does **not**:

- replace B2-10
- duplicate facilities or departments
- change facility/department ownership
- reuse reception `service_points` as rooms

---

## Schema

**Migration:** `db/migrations/activeclinic/040_facility_rooms.sql`

**Table:** `activeclinic.facility_rooms`

| Column | Notes |
|--------|--------|
| `id` | UUID PK |
| `organization_id` | Platform org (tenant) |
| `healthcare_organization_id` | Composite FK with org |
| `facility_id` | REQUIRED; scoped to HCO |
| `department_id` | OPTIONAL; scoped to HCO |
| `room_code` | Unique **per facility** (`UNIQUE (facility_id, room_code)`) |
| `display_name` | Human label |
| `room_type` | consultation, exam, triage, treatment, procedure, specimen_lab, administrative, other |
| `floor_area` | Optional floor/area text |
| `description` | Optional |
| `status` | `available` \| `unavailable` \| `inactive` |
| `created_at` / `updated_at` | Timestamps + touch trigger |

**Uniqueness:** facility-scoped room codes only — **not** global.

### Migration application

| Target | Applied |
|--------|---------|
| Testing (`moovex-platform-v7` / `testing`) via `migrate-testing.js` | **YES** (`activeclinic/040_facility_rooms.sql`) |
| Production | **NO** |

---

## Routes

Canonical workspace (does **not** own `/app/facilities`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/app/rooms` | List + search/filter |
| GET | `/app/rooms/new` | Create form |
| POST | `/app/rooms` | Create |
| GET | `/app/rooms/:roomId` | Detail |
| GET | `/app/rooms/:roomId/edit` | Edit form |
| POST | `/app/rooms/:roomId` | Update |

Facilities may deep-link with `?facility=<id>`. B2-10 facilities list links into the room workspace.

---

## RBAC

Inspected facility settings permissions; reused existing semantics (no new permission invented).

| Capability | Permission |
|------------|------------|
| **View rooms** | `activeclinic.facility.view` |
| **Manage rooms** (create / edit) | `activeclinic.facility.update` |

Rationale: rooms are physical configuration of a facility; `facility.update` already gates facility configuration writes. View stays on the broader `facility.view` context permission.

Nav entry for Rooms mirrors B2-10 management catalogue (requires `facility.update`) so receptionists with view-only facility context do not see a manage workspace they cannot use.

---

## Isolation

| Check | Behavior |
|-------|----------|
| Tenant | All ops scoped by authenticated `organizationId`; forged org IDs ignored/rejected |
| Facility | Facility must belong to authenticated org/HCO |
| Department | If supplied: same org + same facility; mismatch → `department_facility_mismatch` |
| Cross-tenant room ID | Lookup by org → not found |

**Occupancy:** **NOT** implemented. No IoT, scheduling engine, bed management, or invented “Current Use” backend. Stitch “Current Use” omitted or left empty unless backed by real future data.

---

## UI / Stitch mapping

| Surface | Stitch ID | Implementation |
|---------|-----------|----------------|
| Desktop | `b8f071b326234022afb3eecc665be9bc` | Table + filters + status badges + Add Room |
| Mobile 390px | `74a8167ce99e45388a7dd1fbe9a92a88` | Card list; existing 56px top / 64px bottom nav |

**Token remap (frozen V2.03 — no MD3 import):**

- Font: Inter (existing shell)
- Primary `#2563EB` / dark `#1D4ED8` / light `#EFF6FF`
- Text `#111827` / secondary `#6B7280`
- Border `#E5E7EB` / background `#F8FAFC` / surface `#FFFFFF`

Uses existing ActiveClinic staff shell, `ac-app` tokens, `gp-ops` filter/status patterns, buttons/forms. Shell asset bump: `SHELL_ASSET_VERSION` → `v2-03-acn27-01`.

Markers: `data-ac-stitch="ACN27"`, desktop/mobile screen IDs on list/form/detail.

---

## Intentional omissions

- Real-time occupancy / “Current Use” backend
- IoT, equipment inventory
- Room scheduling engine / resource booking
- Bed management / patient tracking
- New MD3 design system import
- Changes to B2-10 facility/department ownership routes

---

## Code map

| Layer | Path |
|-------|------|
| Migration | `db/migrations/activeclinic/040_facility_rooms.sql` |
| Repository | `src/activeclinic/repositories/facilityRoomRepository.js` |
| Service | `src/activeclinic/services/activeClinicFacilityRoomService.js` |
| HTTP | `src/activeclinic/http/activeClinicRoomRoutes.js` |
| Views | `views/activeclinic/app/rooms-list-content.ejs`, `room-form-content.ejs`, `room-detail-content.ejs` |
| CSS | `public/activeclinic/ac-app.css` (ACN27 section) |
| Nav | `src/activeclinic/services/activeClinicNavigation.js` |
| Tests | `tests/activeclinic-batch3-acn27-rooms.test.js` |

---

## Tests

Focused suite covers: CRUD, optional department, department/facility mismatch, forged org/facility rejection, duplicate code per facility, RBAC (receptionist cannot manage), route/Stitch markers, B2-10 non-collision.

Regression: Batch 1A, Batch 2 (incl. RBAC isolation + facilities), Batch 3 suites — see implementation return block for counts.

---

## Production / deploy

**Not pushed. Not deployed. Production untouched.**
**Testing DB only:** migration `040` applied after identity gate `moovex-platform-v7` / `testing`.
