# V8 Shared Announcement Engine (PROMPT 08)

**Verdict:** `V8_SHARED_ANNOUNCEMENT_CODE_PASS`  
**Branch:** `V8` only  
**Date:** 2026-09-21  
**Prior ancestry:** Prompt 11 `V8_SHARED_ANNOUNCEMENTS_CODE_PASS` (`8d581371`)  
**Stitch:** AN01–AN05 desktop + mobile (`projects/5087412725796049014`)  
**Hosts:** Code + local tests only (no deploy / no migration apply / no jobs / no notifications)

## Approach

Did **not** rebuild the shared announcement engine. Tip already provided tenant-scoped CRUD, draft/scheduled/published/expired/archived, lazy schedule visibility, media URL/ref picker hooks, safe plain-text rendering, append-only history, and BB/AC branding mounts.

This prompt audited website publication infrastructure, closed AN02/AN03 mobile CSS PARTIAL gaps, enforced `ends_before_starts` on update, and expanded transition tests. Automatic background scheduling remains an explicit gate.

## Website publication audit

| Surface | Role vs announcements |
|---------|------------------------|
| Church / clinic **website** publish | Separate CMS flow (`churchWebsiteAdminRoutes`, website moderation / edit sessions). Preview-ack → publish/unpublish for site pages — **not** announcement content. |
| Shared **announcement** studio (AN01–AN05) | Tenant table `tenant_announcements` + events; mounts BB `/hq|branch-admin/announcement-studio`, AC `/app/announcements`. |
| BlessBoard product announcements (BB19–BB22) | Separate product path; schedule columns + lazy member visibility; not replaced by this studio. |

Reuse: shared media path allowlist (`/_bb/media/…`, `/_ac/media/…`, HTTPS). No website CMS publish APIs activated for announcements.

## Scheduler gate (separate — not claimed working)

| Field | Value |
|-------|-------|
| **Available** | `false` |
| **Mode** | `lazy_read_time_evaluation` |
| **Constant** | `SCHEDULER_DEPENDENCY` in `tenantAnnouncementService.js` |
| **Behavior** | No worker promotes `scheduled` → `published`. Public visibility when `starts_at <= now` and (`ends_at` null or `> now`). |
| **Not enabled** | Background jobs, push/SMS/email |

## Flows

| Flow | Screens |
|------|---------|
| Admin dashboard | AN01 |
| Create / edit / save draft | AN02 |
| Schedule window + dependency banner | AN03 |
| Preview (escaped body, safe media) | AN04 |
| Confirm publish / unpublish / archive | AN05 |

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| Tenant-scoped announcement CRUD | Present |
| Draft / scheduled / published / expired / archived | Present (expired effective via lazy eval) |
| Publication start/end + timezone field | Present; **update** rejects `ends_before_starts` |
| Authorized publication and visibility | Present (view/manage authz + org/product scope) |
| Shared media picker | Present (URL + asset ref hooks; unsafe rejected) |
| Safe content rendering | Present (`presentSafe`; HTML body rejected) |
| Audit history | Present (`tenant_announcement_events` append-only) |
| Shared impl + product branding | Present (BB violet / AC teal) |
| Responsive Stitch UI | **Polished** mobile CSS for AN02/AN03 density |
| No background jobs / external notifications | Preserved |
| Additive migrations only | `042` / `111` (not applied hosted) |

## Changes in this prompt

| Area | Change |
|------|--------|
| Service | `ends_before_starts` on update; unpublish→draft covered in tests |
| CSS | Mobile stack for top/actions, form density, safe-area sticky actions; `announcements.css?v=2` |
| Views | Mobile form markers on editor/schedule |
| Tests | D/M stitch markers, mobile CSS, time bounds + unpublish history |

## Tests

- `node --test tests/v8-shared-announcements.test.js tests/blessboard-announcements.test.js` — **28/28 PASS**

## Non-goals

- Applying migrations `042` / `111` on hosted DB  
- Claiming automatic scheduled publication via a worker  
- Live notifications  
- Replacing BB19–BB22 product announcements  
- Hosted verification (not claimed)  
