# BlessBoard V5 — Input validation and output escaping audit

**Date:** 2026-07-19  
**Constraint:** Audit + clear defect fixes only. No validation-library migration, schema changes, or new rich-text support.  
**Companions:** [`V5_CSRF_ACTION_AUDIT.md`](./V5_CSRF_ACTION_AUDIT.md) · [`V5_SESSION_COOKIE_AUDIT.md`](./V5_SESSION_COOKIE_AUDIT.md) · [`V5_AUTHORIZATION_MATRIX.md`](./V5_AUTHORIZATION_MATRIX.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Write-time validation (trim, length, allowlists, UUID, HTTPS/media URLs)? | **YES** (service + route layer) |
| `javascript:` / unsafe `data:` rejected for links? | **YES** (write + render) |
| User content escaped via EJS `<%= %>`? | **YES** for titles, bodies, filenames, errors |
| Deliberate unescaped HTML limited to trusted slots? | **YES** (`bodyHtml` / `actionsHtml` / includes) |
| Clear defect fixed this pass? | **YES** — announcement `actionUrl` re-sanitized at render; list page capped |
| Architecture redesigned? | **NO** |

---

## 2. Input surfaces reviewed

| Surface | Primary validators |
|---------|-------------------|
| Settings / identity | `settingsValidation.js`, `createBlessBoardUser`, `assignBlessBoardRole` |
| Member registration / portal | `memberRegistrationService`, `memberPortalService` |
| Public content admin | `publicContentAdminService` (`httpsMediaUrl`, `rejectHtml`, status allowlists) |
| Announcements | `announcementsService` (`plainText`, `httpsOrMediaUrl`, audiences/status) |
| Forms / requests | `formSchema.js`, `formsRequestsService` |
| Giving / attendance / participation | respective services (money/date/count allowlists) |
| Media upload | `validateMediaFile`, MIME magic bytes, `sanitizeOriginalFilename` |
| Platform admin lists | `normalizeListInput` (page ≤10000, limit allowlist, org-key `q`) |
| Query filters | Route normalizers (`filter`, `status`, `audience`, `q` ≤100); LIKE wildcards stripped |
| Auth redirect `next` | `sanitizeReturnPath` / `safeTenantNextPath` |

---

## 3. Unescaped output locations reviewed

| Location | Kind | Risk |
|----------|------|------|
| Almost all V5 `<%-` | `include(...)` only | None |
| `apex/page.ejs` `bodyHtml` | Server-composed marketing/tenant landing HTML | Trusted caller |
| `page-header.ejs` / `modal-shell.ejs` `actionsHtml` / `bodyHtml` | Design-system slots | Unused or trusted markup today |
| Announcement / public / forms user fields | `<%= %>` | Escaped |

---

## 4. Controls checked

| Control | Status |
|---------|--------|
| Required string trim + length limits | **PASS** |
| Email normalization | **PASS** (user create / settings) |
| Phone validation where supported | **PASS** (E.164-style) |
| UUID validation on route params | **PASS** |
| Date / numeric validation | **PASS** (attendance, giving, reports) |
| Pagination bounds | **PASS** (platform); announcements list now capped at page 10000 |
| Sort allow-lists | **PASS** / N/A (ORDER BY caller constants, not request) |
| Status / role / plan-key allow-lists | **PASS** |
| Org/church/branch identifiers | **PASS** (keys + UUIDs + authz scope) |
| URL protocol allow-lists | **PASS** (write HTTPS/media; render `safeExternalUrl`) |
| Reject `javascript:` / unsafe `data:` | **PASS** |
| Filename presentation safety | **PASS** (sanitize + escaped display + CRLF strip on download) |
| EJS escaped user content | **PASS** |
| Rich text | **N/A** — HTML rejected at write (`rejectHtml`) |
| Validation errors without payload echo | **PASS** (mapped messages) |
| DB errors not rendered raw to users | **PASS** in announcement/admin HTML (`errorMessage` generic); service `reason` may hold PG text internally |
| Search filters vs dynamic SQL | **PASS** (parameterized; `q` wildcards stripped) |

---

## 5. Defects found and fixes

| Issue | Fix |
|-------|-----|
| Announcement `actionUrl` emitted in `href` without render-time allowlist (unlike public pages) | `presentAnnouncementForRender` applies `safeExternalUrl` in admin load + member detail |
| Announcement admin list `page` had no upper bound | Cap at `MAX_LIST_PAGE = 10000` (same ceiling as platform lists) |

Files: `announcementsService.js`, `announcementAdminRoutes.js`, `announcementMemberRoutes.js`.

---

## 6. Tests added

| Coverage | Where |
|----------|--------|
| Unsafe protocols, overlong action URL, UUID shape, pagination bounds, present-strip, escaped markup render | `tests/blessboard-v5-input-output-safety.test.js` (`npm run test:blessboard:input-output-safety`) |
| Write reject + SQL-bypass render strip/escape (member + admin detail) | `tests/blessboard-announcements.test.js` |

Existing: `blessboard-public-pages` (XSS + unsafe URL strip), media, forms-requests, settings, platform-admin pagination.

---

## 7. Remaining risks

| Topic | Note |
|-------|------|
| Write HTTPS vs render `http:` allow | Intentional asymmetry with public content; document only |
| `mapDbError` retains PG message as `reason` | UI maps unknown reasons to generic copy; JSON/API callers must not echo `reason` blindly |
| DB CHECK / direct SQL can store unsafe `action_url` | Mitigated by render present; no schema change |
| `bodyHtml` / `actionsHtml` escape hatches | Safe only while callers stay trusted |
| No rich-text product | Keep rejecting HTML tags; do not add sanitizer libraries without product decision |
| Announcement list `status` query not allow-listed | Parameterized equality; unknown status → empty list |

---

## 8. Suggested commit message

```
Harden V5 announcement action URL rendering and document input/output safety.
```
