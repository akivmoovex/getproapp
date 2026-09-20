# V8 PROMPT 11 — Shared announcement publication (AN01–AN05)

**Branch:** `V8` only  
**Verdict:** `V8_SHARED_ANNOUNCEMENTS_CODE_PASS`  
**Date:** 2026-09-21  
**Stitch:** https://stitch.withgoogle.com/projects/5087412725796049014  
**Hosts:** Code + local automated tests only (no deploy / no migration apply / no real notifications)

## Scheduler dependency (explicit)

| Field | Value |
|-------|-------|
| **Available** | `false` |
| **Mode** | `lazy_read_time_evaluation` |
| **Constant** | `SCHEDULER_DEPENDENCY` in `tenantAnnouncementService.js` / BB `announcementsService.js` |
| **Behavior** | No background worker promotes `scheduled` → `published`. Public visibility is evaluated at read time when `starts_at <= now` and (`ends_at` is null or `ends_at > now`). |
| **Not enabled** | Job runners, live push/SMS/email delivery |

## Flows

1. **AN01 Dashboard** — tenant list with stored + effective status, desktop table / mobile cards  
2. **AN02 Editor** — CRUD, plain-text body, timezone, starts/ends, shared media URL/ref picker hook, publication history  
3. **AN03 Scheduling** — schedule window + dependency banner  
4. **AN04 Preview** — escaped plain-text preview, safe media URL only  
5. **AN05 Confirm publish** — publish / unpublish / archive with CSRF; history events append-only  

## Implementation

| Area | Detail |
|------|--------|
| Migration (platform, additive, not applied overnight) | `db/migrations/platform/042_shared_tenant_announcements.sql` — `tenant_announcements` + append-only `tenant_announcement_events` |
| Migration (BlessBoard, additive) | `db/migrations/blessboard/111_announcement_schedule_v8.sql` — `timezone` / `starts_at` / `ends_at`; statuses `scheduled` / `expired` |
| Service | `src/platform/announcements/tenantAnnouncementService.js` — CRUD, confirm_publish, lazy status, `presentSafe` |
| Routes | `src/platform/http/sharedAnnouncementRoutes.js` |
| Mounts | BB `/hq/announcement-studio` + `/branch-admin/announcement-studio`; AC `/app/announcements` |
| Branding | `.mx-ann--blessboard` violet `#6C5CE7` · `.mx-ann--activeclinic` teal `#0F766E` |
| BB V7 path | Existing `/hq/announcements` retained; schedule columns + lazy member visibility wired |

### Stitch map

| Screen | Desktop / Mobile IDs | View |
|--------|----------------------|------|
| AN01 | `2548631d…` / `564a0bb9…` | `dashboard.ejs` |
| AN02 | `d0e3215d…` / `a544879a…` | `editor.ejs` |
| AN03 | `3de8e29a…` / `daca949b…` | `schedule.ejs` |
| AN04 | `434f00e8…` / `1f2bedee…` | `preview.ejs` |
| AN05 | `13e67605…` / `1fa20fd7…` | `confirm-publish.ejs` |

## Tests

- `tests/v8-shared-announcements.test.js` — **9/9 PASS** (states, schedule, safety, RBAC/isolation, stitch markers, migrations, V7 insert)
- `tests/blessboard-announcements.test.js` — **18/18 PASS** (V7 product path regression)

## Non-goals

- Applying migrations `042` / `111` on hosted testing DB  
- Background scheduler or live notification delivery  
- Replacing BlessBoard product announcements (BB19–BB22) with the shared studio  

## Preserve V7

Classic draft/published/archived rows remain valid; new schedule columns default (`timezone=UTC`, null starts/ends). Member feed includes lazy window checks without requiring a worker.
