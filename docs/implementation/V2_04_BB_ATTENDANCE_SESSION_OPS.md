# V2.04 BB Stitch — Phase 7 Attendance Session Operations

| Field | Value |
|-------|--------|
| **Phase** | 7 — ATTENDANCE SESSION OPERATIONS |
| **Branch** | `V4` |
| **Stitch project** | `projects/12773983203917549893` |
| **Screens requested** | BB-A01, BB-A02, BB-A03, BB-A10, BB-A11 |
| **Result** | **BB_V204_ATTENDANCE_SESSION_BLOCKED** |

---

## Stitch availability

| Screen | Stitch status | Action |
|--------|---------------|--------|
| **BB-A01** Attendance Sessions | COMPLETED (`7102d694cef5496e8d5b0f941ee545ee`) | Implemented |
| **BB-A02** Create Attendance Session | COMPLETED (`d4b24ec7d4f944afa5ec89bcf0983391`) | Implemented |
| **BB-A03** Open Session Dashboard | COMPLETED (`81d1cfbd65b04e0da93068bcf2d452fd`) | Implemented |
| **BB-A10** Close Session | **MISSING** from Stitch project | Functional close confirm only |
| **BB-A11** Locked Session Summary | **MISSING** from Stitch project | Functional locked dashboard state only |
| BB-A04 Manual Check-In | COMPLETED (out of Phase 7 scope) | Not implemented this phase |

Exact Stitch parity for **A10/A11 is blocked** — those screens are not present in the V2.04 Stitch project (confirmed via `list_screens`).

---

## Delivered (functional + A01–A03 Stitch)

### Routes (additive — aggregate `/branch-admin/attendance` preserved)

| Route | Screen | Gate |
|-------|--------|------|
| `GET /branch-admin/attendance/sessions` | A01 | `attendance.view` |
| `GET/POST /branch-admin/attendance/sessions/new` | A02 | `attendance.manage_session` |
| `GET /branch-admin/attendance/sessions/:id` | A03 / closed / A11 | `attendance.view` |
| `GET /branch-admin/attendance/sessions/:id/close` | A10 (functional) | `attendance.manage_session` |
| `POST /branch-admin/attendance/sessions/:id/transition` | open / close / lock | `attendance.manage_session` |

### Session model

- Fields: organization, church, branch, service/event, date, start time, late threshold, status
- States: `draft` → `open` → `closed` → `locked`
- Tenant + branch scoped on list/get/transition
- Normal check-in only while `open` (domain validation)
- Close stops normal check-in; lock protects final session
- Corrections remain separate (`attendance.correct`) — not on these screens
- Offline sync **not** implemented

### UI

- `views/blessboard/v5/attendance/sessions.ejs` (A01)
- `views/blessboard/v5/attendance/session-new.ejs` (A02)
- `views/blessboard/v5/attendance/session-dashboard.ejs` (A03 + closed + locked summary)
- `views/blessboard/v5/attendance/session-close.ejs` (A10 functional)
- CSS under `.bb-v204-a01` / `a02` / `a03` / `a10` in `branch-admin.css` (`?v=v204-a01-1`)

### Backend

- `attendanceSessionRepository.js` — DB store + check-in counts/recent
- `attendanceSessionService.js` — list/get + branch mismatch guards
- `attendanceSessionAdminRoutes.js` — HTTP + CSRF
- Mounted in `v5FoundationServer.js`

---

## Blockers

1. **BB-A10 / BB-A11 Stitch screens missing** — cannot claim exact visual parity.
2. No dedicated Stitch mobile frames for A01–A03 — responsive from desktop.
3. Manual / Peak check-in UI (A04) deferred to later phase; dashboard CTAs present but disabled where not shipped.

---

## Tests

`node --test tests/v2-04-bb-attendance-session-ops.test.js tests/v2-04-bb-attendance-domain.test.js`

Coverage: state transitions, invalid transitions, RBAC, tenant/branch isolation, check-in only when OPEN, Stitch/route markers.

---

BB_V204_ATTENDANCE_SESSION_BLOCKED
