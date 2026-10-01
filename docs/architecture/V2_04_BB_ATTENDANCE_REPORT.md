# V2.04 — BlessBoard Attendance Domain Foundation

## Phase 6 Implementation Report

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_ATTENDANCE_REPORT` |
| **Phase** | 6 — ATTENDANCE DOMAIN FOUNDATION |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **UI / Stitch** | **Not implemented** |
| **Offline sync** | **Not implemented** (boundary reserved) |

---

## 1. Model

Attendance is **session-based** (additive to V5 aggregate `attendance_events` / `attendance_entries`).

### Session states

| State | Meaning |
|-------|---------|
| `draft` | Prepared; no check-ins |
| `open` | Accepts check-ins |
| `closed` | No new check-ins; corrections allowed |
| `locked` | Immutable; corrections denied |

Transitions: `draft → open → closed → locked`.

### Session fields

- organization, church, branch
- service/event reference (`service_event_ref` / optional link to aggregate event)
- date, start time, late threshold (minutes)
- status, wrong-branch policy

---

## 2. Check-in methods (one validation engine)

| Method | Entry |
|--------|--------|
| `manual` | `checkInManual` |
| `qr` | `checkInQr` |
| `peak` | `checkInPeak` |

**All** call `validateAttendanceCheckIn` — no method-specific bypass of eligibility, session, duplicate, branch, or late rules.

---

## 3. Validation rules

| Case | Behavior |
|------|----------|
| Valid member | `status = active` required |
| Duplicate | Return **existing** attendance (`duplicate: true`); do not insert second row |
| Wrong branch | Record `membership_branch_id` + `attendance_branch_id`; apply church policy |
| Late arrival | Record `late_arrival` / status `late` — **do not reject** |
| Closed / locked / draft | Reject check-in |
| Invalid / expired QR | Reject |
| Unauthorized staff | Require `attendance.check_in` |

### Wrong-branch policy (default: do not auto-reject)

| Policy | Outcome |
|--------|---------|
| `record` (default) | Accept; flag `wrong_branch` |
| `require_review` | Accept; `needs_review` |
| `deny` | Reject (`wrong_branch`) — church opt-in only |

---

## 4. QR

- Signed, time-limited opaque token (`HMAC-SHA256`).
- Payload: version, jti, kind, **session id**, expiry — **no** Church ID, phone, member number, name, or email.
- Member binding (claim tokens) stored **server-side** via `token_hash → member_id`.

---

## 5. Corrections

Require: permission (`attendance.correct`), original value, corrected value, actor, timestamp, reason.  
Audited as `attendance.correct`. Blocked when session is `locked`.

---

## 6. Offline

Complex offline sync **not** implemented.

Reserved:

- Table `blessboard.attendance_offline_ingest_boundary`
- Module `attendanceOfflineBoundary.js` (`enqueueOfflineAttendanceIngest` → `offline_sync_not_implemented`)
- Future sync **must** re-authorize and call `validateAttendanceCheckIn`

---

## 7. Artifacts

| Path | Role |
|------|------|
| `db/migrations/blessboard/121_attendance_session_domain_v204.sql` | Sessions, check-ins, tokens, corrections, offline boundary, RBAC |
| `src/blessboard/services/attendance/*` | Domain services |
| `tests/v2-04-bb-attendance-domain.test.js` | Foundation suite |

Permissions added: `attendance.check_in`, `attendance.correct`, `attendance.manage_session` (plus existing `attendance.view` / `attendance.record`).

Aggregate headcount attendance (023) **retained** — not dropped or replaced.

---

## 8. Tests

- Session lifecycle + locked immutability
- QR opacity (no PII)
- MANUAL + QR + PEAK through **same** validation engine
- Duplicate → existing
- Wrong branch record / review / deny
- Late as metadata
- Closed session / unauthorized / invalid+expired QR
- Corrections + audit fields
- Offline deferral + migration coexistence

Evidence: **14 pass / 0 fail**.

---

## 9. Explicit non-goals

- No final Stitch attendance screens
- No offline queue reconciliation
- No replacement of aggregate `attendance_events` reporting
- No production migration apply / deploy

---

PHASE6_BB_ATTENDANCE_FOUNDATION_PASS
