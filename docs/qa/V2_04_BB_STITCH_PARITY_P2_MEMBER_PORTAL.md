# V2.04 BlessBoard — Stitch Parity P2 (Member Portal M13–M27)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_STITCH_PARITY_P2_MEMBER_PORTAL` |
| **Branch** | `V4` |
| **Date** | 2026-10-01 |
| **Mode** | Visual / responsive parity only (no backend reimplementation) |
| **Stitch** | [BlessBoard Member Design Foundation](https://stitch.withgoogle.com/projects/12773983203917549893) |
| **Prior** | `docs/qa/V2_04_BB_STITCH_RECONCILIATION.md` · `docs/qa/V2_04_BB_STITCH_PARITY_P1.md` |
| **Finish** | **`V2_04_BB_M13_M27_STITCH_PARITY_WITH_GAPS`** |

---

## Summary

M13–M27 remain on existing V4 routes, auth contracts, and portal services. Presentation was aligned to Sanctuary Modern (P1 tokens) plus Stitch mobile suite hierarchy/copy for titled frames.

| Metric | Value |
|--------|------:|
| Screens in scope | 15 (M13–M27) |
| Functional contracts preserved | Yes |
| Member suite tests | **179 pass** |
| Architecture | **7 pass** |
| Combined | **186 pass / 0 fail / 0 skip** |
| Demo data hardcoded | **No** (view-model / locals only) |

### Stitch artifact coverage

| Suite | IDs | Form factor |
|-------|-----|-------------|
| `e69a6f95…` | M15, M16 | Mobile 390 |
| `fcd1419c…` | M17, M18, M19 | Mobile 390 |
| `331823d1…` | M21, M22, M23 | Mobile 390 |
| `00c2471d…` | M25, M27 | Mobile 390 |
| *No dedicated titled frame* | M13, M14, M20, M24, M26 | Derived from DS + sibling auth/portal shell |

---

## Changes (presentation)

### CSS
- `public/blessboard/v5/member-auth.css` — full Sanctuary Modern auth shell (cards, steps, checklist, member chip, ID card, 390)
- `public/blessboard/v5/member-portal-v204.css` — M20–M27 panels, profile lock note, OTP, ministries, requests, 390

### Templates (copy / hierarchy only)
- Auth: M13–M19 step labels, Stitch titles/CTAs, password checklist, activation ID card, recovery pastoral failure
- Portal: M21 parish profile + read-only lock note; M23 phone verify panel; M24 ministries title; M25 join/pending notes + CTA wording

### Shells
- Cache bump `v204-p2-1` on member-auth + member-portal assets

**Not changed:** routes, services, validation, RBAC, password policy, recovery privacy, join PENDING behaviour, request scoping.

---

## Per-screen matrix

Legend: **PASS** = practical Stitch parity within available artifact · **GAP** = residual · **N/A** = no dedicated Stitch desktop/mobile frame · **RESP** = responsive from shared shell

| ID | DESKTOP | MOBILE | CONTENT | LAYOUT | THEME | FUNCTIONAL | PARITY |
|----|---------|--------|---------|--------|-------|------------|--------|
| BB-M13 | RESP | PASS | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (no titled Stitch frame) |
| BB-M14 | RESP | PASS | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (no titled Stitch frame) |
| BB-M15 | RESP | PASS | PASS | PASS | PASS | PASS | PASS |
| BB-M16 | RESP | PASS | PASS | PASS | PASS | PASS | PASS |
| BB-M17 | RESP | PASS | PASS | PASS | PASS | PASS | PASS |
| BB-M18 | RESP | PASS | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (single OTP field vs Stitch digit cells) |
| BB-M19 | RESP | PASS | PASS | PASS | PASS | PASS | PASS |
| BB-M20 | RESP | PASS | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (no titled Stitch frame) |
| BB-M21 | RESP | PASS | PASS | PASS | PASS | PASS | PASS |
| BB-M22 | RESP | PASS | PASS | PASS | PASS | PASS | PASS |
| BB-M23 | RESP | PASS | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (single OTP field vs Stitch digit cells) |
| BB-M24 | RESP | PASS | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (no titled Stitch frame) |
| BB-M25 | RESP | PASS | PASS | PASS | PASS | PASS | PASS |
| BB-M26 | RESP | PASS | PASS | PASS | PASS | PASS | PASS_WITH_GAPS (no titled Stitch frame) |
| BB-M27 | RESP | PASS | PASS | PASS | PASS | PASS | PASS |

---

## Contract preservation

| Contract | Status |
|----------|--------|
| M13 Church ID + password | Preserved |
| M14 Church ID + name + phone; email optional | Preserved |
| M15 password policy (≥8, uppercase, special) | Preserved |
| M17–M19 privacy-preserving recovery | Preserved |
| M21–M23 Church ID / branch read-only; phone verify | Preserved |
| M24–M25 request to join (not auto-join) | Preserved |
| M26–M27 own requests only | Preserved |

---

## Remaining gaps (intentional / deferred)

1. **No dedicated Stitch frames** for M13, M14, M20, M24, M26 — parity derived from DS + sibling suites.
2. **OTP UX** — Stitch shows discrete digit cells; V4 keeps a single accessible `inputmode=numeric` field (same POST contract).
3. **Stitch demo chrome** — toggle simulators, fake notification bells, hardcoded parish phone lines not productized.
4. **Desktop-only Stitch frames** for these IDs are absent; desktop = responsive Sanctuary Modern shell.

---

## Tests

```
node --test (member feature 18 files) → 179 pass
npm run test:architecture → 7 pass
TOTAL 186 / 0 fail / 0 skip
```

---

## Finish

```
V2_04_BB_M13_M27_STITCH_PARITY_WITH_GAPS
```

Practical visual/mobile parity landed for all available Stitch suites and shared auth/portal shells; residual gaps are missing Stitch frames + OTP digit-cell presentation only. Functional baseline remains green.
