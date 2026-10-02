# V2.04 BlessBoard Stitch — Screen Map (Phase 0 Audit)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_STITCH_SCREEN_MAP` |
| **Phase** | 0 — AUDIT + MAP ONLY |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **Stitch project** | [BlessBoard Member Design Foundation](https://stitch.withgoogle.com/projects/12773983203917549893) |
| **Project ID** | `projects/12773983203917549893` |
| **Product** | `blessboard` only (do not import ActiveClinic) |
| **Canonical church Stitch (legacy)** | `projects/17124191473876947591` — preserve existing V5 parity maps; this V2.04 project is the **new** member/attendance/request design authority |

**Rules applied:** Stitch is visual/text/layout authority for completed screens. No redesign. No implementation in this phase. Reuse platform infrastructure; BB semantics stay in BB. No BB/AC token merge. No production touch.

**STITCH_STATUS legend:** `COMPLETED` = screen has HTML (+ screenshot where present). `REFERENCE` = design-system markdown, not a product route.

---

## Executive summary

| Category | Count / notes |
|----------|----------------|
| Screens in project | **17** |
| Completed product screens | **16** (desktop/mobile pairs counted separately) |
| Design-system reference | **1** |
| Desktop-only (no Stitch mobile pair) | **M01–M06, A01–A04, R03, R04** |
| Explicit mobile Stitch pairs | **R01, R02** |
| Backend domain ready (V2.04) | Member domain, staff person workflow, attendance sessions, join/approval workflow |
| HTTP/UI wiring gaps | Staff Add Member routes, session check-in routes, join-approval inbox (vs pastoral forms-requests) |

---

## Completed screen map

### Members (BB-M*)

#### BB-M01 — Members Directory

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `2b8333d5e64242bc9cde22dac5aacc3c` |
| **SCREEN_NAME** | BB-M01 Members Directory |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | `/branch-admin/members` (primary); `/hq/members` (HQ oversight variant) |
| **EXISTING_ROUTE** | `/branch-admin/members`, `/hq/members` |
| **TARGET_TEMPLATE** | `views/blessboard/v5/branch-admin/members.ejs`, `views/blessboard/v5/hq/members.ejs` |
| **REUSE_COMPONENTS** | Branch/HQ shells; existing search/status filters; `bb-ba-chip-*` status chips |
| **BACKEND_READY** | **YES** |
| **MISSING_BACKEND** | — |
| **MOBILE_REQUIRED** | YES (no Stitch mobile; implement responsive from desktop) |
| **IMPLEMENTATION_ACTION** | **RESTYLE** |

#### BB-M02 — Add Member

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `b31eebc2a7d944ed949e4032a01d8519` |
| **SCREEN_NAME** | BB-M02 Add Member |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | `/branch-admin/members/new` (proposed); HQ optional `/hq/members/new` |
| **EXISTING_ROUTE** | **None** for staff Add Member UI (domain: `createStaffManagedMember`) |
| **TARGET_TEMPLATE** | New under `views/blessboard/v5/members/` or extend branch-admin (do not invent outside Stitch) |
| **REUSE_COMPONENTS** | Shell; `views/platform/partials/phone-field.ejs`; form validation patterns |
| **BACKEND_READY** | **YES** (domain + staff person workflow) |
| **MISSING_BACKEND** | HTTP route + CSRF form POST wiring |
| **MOBILE_REQUIRED** | YES (no Stitch mobile) |
| **IMPLEMENTATION_ACTION** | **NEW** (route/template); reuse backend |

#### BB-M03 — Possible Member Match

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `dcd7f88a977a4e63bab8327b32c1206a` |
| **SCREEN_NAME** | BB-M03 Possible Member Match |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | Overlay/step on Add Member (`/branch-admin/members/new` match step) |
| **EXISTING_ROUTE** | None (duplicate engine returns matches; no dedicated UI) |
| **TARGET_TEMPLATE** | Partial/modal included from Add Member flow |
| **REUSE_COMPONENTS** | Confirmation modal pattern; status chips; platform ops empty states if generic |
| **BACKEND_READY** | **YES** (shared duplicate engine + BB policy) |
| **MISSING_BACKEND** | Presentation adapter wiring in HTTP layer |
| **MOBILE_REQUIRED** | YES |
| **IMPLEMENTATION_ACTION** | **NEW** (UI); reuse match engine |

#### BB-M04 — Review New Member

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `6e22944ed9ab450a9ce51370f0acd9e0` |
| **SCREEN_NAME** | BB-M04 Review New Member |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | Confirm step before create, or `/branch-admin/members/new/review` |
| **EXISTING_ROUTE** | Related: `/branch-admin/membership` registration review (different intake) — **preserve**, do not replace |
| **TARGET_TEMPLATE** | New step in Add Member flow |
| **REUSE_COMPONENTS** | Shell; read-only field summary; confirm CTA |
| **BACKEND_READY** | **YES** |
| **MISSING_BACKEND** | — |
| **MOBILE_REQUIRED** | YES |
| **IMPLEMENTATION_ACTION** | **NEW** (flow step) |

#### BB-M05 — Member Created

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `0ef251628eb0495699eda17db921f50b` |
| **SCREEN_NAME** | BB-M05 Member Created |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | Success state after create → `/branch-admin/members/:id?created=1` or dedicated success view |
| **EXISTING_ROUTE** | Member detail exists; no dedicated “created” success chrome |
| **TARGET_TEMPLATE** | Detail with success banner, or thin success partial |
| **REUSE_COMPONENTS** | Shell; status chips (membership vs portal) |
| **BACKEND_READY** | **YES** |
| **MISSING_BACKEND** | — |
| **MOBILE_REQUIRED** | YES |
| **IMPLEMENTATION_ACTION** | **EXTEND** member detail / **NEW** success partial |

#### BB-M06 — Member Admin Profile

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `7ddcd294a1514304a449e5f8a4acbc4c` |
| **SCREEN_NAME** | BB-M06 Member Admin Profile |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | `/branch-admin/members/:id`, `/hq/members/:id` |
| **EXISTING_ROUTE** | Same |
| **TARGET_TEMPLATE** | `branch-admin/member-detail.ejs`, `hq/member-detail.ejs` |
| **REUSE_COMPONENTS** | Shell; existing edit/transfer membership workflow posts |
| **BACKEND_READY** | **YES** (domain profile + portal separation; Church ID manage permission) |
| **MISSING_BACKEND** | — (Phase 4 UI wired) |
| **MOBILE_REQUIRED** | YES |
| **IMPLEMENTATION_ACTION** | **RESTYLE** / **EXTEND** — see `V2_04_BB_MEMBER_ADMIN_PROFILE.md` (M06–M12) |

---

### Attendance sessions (BB-A*)

> **Preserve** aggregate headcount attendance at `/branch-admin/attendance` and `/hq/attendance` (`attendance/admin-*.ejs`). V2.04 session check-in is additive — do not replace aggregate reporting.

#### BB-A01 — Attendance Sessions

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `7102d694cef5496e8d5b0f941ee545ee` |
| **SCREEN_NAME** | BB-A01 — Attendance Sessions |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | `/branch-admin/attendance/sessions` (proposed; keep aggregate list at `/branch-admin/attendance`) |
| **EXISTING_ROUTE** | Aggregate list only (`/branch-admin/attendance`) |
| **TARGET_TEMPLATE** | New session list template (do not overwrite `attendance/admin-list.ejs` semantics) |
| **REUSE_COMPONENTS** | Shell; status chips; filter bar patterns (`gp-ops-filter-bar` candidate) |
| **BACKEND_READY** | **YES** (session domain service) |
| **MISSING_BACKEND** | HTTP list/create/transition routes |
| **MOBILE_REQUIRED** | YES |
| **IMPLEMENTATION_ACTION** | **NEW** |

#### BB-A02 — Create Attendance Session

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `d4b24ec7d4f944afa5ec89bcf0983391` |
| **SCREEN_NAME** | BB-A02 — Create Attendance Session |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | `/branch-admin/attendance/sessions/new` |
| **EXISTING_ROUTE** | Aggregate `/attendance/new` only |
| **TARGET_TEMPLATE** | New session create form |
| **REUSE_COMPONENTS** | Shell; form controls; platform date/time patterns |
| **BACKEND_READY** | **YES** (`createAttendanceSession`) |
| **MISSING_BACKEND** | HTTP POST |
| **MOBILE_REQUIRED** | YES |
| **IMPLEMENTATION_ACTION** | **NEW** |

#### BB-A03 — Open Session Dashboard

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `81d1cfbd65b04e0da93068bcf2d452fd` |
| **SCREEN_NAME** | BB-A03 — Open Session Dashboard |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | `/branch-admin/attendance/sessions/:id` |
| **EXISTING_ROUTE** | None (session-specific) |
| **TARGET_TEMPLATE** | New session dashboard |
| **REUSE_COMPONENTS** | Shell; live list; QR display area (opaque token — no PII) |
| **BACKEND_READY** | **YES** |
| **MISSING_BACKEND** | HTTP + QR issue endpoint |
| **MOBILE_REQUIRED** | YES |
| **IMPLEMENTATION_ACTION** | **NEW** |

#### BB-A04 — Manual Check-In

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `e14603722a2f4f7f94ba8a191a2ab0c1` |
| **SCREEN_NAME** | BB-A04 — Manual Check-In |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | `/branch-admin/attendance/sessions/:id/check-in` |
| **EXISTING_ROUTE** | None on V5 (legacy church check-in is separate stack — do not revive as V5 default) |
| **TARGET_TEMPLATE** | New check-in UI |
| **REUSE_COMPONENTS** | Member search; duplicate/existing attendance result toast; late/wrong-branch metadata chips |
| **BACKEND_READY** | **YES** (`checkInManual` / shared validation; QR/PEAK same engine) |
| **MISSING_BACKEND** | HTTP |
| **MOBILE_REQUIRED** | YES |
| **IMPLEMENTATION_ACTION** | **NEW** |

---

### Requests / join approval (BB-R*)

> **Preserve** pastoral/forms inbox at `/branch-admin/requests` (`forms-requests/admin-*.ejs`) — different product semantics from ministry/department join approval.

#### BB-R01 — Requests Inbox

| Field | Value |
|-------|--------|
| **SCREEN_ID** | Desktop `ff1bcec5a0274ca88ad46d2e889b80e8` · Mobile `bb1a2125b67f45d28eb18c1f43132dbd` |
| **SCREEN_NAME** | BB-R01 — Requests Inbox |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP + MOBILE |
| **TARGET_ROUTE** | `/branch-admin/join-requests` (proposed) or scoped under participation |
| **EXISTING_ROUTE** | Partial: `/branch-admin/participation` ministry membership review; pastoral `/branch-admin/requests` |
| **TARGET_TEMPLATE** | New join-request inbox (do not overwrite pastoral `admin-requests.ejs`) |
| **REUSE_COMPONENTS** | Shell; status tabs; filter bar |
| **BACKEND_READY** | **YES** (platform approval + BB join adapter) |
| **MISSING_BACKEND** | Dedicated list HTTP for pending join requests |
| **MOBILE_REQUIRED** | YES — **Stitch mobile present** |
| **IMPLEMENTATION_ACTION** | **NEW** / **EXTEND** participation admin |

#### BB-R02 — Request Review

| Field | Value |
|-------|--------|
| **SCREEN_ID** | Desktop `79b654c9af18411a839a07c616e39e86` · Mobile `f8c014f3282549f1939920a39e2c382b` |
| **SCREEN_NAME** | BB-R02 — Request Review |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP + MOBILE |
| **TARGET_ROUTE** | `/branch-admin/join-requests/:id` |
| **EXISTING_ROUTE** | `POST …/ministries/memberships/:id/review` (no dedicated Stitch review page) |
| **TARGET_TEMPLATE** | New review detail |
| **REUSE_COMPONENTS** | Shell; confirm modal; history/timeline candidate |
| **BACKEND_READY** | **YES** (`reviewJoinRequest`) |
| **MISSING_BACKEND** | GET detail route |
| **MOBILE_REQUIRED** | YES — **Stitch mobile present** |
| **IMPLEMENTATION_ACTION** | **NEW** / **EXTEND** |

#### BB-R03 — Request Decision

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `ddc98054601e4362ad7e1f051efa83bb` |
| **SCREEN_NAME** | BB-R03 — Request Decision |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | Decision confirmation step / result on review |
| **EXISTING_ROUTE** | None dedicated |
| **TARGET_TEMPLATE** | Partial on R02 or success state |
| **REUSE_COMPONENTS** | Confirmation modal; status chips |
| **BACKEND_READY** | **YES** |
| **MISSING_BACKEND** | — |
| **MOBILE_REQUIRED** | YES (no Stitch mobile) |
| **IMPLEMENTATION_ACTION** | **NEW** |

#### BB-R04 — Ministry Members & Pending Requests

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `fe42f3a5c09146738394018a7b78f6bf` |
| **SCREEN_NAME** | BB-R04 — Ministry Members & Pending Requests |
| **STITCH_STATUS** | COMPLETED |
| **DEVICE** | DESKTOP |
| **TARGET_ROUTE** | `/branch-admin/participation` ministry detail / pending tab |
| **EXISTING_ROUTE** | `/branch-admin/participation` (`participation/admin-overview.ejs`) |
| **TARGET_TEMPLATE** | EXTEND participation admin; resource-scoped leader view |
| **REUSE_COMPONENTS** | Shell; member list; pending chips |
| **BACKEND_READY** | **YES** (memberships + join requests; resource scope helper) |
| **MISSING_BACKEND** | Leader-scoped managed-ministry filter in HTTP |
| **MOBILE_REQUIRED** | YES |
| **IMPLEMENTATION_ACTION** | **EXTEND** |

---

### Design system reference

| Field | Value |
|-------|--------|
| **SCREEN_ID** | `72fac6e355334285a52ab6299b6ec993` |
| **SCREEN_NAME** | BlessBoard V2.04 Design System Foundation |
| **STITCH_STATUS** | **REFERENCE** (markdown; no product screenshot) |
| **TARGET_ROUTE** | N/A — tokens/CSS only |
| **EXISTING_ROUTE** | `public/blessboard/v5/*`, Sacred Modernity in church/platform CSS |
| **IMPLEMENTATION_ACTION** | **REUSE** / align tokens — **do not** invent a parallel design system; **do not** merge AC tokens |

---

## Shared platform UI candidates

Eligible for **generic** platform partials (no BB domain copy, no church/clinical wording):

| Candidate | Existing platform starting point | Notes |
|-----------|----------------------------------|--------|
| Form controls / phone field | `views/platform/partials/phone-field.ejs` | Reuse |
| Status chips (generic) | `gp-ops-status-badge.ejs` | Product supplies labels |
| Search / filter bar | `gp-ops-filter-bar.ejs`, `gp-ops-status-tabs.ejs` | Reuse |
| Validation summary | Platform form patterns | Keep messages product-owned |
| Duplicate warning panel | **None shared yet** | Platform-shaped empty shell; BB/AC inject match presentation |
| Confirmation modal | Website engine lifecycle dialogs (pattern only) | Extract carefully; no website copy |
| History / audit timeline | `gp-ops-timeline.ejs` | Reuse structure |
| Empty / loading / error | `gp-ops-empty-state.ejs` | Reuse |

**Must stay BB-local:** Church ID, membership/portal labels, ministry join copy, attendance session wording, Sacred Modernity brand chrome, pastoral request categories.

---

## Roll-up lists

### Completed screens (implementable)

M01–M06, A01–A04, R01–R04 (16 Stitch product screens including mobile pairs for R01/R02).

### Ready to implement (desktop-first)

| Priority | Screens | Why ready |
|----------|---------|-----------|
| 1 | M01, M06 | Routes + templates exist → RESTYLE/EXTEND |
| 2 | M02–M05 | Backend ready; need NEW HTTP/UI |
| 3 | R01–R04 | Backend ready; need inbox/review UI (preserve pastoral requests) |
| 4 | A01–A04 | Backend ready; need NEW session routes (preserve aggregate attendance) |

### Blocked / deferred (not hard-stop for desktop)

| Item | Reason |
|------|--------|
| Mobile Stitch for M* / A* / R03 / R04 | Missing dedicated mobile frames — implement responsive from desktop; verify later if Stitch adds mobile |
| Session attendance HTTP | Domain ready; routes not mounted |
| Staff Add Member HTTP | Domain ready; route not mounted |
| Design system screen | Reference only — not a route |

### Existing screens to preserve

| Existing | Why preserve |
|----------|----------------|
| `/branch-admin/attendance` aggregate | Headcount reporting still valid |
| `/hq/attendance`, `/hq/reports/attendance` | HQ analytics |
| `/branch-admin/requests` pastoral/forms | Different request type |
| `/branch-admin/membership` intake/review | Registration workflow ≠ staff Add Member |
| `/member/*` portal | Member self-service, not staff Add Member |
| Legacy church check-in (`views/church/...`) | Do not revive as V5 default |

### Shared components to reuse

Platform: phone field, ops filter/tabs/table/empty/timeline/status badge.  
BB: HQ/branch/member shells, existing chips, participation admin review POST.

### Recommended implementation order

1. Align V2.04 design tokens with existing BlessBoard CSS (REFERENCE screen) — no AC token merge.  
2. **M01** Members Directory restyle.  
3. **M06** Member Admin Profile extend (membership vs portal).  
4. **M02 → M03 → M04 → M05** Add Member flow (duplicate + confirm).  
5. **R04 → R01 → R02 → R03** Ministry pending + join-request inbox/review/decision.  
6. **A01 → A02 → A03 → A04** Session attendance (leave aggregate routes intact).  
7. Responsive pass for screens lacking mobile Stitch.

---

## Isolation note

This project (`12773983203917549893`) is **BlessBoard Member Design Foundation**. It is **not** ActiveClinic and is distinct from legacy GetPro Church Platform (`17124191473876947591`). Update `docs/stitch-project-map.md` in a later docs pass if product wants this ID registered permanently — not required for this audit.

---

BB_V204_STITCH_MAPPING_COMPLETE
