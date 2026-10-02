# V2.04 BlessBoard — Stitch ↔ V4 Implementation Reconciliation

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_STITCH_RECONCILIATION` |
| **Branch** | `V4` |
| **Date** | 2026-10-01 |
| **Mode** | **AUDIT ONLY** (no app/DB/migration/redesign/deploy/production changes) |
| **Stitch** | [BlessBoard Member Design Foundation](https://stitch.withgoogle.com/projects/12773983203917549893) · `projects/12773983203917549893` |
| **Prior gate** | `docs/qa/V2_04_BB_MEMBER_FINAL_GATE.md` (`SCREENS_TOTAL=44`, **184/184** tests) |
| **Finish** | **`V2_04_BB_STITCH_RECONCILIATION_GAPS_FOUND`** |

---

## Executive verdict

All **45** canonical Stitch requirement IDs (**BB-M01–M27**, **BB-A01–A14**, **BB-R01–R04**) are **represented in V4** (route, template/partial, and/or embedded state). Functional baseline **184/184** is preserved and not re-executed as a mutation step.

The prior Cursor gate **`SCREENS_TOTAL=44`** is a **stale inventory arithmetic error**, not a missing feature: **BB-A11** (locked session summary) is implemented as an **embedded state** on `session-dashboard.ejs` and was omitted from the 30-count “functional without Stitch frames” bucket.

Visual/mobile exactness against the **current** Stitch project (expanded combined mobile suites + A05 kiosk + Sanctuary Modern DS) is **not** full pass: several IDs that previously had no Stitch frames now have authoritative artifacts, while V4 still ships functional Sacred Modernity (violet) chrome for those surfaces → **parity major gaps** and **mobile gaps** remain. Next phase should apply only targeted parity/theme/mobile corrections.

---

## Step 2 — Resolve 44 vs 45

| Field | Value |
|-------|--------|
| **OLD_CURSOR_TOTAL** | **44** |
| **CANONICAL_TOTAL** | **45** |
| **COUNT_DISCREPANCY_CAUSE** | `stale_QA_inventory` + `embedded_state_not_counted` |
| **MISSING_IMPLEMENTATION_IDS** | _(none)_ |
| **EMBEDDED_NOT_PREVIOUSLY_COUNTED_IDS** | **BB-A11** |

### Proof (from gate math + code)

Final gate roll-up:

| Bucket (gate wording) | Gate count | Correct ID set |
|-----------------------|-----------:|----------------|
| Completed Stitch (M01–M06, A01–A04, R01–R04) | 14 | 14 |
| Functional without Stitch frames (M07–M27, A05–A14) | **30** | **31** = M07–M27 (**21**) + A05–A14 (**10**) |
| **Total** | **44** | **45** |

Gate prose listed “BB-A10–A11” under functional surfaces, but the **integer bucket used A05–A14 = 9** (dropping **A11**) because A11 has **no dedicated template** and no static `data-bb-stitch-v204="BB-A11"` — it is set dynamically:

```377:382:src/blessboard/http/attendanceSessionAdminRoutes.js
    const stitchScreen =
      session.status === SESSION_STATUS.LOCKED
        ? "BB-A11"
        : session.status === SESSION_STATUS.CLOSED
          ? "BB-A10"
          : "BB-A03";
```

Locked UI lives on `views/blessboard/v5/attendance/session-dashboard.ejs` (`data-bb-a11-summary`, `--locked` class). Domain/session-ops tests cover `SESSION_STATUS.LOCKED` transitions.

**Not** causes: omitted product requirement, missing implementation, or duplicate miscount of two IDs on one screen for counting purposes (A03/A11 share a template by design).

---

## Stitch MCP snapshot (evidence, 2026-10-01)

| Metric | Value |
|--------|------:|
| Product HTML/markdown screens in `list_screens` | 22 + 1 DS |
| Unique requirement IDs **explicitly titled** in Stitch screen titles | **27** |
| Authoritative inventory (user baseline) | **REQUIRED_UNIQUE_IDS=45 · COMPLETE=45 · PARTIAL=0 · MISSING=0 · MOBILE_GAPS=0** |

**Titled Stitch coverage (27):** M01–M06; M15–M19 (combined mobiles); M21–M23; M25; M27; A01–A07; R01–R04.

**Remaining 18 IDs** (**M07–M14, M20, M24, M26, A08–A14**) have **no dedicated titled HTML frame** in MCP `list_screens`. Per the authoritative COMPLETE=45 baseline they are treated as **complete via embedded state / action surface / responsive / DS contract** (not as missing requirements). Reconciliation still maps each to V4 implementation and classifies visual parity against the nearest Stitch artifact or DS.

**DS theme note:** Stitch project DS (“Sanctuary Modern”) uses navy/obsidian primary + Grace Royal Blue (`#2563EB`) / Plus Jakarta + Inter. V4 BB product shell retains **Sacred Modernity violet `#6C5CE7`** / Hanken Grotesk — recorded as **PRODUCT_DECISION_DIFFERENCE** (theme gap), not an AC bleed.

---

## Summary totals (must reconcile)

| Metric | Count |
|--------|------:|
| **CANONICAL_REQUIRED** | **45** |
| **IMPLEMENTED** | **45** |
| **NOT_IMPLEMENTED** | **0** |
| **FUNCTIONAL_PASS** | **45** |
| **PARITY_PASS** | **0** |
| **PARITY_MINOR_GAPS** | **27** |
| **PARITY_MAJOR_GAPS** | **18** |
| **MOBILE_PASS** | **27** |
| **MOBILE_GAPS** | **17** |
| **MOBILE_NOT_APPLICABLE** | **1** |
| **THEME_GAPS** | **1** (cross-cutting product decision + listed files) |

Checks:

- `IMPLEMENTED + NOT_IMPLEMENTED = 45` → `45 + 0 = 45`
- `PARITY_PASS + PARITY_MINOR_GAPS + PARITY_MAJOR_GAPS = 45` → `0 + 27 + 18 = 45`
- `MOBILE_PASS + MOBILE_GAPS + MOBILE_NOT_APPLICABLE = 45` → `27 + 17 + 1 = 45`

### Exact lists

```
NOT_IMPLEMENTED_IDS=
(none)

PARITY_MINOR_GAP_IDS=
BB-M01,BB-M02,BB-M03,BB-M04,BB-M05,BB-M06,BB-M07,BB-M08,BB-M09,BB-M10,BB-M11,BB-M12,
BB-A01,BB-A02,BB-A03,BB-A04,BB-A08,BB-A09,BB-A10,BB-A11,BB-A12,BB-A13,BB-A14,
BB-R01,BB-R02,BB-R03,BB-R04

PARITY_MAJOR_GAP_IDS=
BB-M13,BB-M14,BB-M15,BB-M16,BB-M17,BB-M18,BB-M19,BB-M20,BB-M21,BB-M22,BB-M23,BB-M24,BB-M25,BB-M26,BB-M27,
BB-A05,BB-A06,BB-A07

MOBILE_GAP_IDS=
BB-M13,BB-M14,BB-M15,BB-M16,BB-M17,BB-M18,BB-M19,BB-M20,BB-M21,BB-M22,BB-M23,BB-M24,BB-M25,BB-M26,BB-M27,
BB-A06,BB-A07

THEME_GAP_FILES=
public/blessboard/v5/branch-admin.css
public/blessboard/v5/member-auth.css
public/blessboard/v5/member-portal-v204.css
public/platform/gp-ops-shared.css (product-neutral; hosts shared status/surface patterns used by BB)
(Stitch DS vs BB tokens — PRODUCT_DECISION_DIFFERENCE; not a single file)
```

---

## Canonical matrix (45)

Legend:

- **IMPLEMENTED** — V4 route/template/partial/state present
- **FUNCTIONAL** — domain + HTTP behaviour covered by automated suite(s) and/or shared domain tests
- **DESKTOP / MOBILE** — `PASS` | `GAP` | `N/A` | `RESP` (responsive-from-desktop / structural contract)
- **PARITY** — `PASS` | `MINOR` | `MAJOR`
- **STITCH** — MCP screen id prefix or `EMBEDDED` / `COMBINED` / `NO_FRAME`

| ID | SCREEN | STITCH | IMPLEMENTED | ROUTE / TEMPLATE | FUNCTIONAL | DESKTOP | MOBILE | PARITY | GAP | ACTION |
|----|--------|--------|:-------------:|------------------|------------|---------|--------|--------|-----|--------|
| BB-M01 | Members Directory | `2b8333d5…` D | YES | `/branch-admin/members` · `members.ejs` · `branchRegistrationAdminRoutes` | YES | PASS | RESP/PASS | MINOR | Theme violet≠Stitch blue; demo Export/Batch omitted | Theme/demo only |
| BB-M02 | Add Member | `b31eebc2…` D | YES | `/branch-admin/members/new` · `member-add.ejs` · staff add flow | YES | PASS | RESP/PASS | MINOR | Demo chrome; gender/baptism persist gap (prior) | Theme + known field gap |
| BB-M03 | Possible Member Match | `dcd7f88a…` D | YES | POST match step · `member-match.ejs` | YES | PASS | RESP/PASS | MINOR | Demo narrative fields omitted | Minor copy |
| BB-M04 | Review New Member | `6e22944e…` D | YES | review step · `member-review.ejs` | YES | PASS | RESP/PASS | MINOR | Theme | Theme |
| BB-M05 | Member Created | `0ef25162…` D | YES | `…/:id/created` · `member-created.ejs` | YES | PASS | RESP/PASS | MINOR | Theme | Theme |
| BB-M06 | Member Admin Profile | `7ddcd294…` D | YES | `…/:id` · `member-detail.ejs` | YES | PASS | RESP/PASS | MINOR | Download card / Deactivate demo chrome | Minor chrome |
| BB-M07 | Edit Member | EMBEDDED/NO_FRAME (M06 actions) | YES | `…/:id/edit` · `member-edit.ejs` | YES | RESP | RESP/PASS | MINOR | Full page vs possible Stitch drawer | Targeted layout |
| BB-M08 | Church ID Manage | EMBEDDED/NO_FRAME | YES | `…/:id/church-id` · `member-church-id.ejs` | YES | RESP | RESP/PASS | MINOR | Same | Targeted layout |
| BB-M09 | Portal Access | EMBEDDED/NO_FRAME | YES | `…/:id/access` · `member-access.ejs` | YES | RESP | RESP/PASS | MINOR | Same | Targeted layout |
| BB-M10 | Block Access Confirm | EMBEDDED/NO_FRAME | YES | `…/:id/access/block` · `member-access-block.ejs` | YES | RESP | RESP/PASS | MINOR | Same | Targeted layout |
| BB-M11 | Branch Transfer | EMBEDDED/NO_FRAME | YES | `…/:id/transfer` · `member-transfer.ejs` | YES | RESP | RESP/PASS | MINOR | Same | Targeted layout |
| BB-M12 | Member History | EMBEDDED/NO_FRAME | YES | `…/:id/history` · `member-history.ejs` | YES | RESP | RESP/PASS | MINOR | Timeline vs DS density | Minor |
| BB-M13 | Member Login | NO_FRAME (auth) | YES | `/member/login` · `member-auth/login.ejs` · `memberPortalAuthRoutes` | YES | GAP | **GAP** | **MAJOR** | Built on functional auth shell; no titled Stitch; DS Sanctuary Modern unused | Visual/mobile parity pass |
| BB-M14 | First Activation Verify | NO_FRAME | YES | `/member/activate` · `activate.ejs` | YES | GAP | **GAP** | **MAJOR** | Same | Visual/mobile parity pass |
| BB-M15 | Create Password | COMBINED `e69a6f95…` M | YES | activate password · `create-password.ejs` | YES | GAP | **GAP** | **MAJOR** | Stitch mobile suite now exists; V4 not matched | Match Stitch suite |
| BB-M16 | Portal Activated | COMBINED `e69a6f95…` M | YES | `activated.ejs` | YES | GAP | **GAP** | **MAJOR** | Same | Match Stitch suite |
| BB-M17 | Forgot Password | COMBINED `fcd1419c…` M | YES | `/member/forgot-password` · `forgot-password.ejs` | YES | GAP | **GAP** | **MAJOR** | Same | Match Stitch suite |
| BB-M18 | Recovery Verify | COMBINED `fcd1419c…` M | YES | `recovery-verify.ejs` | YES | GAP | **GAP** | **MAJOR** | Same | Match Stitch suite |
| BB-M19 | Recovery Failure / Blocked | COMBINED `fcd1419c…` M | YES | `recovery-failure.ejs` + blocked gate | YES | GAP | **GAP** | **MAJOR** | Same | Match Stitch suite |
| BB-M20 | Member Homepage | NO_FRAME | YES | `/member` · `member/dashboard.ejs` | YES | GAP | **GAP** | **MAJOR** | Portal chrome vs Sanctuary Modern | Visual/mobile |
| BB-M21 | My Profile | COMBINED `331823d1…` M | YES | `/member/profile` · `profile.ejs` | YES | GAP | **GAP** | **MAJOR** | Stitch profile suite vs V4 | Match suite |
| BB-M22 | Edit Profile | COMBINED `331823d1…` M | YES | `/member/profile/edit` · `profile-edit.ejs` | YES | GAP | **GAP** | **MAJOR** | Same | Match suite |
| BB-M23 | Phone Verify | COMBINED `331823d1…` M | YES | `/member/profile/phone-verify` · `profile-phone-verify.ejs` | YES | GAP | **GAP** | **MAJOR** | Same | Match suite |
| BB-M24 | My Ministries | NO_FRAME | YES | `/member/ministries` · `participation/member-ministries.ejs` | YES | GAP | **GAP** | **MAJOR** | Functional list; Stitch mobile absent for list | Visual/mobile |
| BB-M25 | Ministry Detail + Join | COMBINED `00c2471d…` M | YES | `/member/ministries/:id` · `member-ministry-detail.ejs` | YES | GAP | **GAP** | **MAJOR** | Stitch suite vs V4 | Match suite |
| BB-M26 | My Requests | NO_FRAME | YES | member requests · `forms-requests/member-requests.ejs` | YES | GAP | **GAP** | **MAJOR** | Functional inbox chrome | Visual/mobile |
| BB-M27 | Request Detail | COMBINED `00c2471d…` M | YES | `forms-requests/member-request-detail.ejs` | YES | GAP | **GAP** | **MAJOR** | Stitch suite vs V4 | Match suite |
| BB-A01 | Attendance Sessions | `7102d694…` D | YES | `/branch-admin/attendance/sessions` · `sessions.ejs` | YES | PASS | RESP/PASS | MINOR | Theme; demo nav | Theme |
| BB-A02 | Create Session | `d4b24ec7…` D | YES | `…/sessions/new` · `session-new.ejs` | YES | PASS | RESP/PASS | MINOR | Theme | Theme |
| BB-A03 | Open Session Dashboard | `81d1cfbd…` D | YES | `…/sessions/:id` · `session-dashboard.ejs` (`stitchScreen` A03) | YES | PASS | RESP/PASS | MINOR | Peak stream density | Minor |
| BB-A04 | Manual Check-In | `e1460372…` D | YES | `…/:id/check-in` · `check-in-manual.ejs` | YES | PASS | RESP/PASS | MINOR | Theme | Theme |
| BB-A05 | QR Display Kiosk | `7939623a…` D (large) | YES | `…/:id/qr` · `check-in-qr-display.ejs` | YES | GAP | **N/A** | **MAJOR** | Stitch kiosk frame now present; V4 functional token display | Kiosk visual pass |
| BB-A06 | Member QR Check-In | COMBINED `c90491b5…` M | YES | `…/:id/qr/check-in` · `check-in-qr-member.ejs` | YES | GAP | **GAP** | **MAJOR** | Stitch mobile suite vs functional form | Match suite |
| BB-A07 | Peak Check-In | COMBINED `c90491b5…` M | YES | `…/:id/peak` · `check-in-peak.ejs` | YES | GAP | **GAP** | **MAJOR** | Same | Match suite |
| BB-A08 | Live Roster | NO_FRAME | YES | `…/:id/roster` · `check-in-roster.ejs` | YES | RESP | RESP/PASS | MINOR | No dedicated Stitch; table/card density | Minor |
| BB-A09 | Warning / Exception Result | EMBEDDED (partial; suite w/ A06/A07) | YES | `partials/check-in-result.ejs` (shared) | YES | RESP | RESP/PASS | MINOR | Embedded; not separate route | Keep embedded; polish states |
| BB-A10 | Close Session | NO_FRAME / state | YES | `…/:id/close` · `session-close.ejs` (+ closed dashboard marker) | YES | RESP | RESP/PASS | MINOR | Functional confirm | Minor |
| BB-A11 | Locked Session Summary | **EMBEDDED** on A03 template | YES | same `session-dashboard.ejs` when `LOCKED` · `stitchScreen=BB-A11` | YES | RESP | RESP/PASS | MINOR | Embedded (correct); was omitted from count 44 | Count fix only; polish locked chrome |
| BB-A12 | Correct Attendance | NO_FRAME | YES | `…/check-ins/:checkInId/correct` · `correction-form.ejs` | YES | RESP | RESP/PASS | MINOR | Functional form | Minor |
| BB-A13 | Correction Confirmed | NO_FRAME | YES | `…/correction/:correctionId` · `correction-confirmed.ejs` | YES | RESP | RESP/PASS | MINOR | Functional success | Minor |
| BB-A14 | Attendance Audit | NO_FRAME | YES | `…/:id/audit` · `correction-audit.ejs` | YES | RESP | RESP/PASS | MINOR | Timeline density | Minor |
| BB-R01 | Requests Inbox | `ff1bcec5…` D + `bb1a2125…` M | YES | `/branch-admin/join-requests` · `join-requests/inbox.ejs` | YES | PASS | **PASS** | MINOR | Demo multi-type filters not in BB domain | Domain-safe |
| BB-R02 | Request Review | `79b654c9…` D + `f8c014f3…` M | YES | `…/join-requests/:id` · `review.ejs` | YES | PASS | **PASS** | MINOR | Demo audition panels omitted | Domain-safe |
| BB-R03 | Request Decision | `ddc98054…` D | YES | `…/:id/decision` · `decision.ejs` | YES | PASS | RESP/PASS | MINOR | No Stitch mobile pair | Responsive OK |
| BB-R04 | Ministry Members & Pending | `fe42f3a5…` D | YES | `…/ministries/:ministryId` · `ministry-members.ejs` | YES | PASS | RESP/PASS | MINOR | Choir capacity demo metrics omitted | Domain-safe |

---

## Step 3 — Visual parity notes

Classification rules used:

- **PARITY_PASS** — would require hierarchy + layout + tokens within accepted product theme. None claimed exact (violet vs Stitch blue/navy remains).
- **PARITY_MINOR_GAP** — content/hierarchy largely aligned; residual theme, demo chrome, density, or shared-shell differences (Phase 11 `PASS_WITH_GAPS` set + admin action pages + A08–A14 functional surfaces).
- **PARITY_MAJOR_GAP** — Stitch now supplies dedicated/combined artifacts (or Sanctuary Modern auth/portal expectation) that V4 still implements as pre-Stitch functional chrome (**M13–M27**, **A05–A07**).

Embedded states (**A09**, **A11**) are **not** classified as failures for lacking their own routes.

---

## Step 4 — Mobile parity

| Attention ID | Stitch mobile guidance | V4 | Class |
|--------------|------------------------|----|-------|
| BB-M01–M03, M06 | Responsive structural (no dedicated 390 frames in MCP) | Branch-admin responsive | **MOBILE_PASS** |
| BB-M13–M27 | Combined mobile suites for M15–19, M21–23, M25/M27; others via DS/mobile expectation | `member-auth.css` / `member-portal-v204.css` 390 approximations | **MOBILE_GAP** |
| BB-A06, A07 | Combined mobile `c90491b5…` | Functional pages, not suite-matched | **MOBILE_GAP** |
| BB-A09 | Result states in A06/A07 suite | Shared result partial responsive | **MOBILE_PASS** (embedded; no separate mobile frame required) |
| BB-R01, R02 | Dedicated 390 frames | 390 CSS + short CTAs | **MOBILE_PASS** |
| BB-A05 | Large-screen kiosk | N/A mobile | **NOT_APPLICABLE** |
| Other admin A/R/M | Responsive structural | Branch-admin responsive | **MOBILE_PASS** |

Stitch inventory `MOBILE_GAPS=0` means **Stitch coverage** is complete; it does **not** imply V4 mobile parity.

---

## Step 5 — Business contract check (no behaviour changes)

| Area | Contract | Audit result |
|------|----------|--------------|
| Membership | Staff-created only; Church ID church-controlled; org-scoped unique; membership ≠ portal status; no member self-creation | **PASS** (domain + creation-flow + admin-profile suites) |
| Auth | Activation verifies existing membership; email optional; Church ID + name + phone; password policy; recovery; blocked access | **PASS** (`v2-04-bb-member-auth`) |
| Profile | Church ID + official branch read-only for member; new phone verification | **PASS** (`v2-04-bb-member-portal`) |
| Attendance | Session-based; shared validation manual/QR/peak; duplicate prevention; late; cross-branch metadata; correction audit | **PASS** (session-ops + checkin + correction + domain) |
| Requests | Pending before approval; no auto ministry join; resource-scoped review; no self-approval | **PASS** (request-admin + request-approval + portal join PENDING) |

Visual gaps above **do not** indicate contract violations in this audit.

---

## Step 6 — Theme check (report only)

| Finding | Detail |
|---------|--------|
| PRODUCT_DECISION_DIFFERENCE | BB Sacred Modernity violet `#6C5CE7` vs Stitch Sanctuary Modern navy/`#2563EB` |
| Hardcoded colors in V2.04 attendance/member CSS | `branch-admin.css` V2.04 blocks: `#111`, `#1f9d63`, `#f0a500`, fallback hex beside `--bb-color-*` |
| Typography | Stitch Plus Jakarta + Inter + JetBrains Mono vs BB Hanken Grotesk shell |
| Status styling | Mix of `v204/status-chip`, gp-ops tones, and ad-hoc success/warn hex mixes |
| Obsolete V2.03 | Residual branch-admin patterns outside V2.04 blocks still present in same CSS file (not retokenized wholesale) |
| Undefined / weak tokens | Historical reliance on `--color-*` fallbacks where `--bb-color-*` preferred |
| AC tokens in BB member surfaces | **None found** in `member-auth.css` / `member-portal-v204.css` / V2.04 branch-admin blocks (`--ac-*` absent) |
| gp-ops | Remains product-neutral; BB supplies Sacred Modernity wrappers |

---

## Step 7 — Test traceability (184 baseline; no invented coverage)

Member suite **177** `it(` cases + architecture **7** = **184**. Mapping is by suite evidence (ID strings and/or documented scope). `RESPONSIVE/PARITY_TESTED` is **YES** only where `v2-04-bb-stitch-parity-audit` (or explicit mobile CSS assertions) apply.

| ID | FUNCTIONAL_TESTED | RBAC_TESTED | TENANT_ISOLATION_TESTED | RESPONSIVE/PARITY_TESTED | Primary evidence |
|----|:-----------------:|:-----------:|:-----------------------:|:------------------------:|------------------|
| BB-M01 | YES | YES | YES | YES | `v2-04-bb-m01-m02-members` + stitch-parity-audit |
| BB-M02 | YES | YES | YES | YES | same |
| BB-M03 | YES | YES* | YES* | YES | creation-flow + stitch-parity (*via domain/staff workflow) |
| BB-M04 | YES | YES* | YES* | YES | creation-flow + stitch-parity |
| BB-M05 | YES | YES* | YES* | YES | creation-flow + stitch-parity |
| BB-M06–M12 | YES | YES | YES | NO | `v2-04-bb-member-admin-profile` (+ domain) |
| BB-M13–M19 | YES | YES* | YES* | NO | `v2-04-bb-member-auth` (IDs not string-tagged; scope M13–M19) |
| BB-M20–M27 | YES | YES* | YES* | NO | `v2-04-bb-member-portal` (IDs tagged) |
| BB-A01–A02 | YES | YES | YES | YES | session-ops + stitch-parity |
| BB-A03 | YES | YES | YES | YES | session-ops + stitch-parity (open dashboard) |
| BB-A04–A09 | YES | YES | YES | A04 YES / A05–A09 NO | checkin; A04 in stitch-parity |
| BB-A10 | YES | YES | YES | NO | session-ops (close confirm) |
| BB-A11 | YES | YES* | YES* | NO | session-ops locked transitions + domain (`SESSION_LOCKED`); **no** dedicated UI string `BB-A11` in tests |
| BB-A12–A14 | YES | YES | YES | NO | correction suite |
| BB-R01–R04 | YES | YES | YES | R01–R02 YES / R03–R04 YES desktop | request-admin + stitch-parity |
| Platform engines | YES | YES | YES | NO | person / duplicate / staff workflow / request-approval / token-cascade |
| Architecture | YES | N/A | N/A | N/A | `npm run test:architecture` (7) |

\* Service/domain scopes exercise org/church isolation and permission gates even when the test file does not print `RBAC`/`tenant` literals.

---

## Controllers / services (index)

| Area | HTTP | Services |
|------|------|----------|
| Members M01–M12 | `branchRegistrationAdminRoutes.js` | `blessBoardStaffAddMemberFlowService`, `blessBoardMemberDomainService`, `blessBoardStaffMemberAdminUiService`, platform person/duplicate |
| Auth M13–M19 | `memberPortalAuthRoutes.js` | `blessBoardMemberPortalAuthService`, `requireActiveMemberForTenant` |
| Portal M20–M27 | `memberPortalRoutes.js` (+ participation/forms-requests views) | `memberPortalService`, join request PENDING path |
| Attendance A01–A11 | `attendanceSessionAdminRoutes.js`, `attendanceCheckInAdminRoutes.js` | `attendanceSessionService`, `attendanceCheckInService`, validation/QR |
| Correction A12–A14 | `attendanceCorrectionAdminRoutes.js` | `attendanceCorrectionService` |
| Requests R01–R04 | `joinRequestAdminRoutes.js` | `blessBoardJoinRequestService`, platform `requestApprovalWorkflow` |

---

## Finish marker

```
V2_04_BB_STITCH_RECONCILIATION_GAPS_FOUND
```

**Why not PASS:** all 45 IDs are implemented, but **`PARITY_MAJOR_GAPS=18`** and **`MOBILE_GAPS=17`** remain (auth/portal suites + A05–A07 vs current Stitch). Functional **184/184** baseline must stay green; next phase = targeted parity/theme/mobile only.
