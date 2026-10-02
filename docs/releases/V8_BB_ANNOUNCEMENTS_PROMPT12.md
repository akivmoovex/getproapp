# V8 PROMPT 12 — BlessBoard announcements (BB19–BB22)

**Branch:** `V8` only  
**Verdict:** `V8_BB_ANNOUNCEMENTS_CODE_PASS`  
**Date:** 2026-09-21  
**Prerequisite:** Prompt 11 (`V8_SHARED_ANNOUNCEMENTS_CODE_PASS`)  
**Stitch:** https://stitch.withgoogle.com/projects/5087412725796049014  
**Hosts:** Code + local automated tests only (no deploy / no migration apply / no real notifications)

## Flows

1. **Admin (BB19–BB20):** HQ `/hq/announcements` and branch `/branch-admin/announcements` → create/edit → preview → publish now or timed visibility  
2. **Visitor (BB21–BB22):** Church website `/announcements` list → `/announcements/:id` detail  

## Requirements covered

| Requirement | Implementation |
|-------------|----------------|
| HQ-wide vs branch visibility | Church site shows `branch_id IS NULL` only; branch mini-site shows church-wide + matching branch |
| Authorized edit/publish | Existing `announcements.manage` / `announcements.publish` gates; platform publish policy unchanged |
| Shared media | Existing media picker attachments on admin form |
| No unpublished/expired public | Public audience + lazy effective published window only |
| Responsive layouts | Desktop/mobile markers + public CSS |
| Publication audit history | `platform.audit_events` listed on admin detail |
| No live notifications | Explicit copy + no delivery hooks |

### Scheduler

`SCHEDULER_DEPENDENCY.available = false` — timed notices become visible at read time when `starts_at <= now`.

## Implementation

| Area | Detail |
|------|--------|
| Migration (additive, not applied) | `112_announcement_public_audience_v8.sql` — audience key `public` |
| Service | `listPublicWebsiteAnnouncements` / `getPublicWebsiteAnnouncement` / `listAnnouncementPublicationHistory` |
| Public | `/announcements` via tenant public pages; detail via `announcementPublicRoutes.js` |
| Admin | Schedule/window fields, public audience checkbox, publish timed mode, history panel |
| Nav | Announcements in public Media group |

### Stitch map

| Screen | Desktop / Mobile | Surface |
|--------|------------------|---------|
| BB19 | `97f4a027…` / `9f03f527…` | `admin-list.ejs` |
| BB20 | `58231967…` / `82d2eb92…` | `admin-form.ejs` / publish |
| BB21 | `56a52063…` / `277a1a7f…` | `public/announcements.ejs` |
| BB22 | `41278eb4…` / `c9a739da…` | `public/announcement-detail.ejs` |

## Tests

- `tests/v8-bb-announcements.test.js` — **6/6 PASS**
- `tests/blessboard-announcements.test.js` — **18/18 PASS** (V7 GUI regression)

## Non-goals

- Applying migration `112` on hosted DB  
- Background scheduler or push/SMS/email delivery  
- Replacing shared Moovex studio (AN01–AN05)
