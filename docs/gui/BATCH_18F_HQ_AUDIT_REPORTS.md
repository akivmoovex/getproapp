# Batch 18F — HQ Audit trail & Reports index

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/audit` and `/hq/reports` **presentation only**. **Parity audit not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 64–66), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_18E_HQ_REQUESTS.md`](./BATCH_18E_HQ_REQUESTS.md), [`BATCH_18B_HQ_ATTENDANCE_REPORTS.md`](./BATCH_18B_HQ_ATTENDANCE_REPORTS.md)

## 1. Canonical Stitch screen IDs

### Audit trail

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `58-hq-global-audit-trail-desktop` | `bce1e8ec4078407c8d6179251b8765c2` |
| Mobile | `58-hq-global-audit-trail-mobile` | `d7fcb1b3a796434a8fefc7e806c2c0b6` |

Marker: `data-bb-stitch-audit="58-hq-global-audit-trail"` (+ `data-bb-hq-audit="1"`).  
Order 65 (audit review queue) is **not** mapped as a separate route — same `/hq/audit` surface.

### Reports index

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `57-hq-consolidated-analytics-desktop` | `2a577dc15d4342acb152f16aed21c267` |
| Mobile | `57-hq-consolidated-analytics-mobile` | `06489c79d0d04a429e57eba5c717ba47` |

Marker: `data-bb-stitch-reports="57-hq-consolidated-analytics"` (+ `data-bb-hq-reports="1"`).  
Same Stitch pair as attendance/giving detail reports (Batches 18B–18C); this batch polishes the **hub index**.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/hq/audit.ejs` | Stitch chrome, summary cards, empty/no-results, desktop table + mobile cards, unavailable rows |
| `views/blessboard/v5/hq/reports.ejs` | Stitch chrome, report-link cards, snapshot summary, responsive branch tables/cards, unavailable rows |
| `public/blessboard/v5/hq-admin.css` | Audit + reports index styles (`?v=41`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-reports-audit.test.js` | Stitch markers, links, empty/no-results, sensitive-data assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Audit + reports structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Orders 64–66 Batch 18F notes |
| `docs/gui/BATCH_18F_HQ_AUDIT_REPORTS.md` | This document |

**Unchanged:** `listOrganizationAuditEvents`, `presentAuditEventsForHq`, `getHqOperationalReport`, attendance/giving report routes, authz, church scope, append-only audit write path.

## 3. Audit fields shown

| Field | Source |
|-------|--------|
| When | `createdAt` → ISO `datetime` + locale string |
| Action key | `actionKey` |
| Entity type | `entityType` |
| Outcome | `outcome` (`success` / `failure` / `denied`) + status chip |
| Entity ref | Last 8 of `entityId` |
| Actor ref | Last 8 of `actorUserId` |
| Page outcome counts | Presentation totals over current page rows only |

Filters preserved: `action`, `entity`, `outcome`, `before` (pagination).

## 4. Sensitive fields excluded

| Excluded | Notes |
|----------|-------|
| Full UUIDs (church, org, user, entity) | Truncated refs only |
| Metadata / payloads | Never passed to the view |
| Passwords, emails in metadata | Asserted absent in HTML |
| Session / CSRF / bearer tokens | Asserted absent |
| CSV / bulk download UI | Unavailable row |
| Fabricated compliance scores | Unavailable row |

## 5. Report links (existing routes only)

| Link | Href |
|------|------|
| Attendance report | `/hq/reports/attendance?month=&branch=` |
| Giving report | `/hq/reports/giving?month=&branch=` |
| Audit trail | `/hq/audit` (from reports header) |
| Inline attendance / giving | Same monthly filters as hub |

Hub still renders live operational panels from `getHqOperationalReport` (members, registrations, announcements, events, attendance, giving, open requests). **No new generators.**

## 6. Omitted / unavailable

| Surface | Treatment |
|---------|-----------|
| Audit CSV / bulk download | `data-bb-audit-unavailable-row="export"` |
| Compliance / risk scores | Audit + reports unavailable rows |
| Raw metadata payloads | `…="payload"` |
| Full identity directories | `…="identity"` |
| Charts / canvas | Reports `…="charts"` |
| New report generators | `…="generators"` |
| Parity audit | **Out of scope** |

## 7. Responsive status

| Viewport | Behavior |
|----------|----------|
| `≥900px` | Audit/report tables; cards hidden |
| `<900px` | Audit/report cards; filter actions stacked |
| `≥700px` | Two-column report destination cards |

## 8. Verification

| Command | Result |
|---------|--------|
| `node --test tests/blessboard-reports-audit.test.js` | **7/7 pass** |
| `node --test tests/blessboard-v5-a11y-structure.test.js` | **73/73 pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Suggested commit message

```
feat(gui): HQ audit trail and reports index (Batch 18F)

Match /hq/audit and /hq/reports to Stitch audit/analytics chrome with
privacy-safe event rows and live report links. No generators or exports.
```
