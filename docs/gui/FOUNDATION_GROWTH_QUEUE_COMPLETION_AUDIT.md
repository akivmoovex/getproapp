# Foundation & Growth — queue completion audit

**Date:** 2026-07-19  
**Branch:** `V5` @ `de660d3` (+ FG-Q12 giving `advanced_reports` gate)  
**Companions:** [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](../product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md`](./FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md) · [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](./FOUNDATION_GROWTH_BLOCKED_SCREENS.md) · [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md)

**Constraint honored:** No billing/checkout. No second entitlement system. No `max_branches` hard-wire work. CSRF / HQ authz / church-branch scoping preserved.

---

## 1. Audit method

For every FG queue item (FG-01, FG-08a, FG-Q01–Q15) verified against:

| Check | How verified |
|-------|----------------|
| Expected route renders | HTTP routes + focused GUI tests |
| Canonical Stitch design used | Queue/map IDs cited in templates or batch docs; MATCHED not claimed |
| Desktop + mobile implementation | Shell CSS breakpoints (900px / 768px) + D+M `<picture>` / table+cards patterns |
| Package entitlement correct | `basic_reports` / `advanced_reports` + plan seeds |
| Foundation does not get Growth-only | Attendance + giving detail soft-gated |
| Growth retains Foundation | Hub + CMS + BA mounts shared |
| No fake records/metrics | a11y + marketing + reports tests guard fabrications |
| Focused tests exist and pass | Scripts listed in §7 |
| Navigation points to screen | Apex/BA/HQ/member nav + tests |
| No dead actions | Denied detail uses empty-state; hub cards remain openable for status |

**Batch docs from generated prompts:** Only `BATCH_FG01_APEX_FEATURES.md` and `BATCH_FG08A_HQ_REPORTS.md` exist. **No `BATCH_FG_Q*.md` files were produced** (prompts exist in `FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md`). Disposition below uses live code + portal CLOSE PARITY + verification criteria.

---

## 2. Queue item results

| Queue ID | Screen | Route | Route OK | Stitch IDs | D+M | Entitlement | Fake metrics | Tests | Nav | Dead actions | Disposition |
|----------|--------|-------|----------|------------|-----|-------------|--------------|-------|-----|--------------|-------------|
| **FG-01** | Features | `/features` | yes | yes (batch) | yes | n/a | none | `apex-marketing` | OK | none | **COMPLETE** |
| **FG-08a** | Reports hub + attendance | `/hq/reports`, `/hq/reports/attendance` | yes | yes (batch) | yes | attendance gated | none | `reports-audit` | OK | none | **COMPLETE** |
| **FG-Q01** | Apex Home | `/` apex | yes | `46081ff8…` / `9f9927a6…` | yes | n/a | none | `apex-home` | OK | none | **COMPLETE** |
| **FG-Q02** | Pricing + FAQ | `/pricing` | yes | documented | yes | SoT pricing | none | `apex-marketing` | OK | none (no checkout) | **COMPLETE** |
| **FG-Q03** | Directory | `/directory` | yes | documented | yes | n/a | none | `apex-marketing` | OK | none | **COMPLETE** |
| **FG-Q04** | Register Church | `/register-church` | yes | documented | yes | n/a | none | `apex-marketing` | OK | none (enquiry only) | **COMPLETE** |
| **FG-Q05** | For Churches | `/for-churches` | yes | documented | yes | n/a | none | `apex-marketing` | OK | none | **COMPLETE** |
| **FG-Q06** | Create organization | `/admin/organizations/new` | **no** | documented | no | n/a | n/a | provisioning (CLI) | soft (CLI copy) | none | **BLOCKED BY VERIFIED DEPENDENCY** |
| **FG-Q07** | Prayer CTA | `/member` tile | yes (dashboard) | dashboard pair | yes | n/a | none | `member-portal` | disabled tile | none (`href: null`) | **BLOCKED BY VERIFIED DEPENDENCY** |
| **FG-Q08** | Ministry profile | `/branch-admin/content/ministries` | yes | documented | yes | n/a | none | `content-admin` | OK | none | **COMPLETE** |
| **FG-Q09** | Announcement preview | `…/announcements/:id/preview` | yes | documented | yes | n/a | none | `announcements` | OK | none | **COMPLETE** |
| **FG-Q10** | Website editor | `/branch-admin/content` | yes | documented | yes | n/a | none | `content-admin` | OK | none | **COMPLETE** |
| **FG-Q11** | HQ content | `/hq/content` | yes | documented | yes | HQ role | none | `content-admin` | OK | none | **COMPLETE** |
| **FG-Q12** | Giving report + gate | `/hq/reports/giving` | yes | documented | yes | **`advanced_reports` gated** | none | `reports-audit` | hub Growth-required | denial empty-state | **COMPLETE** |
| **FG-Q13** | Branch performance | `/hq/reports` (hub) | yes (hub) | documented | yes | soft | none | `reports-audit` | soft | none | **COMPLETE** (hub + unavailable) |
| **FG-Q14** | Responsive + a11y | sampled | n/a | n/a | yes | n/a | n/a | `a11y-structure` | n/a | n/a | **COMPLETE** |
| **FG-Q15** | Final parity docs | docs | n/a | n/a | n/a | n/a | n/a | `git diff --check` | n/a | n/a | **COMPLETE** |

---

## 3. BLOCKED BY VERIFIED DEPENDENCY (exact)

| Queue | Dependency (exact) | Workaround today |
|-------|--------------------|------------------|
| **FG-Q06** | Product unlock for create-org **GUI**; no `GET /admin/organizations/new` in `platformAdminRoutes.js` | CLI `provisionBlessBoardChurch` / org list states CLI-only |
| **FG-Q07** | Product decision: link prayer CTA to `/member/requests/new?category=prayer` **or** keep disabled — **do not** invent `/member/prayer-request` (MISSING_BACKEND) | Dashboard tile `enabled: false`, `href: null` (“Not enabled yet”) |

~~**FG-Q12**~~ closed: soft `advanced_reports` gate on `GET /hq/reports/giving` (mirror FG-08a), hub card Growth-required chrome, Foundation denial empty-state (200), Growth + Network (`professional`) live detail.

---

## 4. Items still partial

**None** in the Foundation/Growth **executable queue** after FG-Q12.

Residual (not queue PARTIAL):

- Visual **MATCHED** not claimed anywhere without browser↔Stitch evidence
- `STITCH_SCREEN_MAP.md` apex status rows still lag live routes (hygiene for a later map refresh)
- FG-Q\* polish batch docs never written (capability closed via CLOSE PARITY + tests)

---

## 5. Remaining backend-blocked screens

Unchanged — see [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](./FOUNDATION_GROWTH_BLOCKED_SCREENS.md):

1. Waiting verification (no pending-member session)
2. Dedicated `/member/prayer-request` (no route/table)
3. Departments
4. Duty roster
5. Branch monthly reports (V4 not ported)
6. HQ monthly report review (depends on #5)
7. HQ roles / permission UI
8. HQ organization templates / standards
9. `max_branches` hard enforcement not wired into all provision paths

---

## 6. Remaining missing-Stitch screens

| Surface | Note |
|---------|------|
| Apex auth-error / account | Live routes; no dedicated D+M pair |
| BA account / settings | Live; no dedicated pair |
| BA sermons admin | Live entity CRUD; adapted |
| BA forms admin | Live; no dedicated pair |
| HQ account / settings | Live; no dedicated pair |
| Media picker / upload / detail | Batch 22 done; Shared UI States only |

---

## 7. Package readiness

### Foundation

| Area | Ready? | Note |
|------|--------|------|
| Apex commercial (Home, Features, Pricing, Directory, Register, For Churches) | **Yes** | Enquiry/pricing SoT; no checkout |
| Public tenant + registration | **Yes** | CLOSE PARITY |
| Member portal | **Yes** | Prayer dedicated route absent; tile disabled honestly |
| Branch admin ops | **Yes** | Basic giving summaries remain; Reports nav disabled for BA monthly |
| HQ basic hub | **Yes** | Live aggregates including basic giving totals |
| Advanced HQ giving detail | **Denied honestly** | Soft gate + empty-state; no aggregate leak |

**Verdict:** Foundation is **demo-ready** for approved Foundation surfaces, with known MISSING_BACKEND/MISSING_STITCH/DEFERRED exclusions.

### Growth

| Area | Ready? | Note |
|------|--------|------|
| Multi-branch HQ mounts | **Yes** | Soft capacity on provision |
| Content / announcements / forms oversight | **Yes** | Reuses Foundation CMS |
| Advanced attendance report | **Yes** | `advanced_reports` gated (FG-08a) |
| Advanced giving report | **Yes** | `advanced_reports` gated (FG-Q12) |
| Scheduled / surveys / offline / volunteers | **No** | DEFERRED catalogue only |

**Verdict:** Growth is **demo-ready** for implemented multi-branch HQ + gated attendance and giving detail. Catalogue aspirational features are not live.

### Network

Inherits Growth `advanced_reports` via plan key `professional` (display name Network). Custom domain / mailboxes remain Network-only and out of this gate.

---

## 8. FG-Q12 implementation notes

| Item | Detail |
|------|--------|
| Entitlement key | `advanced_reports` (`FEATURE_KEYS.ADVANCED_REPORTS`) via `resolveChurchReportTier` / `resolveOrganizationEntitlementsSafe` |
| Direct GET | `GET /hq/reports/giving` — Foundation → 200 denial empty-state (no summary aggregates); Growth/Network → live summary |
| State-changing | None on this report route (GET-only) |
| Navigation | HQ nav keeps Reports → `/hq/reports` hub; dashboard quick actions stay on hub / manage giving |
| Hub cards | Giving card uses Growth-required chrome when not advanced; links remain so direct URL is not the only check |
| Branch giving | `/branch-admin/giving*` and hub currency totals remain for Foundation |

---

## 9. Tests and exact results

All commands run 2026-07-19 after FG-Q12 gate. Exit code **0**.

| Command | Result |
|---------|--------|
| `npm run test:blessboard:giving` | **8 pass / 0 fail** |
| `npm run test:platform:entitlements` | **10 pass / 0 fail** |
| `npm run test:blessboard:authorization` | **22 pass / 0 fail** |
| `npm run test:blessboard:reports-audit` | **7 pass / 0 fail** |
| `npm run test:blessboard:a11y-structure` | **87 pass / 0 fail** |
| `git diff --check` | **clean** (exit 0) |

**Totals this gate verification:** **134** focused tests pass / **0** fail.

---

## 10. Suggested commit message

```text
Gate HQ giving detail behind advanced_reports for Growth and Network.
```

---

## 11. Stop conditions confirmed

- No branch-limit (`max_branches`) work started
- No billing / checkout fabricated
- No second plan-checking system
- Church and branch scoping preserved
- CSRF and HQ authorization preserved
- MATCHED not claimed without side-by-side Stitch evidence
}