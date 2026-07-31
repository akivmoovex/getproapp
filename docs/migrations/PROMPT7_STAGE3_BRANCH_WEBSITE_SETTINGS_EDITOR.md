# Prompt 7 Stage 3 — Branch website settings editor

**Status:** Implemented (local ephemeral tests).  
**Do not deploy automatically.**  
**Foundation:** Stage 1 (`052`) + Stage 2 (`053` + resolver / JSON API).  
**Verdict:** `STAGE_3_READY_FOR_REVIEW`

## Objective

Server-rendered HQ editor so administrators can see and manage inheritance states for branch website settings without using raw JSON as the primary experience.

## UI architecture

| Piece | Location |
|-------|----------|
| View model | `src/blessboard/services/branchWebsiteSettingsEditorView.js` |
| Routes | `src/blessboard/http/websiteScopeSettingsAdminRoutes.js` |
| Template | `views/blessboard/v5/hq/branch-website-settings.ejs` |
| Styles | `public/blessboard/v5/hq-admin.css` (`.bb-hq-branch-settings*`) |

Primary route: `GET|POST /hq/website/branches/:branchKey/settings`  
JSON remains available via `Accept: application/json`, `?format=json`, or XHR.

### Form actions (single endpoint)

| `action` | Effect |
|----------|--------|
| `override` | Create/update active override (empty text rejected) |
| `reset` | Deactivate override → inherit again |
| `restore` | Same as reset; used after hide |
| `hide` | Hidden state (governance-gated) |
| `clear_service_times` | Publish empty branch service-time entries (church rows untouched) |

Client-supplied `organizationId` / `churchId` / `branchId` are ignored; scope comes from the authenticated tenant + URL `branchKey`.

## State labels

| State | Label |
|-------|-------|
| inherited | Inherited from church |
| branch_record | Using branch information |
| overridden | Overridden for this branch |
| hidden | Hidden on branch website |
| locked | Locked by HQ policy |
| missing | No value available |

## Service times

Structured section only (not generic setting rows). Shows branch-local vs church fallback, links to `/hq/website/branches/:branchKey/service-times`, warns that adding branch times stops fallback, and supports clear-local when product rules allow.

## Tests

```bash
node --test tests/blessboard-prompt7-stage3-website-settings-editor.test.js
node --test tests/blessboard-prompt7-stage1-website-governance.test.js tests/blessboard-prompt7-stage2-website-settings.test.js
node --test tests/blessboard-branch-mini-websites.test.js tests/blessboard-branch-mini-website-pages.test.js tests/blessboard-branch-mini-website-shell.test.js
node --test tests/blessboard-public-pages.test.js
```

## Deferred (Stages 4–8)

Collections, branch giving methods, trusted direct publishing, urgent-update path, final Stitch visual parity.

## No new migration

Stage 3 uses existing `website_scope_settings` + governance tables. No schema change.
