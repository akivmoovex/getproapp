# V2.04 BB Stitch — Phase 9 Attendance Correction + Audit

| Field | Value |
|-------|--------|
| **Phase** | 9 — ATTENDANCE CORRECTION + AUDIT |
| **Branch** | `V4` |
| **Stitch project** | `projects/12773983203917549893` |
| **Screens requested** | BB-A12, BB-A13, BB-A14 |
| **Result** | **BB_V204_ATTENDANCE_CORRECTION_BLOCKED** |

---

## Stitch availability

| Screen | Stitch status | Action |
|--------|---------------|--------|
| **BB-A12** Correct Attendance | **MISSING** | Functional correction form |
| **BB-A13** Correction Confirmation | **MISSING** | Functional confirmation |
| **BB-A14** Attendance History/Audit | **MISSING** | Functional audit timeline + table |

Confirmed via Stitch `list_screens`: no A12–A14 screens exist. **Exact Stitch parity is blocked.**

---

## Delivered (functional)

### Rules enforced

| Rule | Implementation |
|------|----------------|
| Never silent overwrite | Correction requires original + corrected + reason; original mismatch rejected |
| Permission | `attendance.correct` at **route gate** and **service** |
| Actor + timestamp + reason | Stored on `attendance_corrections` + platform audit `attendance.correct` |
| Preserve method/time | `sanitizeCorrectedValue` strips method/checkedInAt; `applyCorrection` SQL never updates those columns |
| Locked session | Corrections denied |

### Routes

| Route | Screen | Gate |
|-------|--------|------|
| `GET/POST …/sessions/:id/check-ins/:checkInId/correct` | A12 | `attendance.correct` |
| `GET …/sessions/:id/check-ins/:checkInId/correction/:correctionId` | A13 | `attendance.correct` |
| `GET …/sessions/:id/audit` | A14 | `attendance.view` |

Unauthorized users fail at route/service — not merely a hidden button.

### Artifacts

- Hardened `attendanceCorrectionService.js`
- Correction persistence via `attendanceCheckInRepository` (`createDbCorrectionStore`, `applyCheckInCorrection`)
- `attendanceCorrectionAdminRoutes.js` mounted in `v5FoundationServer.js`
- Templates: `correction-form.ejs`, `correction-confirmed.ejs`, `correction-audit.ejs`
- CSS `?v=v204-a12-1`

---

## Blockers

1. **BB-A12 / A13 / A14 missing from Stitch** — cannot claim exact visual parity.
2. No Stitch mobile frames for correction flows.

---

## Tests

`node --test tests/v2-04-bb-attendance-correction.test.js tests/v2-04-bb-attendance-domain.test.js`

---

BB_V204_ATTENDANCE_CORRECTION_BLOCKED
