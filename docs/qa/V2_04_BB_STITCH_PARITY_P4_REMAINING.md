# V2.04 BlessBoard — Stitch Parity P4 (Remaining Screens)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_STITCH_PARITY_P4_REMAINING` |
| **Branch** | `V4` |
| **Date** | 2026-10-01 |
| **Mode** | Smallest visual/mobile corrections only (no business-logic changes) |
| **Stitch** | [BlessBoard Member Design Foundation](https://stitch.withgoogle.com/projects/12773983203917549893) |
| **Prior** | Reconciliation · P1 · P2 · P3 |
| **Finish** | **`V2_04_BB_REMAINING_STITCH_PARITY_WITH_GAPS`** |

---

## Recalculated baseline (CURRENT code entering P4)

Do **not** reuse the original reconciliation MAJOR=18 list blindly. After P1 theme + P2 portal + P3 attendance:

| Bucket | Count | Notes |
|--------|------:|-------|
| **PARITY_PASS** | **9** | P2 full PASS: M15–M17, M19, M21–M22, M25, M27 · P3: A09 |
| **PARITY_MINOR_GAPS** | **36** | Recon 27 − A09 + P2 residuals (M13/14/18/20/23/24/26) + P3 residuals (A05–A07) |
| **PARITY_MAJOR_GAPS** | **0** | Former majors addressed in P2/P3 (PASS or WITH_GAPS → counted as minor residual) |
| **MOBILE_GAPS** | **9** | Residual WITH_GAPS mobiles: M13, M14, M18, M20, M23, M24, M26, A06, A07 |
| **MOBILE_PASS** | **35** | Includes RESP structural + P2/P3 mobile PASS |
| **MOBILE_N/A** | **1** | A05 kiosk |

`9 + 36 + 0 = 45` · `35 + 9 + 1 = 45`

### Attention set (user + reconciliation)

```
BB-M01, BB-M02, BB-M03, BB-M06,
BB-A03, BB-A04, BB-A08, BB-A09, BB-A12
```

These were **MINOR** (theme/density/demo chrome), not MAJOR. Mobile was RESP/PASS structurally; P4 tightens 390 density without inventing standalone templates for tabs/modals/drawers (M06 tabs remain in-page anchors; A11 stays embedded on A03).

---

## Changes

### Templates
- `session-dashboard.ejs` (A03) — QR panel prioritizes **Open QR Display** kiosk CTA; raw token under greeter `<details>`
- `check-in-roster.ejs` (A08) — desktop table + mobile card list (`data-bb-a08-cards`)

### CSS / shell
- `branch-admin.css` — mobile polish for M01 chips/filters/cards; M02/M03 full-width CTAs; M06 hero/tabs/actions; A03 toolbar/stats/stream/QR; A04 search stack; A08 cards; A09 single-column compact; A12 dl stack
- Cache bump `branch-admin.css?v=v204-p4-1`

### Tests
- A08 cards + p4 cache assertions (check-in suite)
- A03 Open QR Display marker (session-ops)
- Request-admin shell cache assertion → `v204-p4-1`

**Not changed:** routes, services, validation, RBAC, migrations, member/portal/auth engines.

---

## Reported metrics

| Metric | Value |
|--------|------:|
| **PARITY_BEFORE** | PASS **9** · MINOR **36** · MAJOR **0** |
| **PARITY_AFTER** | PASS **17** · MINOR **28** · MAJOR **0** |
| **MOBILE_GAPS_BEFORE** | **9** |
| **MOBILE_GAPS_AFTER** | **9** |
| **FILES_CHANGED** | 7 |
| **TEST_CASES** | **67** |
| **PASS** | **67** |
| **FAIL** | **0** |
| **SKIP** | **0** |

### FILES_CHANGED

```
public/blessboard/v5/branch-admin.css
views/blessboard/v5/partials/branch-admin-shell-start.ejs
views/blessboard/v5/attendance/session-dashboard.ejs
views/blessboard/v5/attendance/check-in-roster.ejs
tests/v2-04-bb-attendance-checkin.test.js
tests/v2-04-bb-attendance-session-ops.test.js
tests/v2-04-bb-request-admin.test.js
docs/qa/V2_04_BB_STITCH_PARITY_P4_REMAINING.md
```

### Parity deltas (promoted MINOR → PASS)

```
BB-M01, BB-M02, BB-M03, BB-M06,
BB-A03, BB-A04, BB-A08, BB-A12
```

(A09 already PASS from P3; further mobile compact polish applied.)

### Residual MINOR / WITH_GAPS (28)

```
BB-M04, BB-M05, BB-M07, BB-M08, BB-M09, BB-M10, BB-M11, BB-M12,
BB-M13, BB-M14, BB-M18, BB-M20, BB-M23, BB-M24, BB-M26,
BB-A01, BB-A02, BB-A05, BB-A06, BB-A07, BB-A10, BB-A11, BB-A13, BB-A14,
BB-R01, BB-R02, BB-R03, BB-R04
```

### Residual MOBILE_GAPS (unchanged 9)

```
BB-M13, BB-M14, BB-M18, BB-M20, BB-M23, BB-M24, BB-M26,
BB-A06, BB-A07
```

Why not closed: no titled Stitch mobile for several; P2 OTP digit-cell vs single field; P3 staff redeem / capacity / client-theatre residuals. Intentional — no redundant screens for tabs/drawers/embedded A11.

---

## Tests run (logical groups)

```bash
node --test \
  tests/v2-04-bb-m01-m02-members.test.js \
  tests/v2-04-bb-member-creation-flow.test.js \
  tests/v2-04-bb-member-admin-profile.test.js \
  tests/v2-04-bb-attendance-session-ops.test.js \
  tests/v2-04-bb-attendance-checkin.test.js \
  tests/v2-04-bb-attendance-correction.test.js \
  tests/v2-04-bb-request-admin.test.js \
  tests/v2-04-bb-stitch-parity-audit.test.js
```

**67 pass / 0 fail / 0 skip**

---

## Finish

**`V2_04_BB_REMAINING_STITCH_PARITY_WITH_GAPS`**

Attention MINOR screens closed to practical PASS. Residual gaps are documented (no-frame / OTP digit cells / P3 theatre / admin density without dedicated Stitch mobile).
