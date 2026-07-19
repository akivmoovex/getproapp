# BlessBoard V5 — Server-side render and query performance audit

**Date:** 2026-07-19  
**Constraint:** No schema changes, no indexes, no caches (except in-process EJS source memo), no repository rewrites, authorization order unchanged.  
**Measurement:** Static code inspection only — **no hosted production benchmarks.**

---

## 1. Verdict

| Surface | Status |
|---------|--------|
| Apex directory | Paginated; correlated counts documented |
| Tenant Home | No entity N+1 on home path |
| Member Dashboard | **Hardened** — dropped unused attachment/event N+1; bounded upcoming events |
| Branch Dashboard | Shell-only (no list queries) |
| Branch Members | Paginated; OK |
| HQ Dashboard / reports | Branch list + report loads **parallelized** (pool-level) |
| Platform Organizations | Paginated; OK |
| Media picker list | Bounded; delivery route separate from HTML |
| EJS `readFileSync` | **Memoized** for audited shells via `v5EjsTemplateCache` |

---

## 2. Routes inspected

| Route | Entry |
|-------|-------|
| `GET /directory` | `apexMarketingRoutes` → `publicChurchDirectoryRepo` |
| Tenant Home | `loadTenantPublicPageModel` → `renderTenantPublicPage` |
| `GET /member` | `memberPortalRoutes.loadMemberDashboardPreviews` |
| `GET /branch-admin` | `branchAdminRoutes` |
| `GET /branch-admin/members` | `branchRegistrationAdminRoutes` |
| `GET /hq`, `/hq/reports*` | `hqAdminRoutes`, `hqReportsRoutes` / `hqReportsService` |
| `GET /admin/organizations` | `listPlatformOrganizations` |
| Media list JSON | `contentAdminRoutes` + `mediaUploadService` |

---

## 3. Potential N+1 patterns

| Pattern | Severity | Action |
|---------|----------|--------|
| Member announcements: `listAttachments` per row; preview discarded attachments | Clear | Fixed (`includeAttachments: false` on dashboard) |
| Member events: registration + count per row; preview discarded stats | Clear | Fixed (`includeRegistrationStats: false`) |
| Directory per-org correlated `COUNT` / `LATERAL` | Document | Needs query redesign / indexes later |
| Platform orgs lateral branch counts | Document | Same |
| HQ report aggregates on one `client` | Document | Do **not** `Promise.all` on same pg Client |

---

## 4. Unbounded queries

| Query | Notes |
|-------|-------|
| Member events (full list page) | Still unbounded for `/member/events` — intentional until paginated UI |
| Member ministries list | Unbounded; dashboard still loads full then slices 3 — deferred |
| Public content entity lists | Unbounded on non-home pages — deferred |
| HQ / church branch lists | Usually small; no LIMIT — deferred |

**Already bounded:** apex directory, branch members, platform orgs, media library list, announcement dashboard preview limit.

---

## 5. Safe fixes made

1. **Member dashboard previews**  
   - `includeAttachments: false`  
   - `includeRegistrationStats: false` + `upcomingOnly` + SQL `LIMIT` for events  
2. **HQ report routes** — `Promise.all` of report/summary + `listBlessBoardBranches` (separate pool queries)  
3. **`v5EjsTemplateCache.js`** — memoize EJS source for member / branch / HQ / platform / apex marketing (+ apex views via landing renderer)  
4. **Repo** — `listPublishedEventsForBranch` optional `upcomingOnly` / `limit` (preview only)

Behavior and auth scoping unchanged for full list/detail paths (defaults keep prior enrichment).

---

## 6. Deferred database / index recommendations

| Item | Why deferred |
|------|----------------|
| Indexes on directory / org lateral counts | Explicitly out of scope this task |
| Paginate member events/ministries + public content lists | Needs UI + query contract |
| Narrow media list SELECT (drop storage keys) | Safe but touches delivery mapping shared cols |
| Narrow branch member SELECT | Service already strips; repo change needs mapper audit |
| Move HQ report EJS rollups into loaders | Presentation cleanup, not query N+1 |
| Parallelize queries inside a single `withClient` | Unsafe with node-pg Client |

---

## 7. Tests

Focused coverage in `tests/blessboard-v5-server-query-audit.test.js` plus existing member / participation / reports / shell suites.

---

## 8. Exact results (2026-07-19)

| Check | Result |
|-------|--------|
| `npm run test:blessboard:server-query-audit` | **5 pass / 0 fail** |
| `npm run test:blessboard:member-portal` | **16 pass / 0 fail** |
| `npm run test:blessboard:participation` | **11 pass / 0 fail** |
| `npm run test:blessboard:announcements` | **18 pass / 0 fail** |
| `npm run test:blessboard:reports-audit` | **7 pass / 0 fail** |
| `npm run test:blessboard:branch-admin-shell` | **12 pass / 0 fail** |
| `npm run test:blessboard:hq-shell` | **9 pass / 0 fail** |
| `npm run test:blessboard:platform-admin-shell` | **12 pass / 0 fail** |
| `npm run test:blessboard:apex-home` | **3 pass / 0 fail** |
| `npm run test:blessboard:authorization` | **22 pass / 0 fail** |
| `git diff --check` | **clean** |

No query-count harness exists in-repo; correctness proven via focused service/route suites.

---

## 9. Suggested commit message

```
Cut discarded member-dashboard queries and memoize V5 EJS reads.
```
