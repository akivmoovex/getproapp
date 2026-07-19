# Network executive dashboard — data audit (BlessBoard V5)

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Data / product audit only — **do not implement charts**  
**Constraint:** Do not approve forecasts, health/engagement scores, growth predictions, fabricated benchmarks, donor-level analytics, or individual attendance analytics  

**Companions:** [`NETWORK_ENTITLEMENT_MATRIX.md`](./NETWORK_ENTITLEMENT_MATRIX.md) · [`NETWORK_BLOCKED_FEATURES.md`](./NETWORK_BLOCKED_FEATURES.md) (B8) · [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](./NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) · [`V5_SERVER_QUERY_AUDIT.md`](../performance/V5_SERVER_QUERY_AUDIT.md) · [`BATCH_16B_HQ_DASHBOARD.md`](../gui/BATCH_16B_HQ_DASHBOARD.md) · [`BATCH_18B_HQ_ATTENDANCE_REPORTS.md`](../gui/BATCH_18B_HQ_ATTENDANCE_REPORTS.md) · [`BATCH_18C_HQ_GIVING_REPORTS.md`](../gui/BATCH_18C_HQ_GIVING_REPORTS.md)

---

## Verdict

### **PARTIALLY READY**

Core **church-scoped monthly aggregates** already exist and are privacy-safe enough for an executive **summary** surface. A full Stitch “Consolidated Analytics” canvas (trend %, compliance scores, heatmaps, multi-period toggles, union-scale fabricated KPIs) is **not** implementable honestly.

| Conclude label | Selected |
|----------------|:--------:|
| READY TO IMPLEMENT | No — Stitch executive chrome exceeds approved data |
| **PARTIALLY READY** | **Yes** |
| MISSING BACKEND | Partial only (monthly-report workflow; forms HQ rollup; multi-month trends) |

**Do not raise** `FEATURE_KEYS.executive_reports` for this dataset — Growth `advanced_reports` already gates attendance/giving detail; hub snapshot uses `getHqOperationalReport` under HQ authz. `executive_reports` stays reserved until product defines exports / hierarchy beyond Growth reports (N4).

---

## 1. Canonical Stitch surfaces

| Surface | Desktop / Mobile IDs | V5 map |
|---------|----------------------|--------|
| HQ dashboard | `538c8f4f…` / `c67eda76…` (`51-hq-dashboard-*`) | `/hq` — live **active branches** only; other cards unavailable ([16B](../gui/BATCH_16B_HQ_DASHBOARD.md)) |
| Consolidated analytics | `2a577dc1…` / `06489c79…` (`57-hq-consolidated-analytics-*`) | `/hq/reports`, `/hq/reports/attendance`, `/hq/reports/giving` — Growth aggregates + accessible bar tables; **no canvas charts** |

Stitch consolidated frame (observed) includes metrics that must stay **unavailable / omitted**:

- Trend % (+12.4%, +3.1%, −2.4%)  
- “Reporting compliance” % and on-time/late/outstanding pie  
- Union membership / “152 branches” scale fantasy  
- Baptisms / transfers growth series  
- Ministry activity heatmap  
- Daily / Weekly period toggles (V5 is **calendar month** only)

---

## 2. Existing data services (repo)

| Service | Path | What it returns |
|---------|------|-----------------|
| `listBlessBoardBranches` | HQ dashboard | Active branch list + `activeCount` |
| `getHqOperationalReport` | `/hq/reports` hub | Month + optional branch: active members by branch, pending regs, announcement read aggregates, event registration counts, attendance totals/by branch, giving by currency/branch, open request counts |
| `getMonthlyAttendanceSummary` | `/hq/reports/attendance` | Category × branch monthly headcounts (`advanced_reports`) |
| `getMonthlyGivingSummary` | `/hq/reports/giving` | Category × branch × currency monthly amounts (`advanced_reports`) |
| Branch attendance/giving admin | BA shells | Same underlying tables; branch-scoped |
| V4 monthly reports | Church routes / `church_monthly_reports` | **Not ported** to V5 BlessBoard — no BA submit / HQ review |
| Forms/submissions | `formsRequestsService` | Branch/HQ form admin lists — **no** church-wide dashboard aggregate in operational report |

---

## 3. Metric matrix

Columns: **Existing data** · **Query available** · **Privacy safe** · **Accurate** · **Implementable**

| Metric | Existing data | Query available | Privacy safe | Accurate | Implementable |
|--------|:-------------:|:---------------:|:------------:|:--------:|:-------------:|
| Active branches | Yes (`status=active` list) | Yes | Yes | Yes | **Yes** (already on `/hq`) |
| Active members | Yes (`member_branch_memberships` active) | Yes (`getHqOperationalReport`) | Yes (counts only) | Yes (per-branch membership rows) | **Yes** (hub has totals; `/hq` card still unavailable) |
| Registrations (pending queue) | Yes (`submitted` / `under_review`) | Yes | Yes (counts) | Yes | **Yes** |
| Attendance totals (month) | Yes (submitted/approved/archived entry sums) | Yes | Yes (aggregates) | Yes within month + statuses | **Yes** |
| Attendance by category / branch | Yes | Yes (`getMonthlyAttendanceSummary`) | Yes | Yes | **Yes** (Growth+) |
| Attendance trends (multi-month / %) | Raw months exist | **No** multi-month executive query | Aggregates would be OK | %/YoY not defined | **No** — omit trends; do not invent deltas |
| Giving summaries (month, by currency) | Yes | Yes | Yes if **no donor PII** | Yes per currency; **no** FX merge | **Yes** (Growth+) |
| Giving by category / branch | Yes | Yes | Yes | Yes | **Yes** |
| Report submission status (monthly workflow) | V4 only | **No** V5 | N/A | N/A | **No** — MISSING_BACKEND |
| Announcement “reach” | Published + read receipts | Yes | Yes (counts) | **Partial** — readers ≠ delivered/opened-all; not email blast reach | **Yes as “reads”** only — never claim marketing reach |
| Request volume (open) | Yes (`submitted` / `in_review`) | Yes | Yes | Yes | **Yes** |
| Forms and submissions | Tables exist | List queries; **no** HQ rollup in operational report | Submissions may hold PII in answers | Counts only if stripped | **Not yet** — needs count-only aggregate; no answer bodies |
| Branch comparison (attendance/giving) | Yes | Yes | Yes | Yes | **Yes** |
| Event published + registration counts | Yes | Yes | Yes | Yes | **Yes** (hub) |
| Forecasts / health / engagement / growth predictions | No | No | N/A | Fabricated if shown | **Forbidden** |
| Fabricated benchmarks / peer norms | No | No | N/A | No | **Forbidden** |
| Donor-level analytics | Ledger has no donor UI in HQ reports | Must not expose | **Unsafe** | N/A | **Forbidden** |
| Individual attendance analytics | Aggregate entries only | Must not build person-level | **Unsafe** | N/A | **Forbidden** |
| Reporting compliance % | Depends on monthly reports | No | Misleading | No | **Forbidden / blocked** |
| Baptisms / transfers / heatmaps | No V5 product tables for executive use | No | — | No | **No** |

---

## 4. Minimum accurate executive-dashboard dataset

Ship only these fields (church-scoped HQ / `platform_admin`; optional single-branch filter):

| Card / block | Source | Notes |
|--------------|--------|-------|
| Active branches | `listBlessBoardBranches.activeCount` | Already live on `/hq` |
| Active members (total + by branch table) | `activeMembersByBranch` | Sum in presentation |
| Pending registrations (total + by branch) | `registrationsPendingByBranch` | Queue depth, not “growth” |
| Attendance headcount (selected month) | `attendance.totalCount` + by-branch | Link to detail when `advanced_reports` |
| Giving totals by currency (selected month) | `giving.byCurrency` | Never sum distinct currencies |
| Open member requests | `openRequests.openCount` (+ submitted / in_review) | Volume only |
| Announcements published + unique readers | `announcements.*` | Label as **read receipts**, not reach |
| Published events + registrations | `events.*` | Counts only |
| Branch comparison tables | Attendance / giving by branch | Accessible tables + relative bars (existing pattern) |

**Explicitly out of minimum set:** compliance %, trends, forecasts, heatmaps, forms rollup (until count query), monthly-report status, donor/person analytics.

---

## 5. Cross-cutting behavior

### Date filters

- **Canonical:** `YYYY-MM` calendar month (`month` query / `normalizeYearMonth`).  
- Default: current **UTC** year-month (`getHqOperationalReport` / route helpers).  
- No Daily/Weekly Stitch toggles until product defines timezone-aware periods.

### Branch filters

- Optional public `branch` key → UUID; church ownership enforced.  
- Null = all branches of the church.  
- Branch-scoped roles must not use HQ executive surface without HQ/PA role (existing gate).

### Timezone behavior

- Attendance/giving month bucketing uses `to_char(…_date, 'YYYY-MM')` on **date** columns (not session TZ).  
- Document for HQ: “month = calendar date on stored event/giving date,” not browser local midnight.  
- Do not invent branch-TZ conversion without schema.

### Currency behavior

- Group and display **per currency**.  
- Amounts are NUMERIC **strings** (exact).  
- Forbidden: single “total giving” across currencies; FX conversion; “% of everything” across currencies.

### Empty states

- Zero-data month: designed empty (existing report pattern).  
- Unavailable product (monthly reports, trends): **unavailable** copy + link to real destinations — never fake zeros that imply “no compliance issues.”  
- Foundation without `advanced_reports`: hub snapshot OK; attendance/giving detail denied empty (existing FG-08a / FG-Q12).

### Accessible table alternatives

- Prefer HTML tables / definition lists with `role="img"` relative bars (Batches 18B/18C).  
- **No** Chart.js / canvas / SVG chart libraries in the first executive batch.  
- Mobile: card stacks mirroring table rows.

### Query-performance risks

From [`V5_SERVER_QUERY_AUDIT.md`](../performance/V5_SERVER_QUERY_AUDIT.md):

- HQ report path already **parallelizes** report + branch list at **pool** level — do not `Promise.all` on one pg `Client`.  
- `getHqOperationalReport` runs **many sequential aggregates** on one client — acceptable for small branch counts; risk grows with large churches.  
- Unbounded branch lists — usually small; document if Network mega-orgs appear.  
- First dashboard batch should **reuse** `getHqOperationalReport` (or a thin subset) rather than N+1 per card.  
- Do not add multi-month trend queries without pagination/limits and an index plan.

### Entitlement requirements

| Surface | Gate |
|---------|------|
| HQ authz | `church_hq_admin` or `platform_admin` |
| Hub / minimum cards | HQ authz; snapshot from operational report (Foundation+ with `basic_reports` path today) |
| Attendance / giving detail | Soft `advanced_reports` (Growth + Network inherit) |
| `executive_reports` | **true on Network** — gates `/hq/reports/executive` (NW-EX-01); Growth denied |
| Growth denial | Growth keeps attendance/giving detail; executive summary denied |

---

## 6. Implementable cards vs blocked

### Implementable now (data-ready)

1. Active branches  
2. Active members (+ by-branch table)  
3. Pending registrations  
4. Monthly attendance total + branch comparison (+ category detail via existing Growth page)  
5. Monthly giving by currency + branch comparison (+ category detail via existing Growth page)  
6. Open request volume  
7. Announcement published / unique readers (honest labels)  
8. Event published / registration counts  

### Blocked / forbidden

| Item | Reason |
|------|--------|
| Monthly report submission / compliance % | V5 monthly-report workflow MISSING_BACKEND |
| Attendance trend % / multi-month charts | No approved trend query; Stitch % forbidden as fabrication if computed without SoT |
| Forecasts, health, engagement, growth predictions, benchmarks | Explicitly disallowed |
| Donor-level / individual attendance | Privacy |
| Forms & submissions executive card | No count-only HQ aggregate yet; answers may be PII |
| Baptisms / transfers / ministry heatmap | No V5 executive data product |
| Daily/Weekly periods | Not in V5 filter model |
| Multi-org “network hierarchy” dashboard | B10 MISSING_BACKEND |

---

## 7. Recommended first dashboard batch

| Batch | Scope | Stop conditions |
|-------|--------|-----------------|
| **NW-EX-01** | Populate `/hq` unavailable cards from **existing** `getHqOperationalReport` (or shared loader): active members, pending registrations, open requests; optional month/branch filters matching reports hub; empty/unavailable for trends & monthly-report status; accessible tables only; link through to `/hq/reports*` | No new chart library · no `executive_reports=true` · no forecasts/scores · no donor/person analytics · no monthly-report invention · no forms card until count-only query exists |

**Not in first batch:** canvas charts, multi-month trends, CSV/PDF executive exports, hierarchy UI, raising `executive_reports`.

---

## 8. Conclude

| Label | Result |
|-------|--------|
| READY TO IMPLEMENT | No (full Stitch executive canvas) |
| **PARTIALLY READY** | **Yes** — minimum accurate dataset above |
| MISSING BACKEND | Monthly reports, forms rollup, hierarchy, true trends product |

**Report:** Implementable cards = §6 implementable list. Blocked = §6 blocked table. First batch = **NW-EX-01**.

---

## Stop

Data audit complete. No charts or executive GUI implemented in this task.
