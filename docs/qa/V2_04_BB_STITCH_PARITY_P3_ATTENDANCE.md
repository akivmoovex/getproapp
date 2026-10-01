# V2.04 BlessBoard — Stitch Parity P3 (Attendance A05–A07)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_STITCH_PARITY_P3_ATTENDANCE` |
| **Branch** | `V4` |
| **Date** | 2026-10-01 |
| **Mode** | Visual / responsive parity only (no attendance business-logic change) |
| **Stitch** | [BlessBoard Member Design Foundation](https://stitch.withgoogle.com/projects/12773983203917549893) |
| **Prior** | `docs/qa/V2_04_BB_STITCH_RECONCILIATION.md` · `docs/qa/V2_04_BB_STITCH_PARITY_P1.md` · `docs/qa/V2_04_BB_STITCH_PARITY_P2_MEMBER_PORTAL.md` |
| **Finish** | **`V2_04_BB_A05_A07_STITCH_PARITY_WITH_GAPS`** |

---

## Summary

A05–A07 remain on existing V4 routes and the shared `checkInManual` / `checkInQr` / `checkInPeak` → `validateAttendanceCheckIn` contract. Presentation was aligned to Stitch kiosk / 390 result / peak rapid UX using **real session, stats, and opaque QR token** data.

| Metric | Value |
|--------|------:|
| Screens in scope | 3 (A05, A06, A07) + shared A09 result partial |
| Attendance business logic changed | **No** |
| Demo `#TK-8492` / `742 / 950` hardcoded | **No** |
| Capacity shown | Only when application provides capacity (currently **none** — count + “present” only) |
| QR payload | Opaque signed session token via existing `issueSessionCheckInQr` + `qrcode` data-URL |
| Finish marker | **WITH_GAPS** (see residual gaps) |

### Stitch artifact coverage

| Suite | IDs | Form factor |
|-------|-----|-------------|
| `7939623a…` | A05 | Desktop large-screen kiosk |
| `c90491b5…` | A06, A07 (combined) | Mobile 390 |
| Embedded in suite | A09 result states | Via shared `check-in-result` partial |

---

## Changes (presentation)

### Routes (`attendanceCheckInAdminRoutes.js`)
- **A05:** Pass `stats` (`countCheckInsBySession`), `churchDisplayName` (shell), gathering date/time labels from session, `qrDataUrl` from opaque token, short `tokenRef` from jti fingerprint (never Stitch demo id), `kioskMode`.
- **A07:** Pass live `stats` + `recent` check-in rows for rapid log (read-only display).
- **`presentCheckInResult`:** Map existing service outcomes → Stitch titles/kinds:
  - success / on-time → `success` · “Check-In Confirmed!”
  - duplicate → `duplicate` · “Already Checked In Today”
  - late → `late` · “Late Arrival Logged”
  - session closed / not open / locked → `closed`
  - invalid / expired QR → `invalid` / `expired`
- No new validation codes or separate attendance engine.

### Templates
- `check-in-qr-display.ejs` — kiosk banner, context card, live headcount, large QR image, greeter token details
- `check-in-qr-member.ejs` — 390-first result + redeem form
- `check-in-peak.ejs` — search, 1-tap CTA, last-member brief, recent logs, next-member autofocus
- `partials/check-in-result.ejs` — compact state cards with Stitch-aligned chips

### CSS / shell
- `branch-admin.css` — A05 projector layout; A06/A07 390 density; A09 state tones
- Cache bump `branch-admin.css?v=v204-p3-1`
- `bb-ba-body--kiosk` hides branch chrome on A05 for large-screen readability

**Not changed:** check-in services, validation, permissions (`attendance.check_in`), token signing, DB schema, Manual/QR/Peak method contracts.

---

## Per-screen matrix

Legend: **PASS** = practical Stitch parity within available artifact · **GAP** = residual · **N/A** = not applicable

| ID | DESKTOP | MOBILE | CONTENT | LAYOUT | THEME | FUNCTIONAL | PARITY |
|----|---------|--------|---------|--------|-------|------------|--------|
| BB-A05 | PASS | N/A | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (no venue capacity field; no simulated headcount pulse/mesh node copy) |
| BB-A06 | RESP | PASS | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (staff redeem form remains; Stitch suite frames member-portal shell + state simulator) |
| BB-A07 | RESP | PASS | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (server post round-trip vs Stitch client 0.8s auto-reset theatre; no invented search engine) |
| BB-A09 (shared) | RESP | PASS | PASS | PASS | PASS | PASS | PASS (embedded states mapped from real codes only) |

---

## Hard constraints verified

| Constraint | Status |
|------------|--------|
| Do not alter attendance business logic | Pass |
| QR uses existing secure session-token implementation | Pass |
| Never copy Stitch `#TK-8492` | Pass |
| Never invent `742 / 950` unless from app data | Pass (count from `countCheckInsBySession`; no capacity denominator) |
| QR never exposes Church ID / phone / member PII | Pass (opaque token only) |
| Manual / QR / Peak share validation contract | Pass |
| No separate attendance engine for peak | Pass |

---

## Residual gaps (why WITH_GAPS)

1. **A05 capacity** — Session domain has no capacity field; Stitch shows `742 / 950`. V4 shows live count + “present” only.
2. **A05 hospitality chrome** — Stitch footer mesh-node / greeter-channel copy is demo theatre; not product data.
3. **A06 surface role** — Stitch suite is member-portal confirmation chassis with state toggle; V4 is authenticated staff redeem + result (same engine, different operator shell).
4. **A07 latency theatre** — Stitch simulates instant client reset; V4 correctly re-renders after shared service POST (permissions + CSRF preserved).

---

## Regression tests

Run (attendance + related RBAC/tenant guards in these suites):

```bash
node --test \
  tests/v2-04-bb-attendance-checkin.test.js \
  tests/v2-04-bb-attendance-domain.test.js \
  tests/v2-04-bb-attendance-session-ops.test.js \
  tests/v2-04-bb-attendance-correction.test.js \
  tests/blessboard-attendance.test.js \
  tests/v2-04-bb-request-admin.test.js
```

### Execution notes (2026-10-01)

| Suite set | Result |
|-----------|--------|
| Attendance check-in / domain / session-ops / correction + legacy attendance + request-admin cache bump | **57 pass / 0 fail / 0 skip** |

---

## Finish

**`V2_04_BB_A05_A07_STITCH_PARITY_WITH_GAPS`**

Scope complete for P3 presentation parity under hard constraints. Residual gaps are documentation-only (capacity field absence, Stitch demo theatre, staff vs portal shell for A06).
