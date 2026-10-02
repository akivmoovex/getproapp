# V8 BlessBoard Announcements (PROMPT 09)

**Verdict:** `V8_BB_ANNOUNCEMENTS_CODE_PASS`  
**Branch:** `V8` only  
**Date:** 2026-09-21  
**Prerequisites:** Prompt 08 `V8_SHARED_ANNOUNCEMENT_CODE_PASS`  
**Prior ancestry:** Prompt 12 `V8_BB_ANNOUNCEMENTS_CODE_PASS` (`b413d2ec`)  
**Stitch:** BB19–BB22 desktop + mobile (`projects/5087412725796049014`)  
**Hosts:** Code + local tests only (no deploy / no migration apply / no live notifications)

## Approach

Did **not** rebuild HQ/branch admin or public website announcements. Tip already provided create → preview → publish → public list/detail with HQ-wide vs branch visibility, public audience, lazy schedule windows, media picker, and publication history.

This prompt added consistent BB19–BB22 D/M screen markers, public mobile CSS density, unpublish/cross-church coverage, and synced `tenant-public.css?v=62` cache pins.

## Flows

| Flow | Screens |
|------|---------|
| HQ / branch admin list | BB19 |
| Create / edit / confirm publish | BB20 |
| Public church website list | BB21 |
| Public announcement detail | BB22 |

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| HQ-wide and branch-local announcements | Present |
| Authorized edit/publish/unpublish | Present (`announcements.manage` / `announcements.publish`) |
| Shared announcement + media services | Present (BB service + shared media picker; studio remains AN01–AN05) |
| Public list and detail | Present (`/announcements`, `/announcements/:id`) |
| No unpublished / unauthorized / expired public | Present (public audience + lazy effective published) |
| Correct church/branch URLs | Present (HQ site church-wide only; branch site includes matching + church-wide) |
| Existing BlessBoard website styling | Present (`tenant-public.css`) |
| Desktop/mobile Stitch parity | **Markers + mobile CSS** BB19–BB22 |
| Publication history | Present (admin detail `data-publication-history`) |
| No live notification delivery | Preserved (explicit copy; no delivery hooks) |

## Scheduler note

`SCHEDULER_DEPENDENCY.available=false` — timed notices become visible at read time when `starts_at <= now`. No background worker claimed.

## Changes in this prompt

| Area | Change |
|------|--------|
| Views | `data-bb-screen-desktop/mobile` BB19–BB22 on admin + public surfaces |
| CSS | Public announcement mobile density; `tenant-public.css?v=62` + model pins |
| Tests | D/M markers, history/media markers, unpublish + cross-church isolation |

## Tests

- `node --test tests/v8-bb-announcements.test.js tests/blessboard-announcements.test.js` — **25/25 PASS**

## Non-goals

- Applying migration `112` on hosted DB  
- Background scheduler or push/SMS/email  
- Replacing shared Moovex studio (AN01–AN05)  
- Hosted verification (not claimed)  
