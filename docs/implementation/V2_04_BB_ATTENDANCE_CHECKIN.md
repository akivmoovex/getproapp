# V2.04 BB Stitch — Phase 8 Attendance Check-In

| Field | Value |
|-------|--------|
| **Phase** | 8 — ATTENDANCE CHECK-IN |
| **Branch** | `V4` |
| **Stitch project** | `projects/12773983203917549893` |
| **Screens requested** | BB-A04, BB-A05, BB-A06, BB-A07, BB-A08, BB-A09 |
| **Result** | **BB_V204_ATTENDANCE_CHECKIN_BLOCKED** |

---

## Stitch availability

| Screen | Stitch status | Action |
|--------|---------------|--------|
| **BB-A04** Manual Check-In | COMPLETED (`e14603722a2f4f7f94ba8a191a2ab0c1`) desktop | Implemented |
| **BB-A05** Attendance QR Display | **MISSING** | Functional kiosk token display |
| **BB-A06** Member QR Check-In | **MISSING** | Functional redeem form |
| **BB-A07** Peak Check-In | **MISSING** | Functional fast desk flow |
| **BB-A08** Live Attendance Roster | **MISSING** | Functional roster table |
| **BB-A09** Attendance Warning/Exception | **MISSING** | Shared result partial (duplicate/late/wrong-branch/error) |

Confirmed via Stitch `list_screens`: only A01–A04 exist among attendance screens. **Exact Stitch parity (and exact Stitch mobile behavior) for A05–A09 is blocked.** A04 has no Stitch mobile frame — responsive from desktop.

---

## Delivered

### One validation/service path

`checkInManual` / `checkInQr` / `checkInPeak` → `validateAttendanceCheckIn` only.

| Rule | Behavior |
|------|----------|
| Session open | Required; closed/locked/draft rejected |
| Member | Active membership required |
| Duplicate | Return existing; **no second insert** |
| Wrong branch | Warning + record home + attendance branch (default policy) |
| Late | Record as late; **do not reject** |
| Authorization | `attendance.check_in` |
| QR | Signed/time-limited; no Church ID / phone / member PII |

### Routes

| Route | Screen |
|-------|--------|
| `GET/POST …/sessions/:id/check-in` | A04 |
| `GET …/sessions/:id/qr` | A05 |
| `GET/POST …/sessions/:id/qr/check-in` | A06 |
| `GET/POST …/sessions/:id/peak` | A07 |
| `GET …/sessions/:id/roster` | A08 |
| Result partial on check-in responses | A09 |

### Artifacts

- `src/blessboard/repositories/attendanceCheckInRepository.js`
- `src/blessboard/http/attendanceCheckInAdminRoutes.js`
- Templates under `views/blessboard/v5/attendance/check-in-*.ejs` + `partials/check-in-result.ejs`
- Mounted in `v5FoundationServer.js`
- CSS `?v=v204-a04-1`

Offline sync **not** implemented.

---

## Blockers

1. **BB-A05–A09 missing from Stitch** — cannot claim exact visual/mobile parity.
2. **BB-A04 has no Stitch mobile** — responsive approximation only.
3. Full QR camera / kiosk scanner hardware UX not in Stitch — token paste/display only.

---

## Tests

`node --test tests/v2-04-bb-attendance-checkin.test.js tests/v2-04-bb-attendance-domain.test.js`

Covers: shared engine for MANUAL/QR/PEAK, duplicate, wrong-branch + late, session-not-open, QR opacity, RBAC, Stitch/route markers.

---

BB_V204_ATTENDANCE_CHECKIN_BLOCKED
