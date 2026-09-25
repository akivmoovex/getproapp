# V2.01 Website Change Manager — Foundation QA

**Task:** `V2_01_WEBSITE_CHANGE_MANAGER_FOUNDATION`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment target:** `moovex-platform-v8-testing` (code foundation only — **production untouched**)  
**Products:** BlessBoard + ActiveClinic  
**Stitch:** [Website Change Manager](https://stitch.withgoogle.com/projects/12538817760086591589) (Unpublished Changes Panel, Field History and Restore, Publishing Reminder, Editor Toolbar)  

**Local SHA (working tree base):** `e5bd58adc7cf` (`e5bd58adc7cf81725ce34b463d81b8a25850f224`)  
**Hosted deploy of this foundation:** not performed in this task  

---

## Verdict

**`V2_01_CHANGE_MANAGER_FOUNDATION_PASS`**

Shared backend foundation derives pending-change counts from draft vs published content keys (not Save operations), scopes to authorized organization + website instance, audits existing version history without mutating published snapshots, and reuses existing draft/publish/media services. No new autosave. No independent counter table.

---

## Reused services (not rebuilt)

| Service | Role |
|---------|------|
| `contentService.listWebsiteContent` / `diffContentRows` / `valuesEqual` | Draft vs published comparison |
| `contentService.saveWebsiteDraft` | Existing editor saves (unchanged) |
| `contentService.discardWebsiteDraft` / `discardAllWebsiteDrafts` | Revert field / all to published |
| `publicationService.publishWebsiteDraft` | Publish clears pending diffs |
| `versionService.listWebsiteVersions` / `getWebsiteVersion` | Immutable published history |
| `reviewDiff.buildVersionDiff` | Field history presentation helpers |
| `authorizeWebsiteAction` + `permissions` / `canViewWebsiteAdmin` | Tenant + permission gates |
| `templateRegistry` / `contentTypes` | Supported field types |
| CDN / Hostinger media | Untouched; image keys remain `CONTENT_TYPES.IMAGE` |

---

## Changed / added files

| File | Change |
|------|--------|
| `src/platform/website/websiteChangeManagerService.js` | **New** — compare, summary, history audit, field history, revert wrappers |
| `src/platform/website/index.js` | Export `websiteChangeManagerService` |
| `src/platform/website/websiteManagementPresentation.js` | Unpublished count now via Change Manager compare (same derived semantics) |
| `tests/v2-01-website-change-manager-foundation.test.js` | **New** — count / revert / publish / BB+AC isolation / authz / immutability |
| `docs/qa/V2_01_CHANGE_MANAGER_FOUNDATION_QA.md` | This document |

---

## Migration / history availability

| Question | Answer |
|----------|--------|
| New migration required? | **No** |
| Independent counter table? | **No** (would drift) |
| Pending source | `platform.website_content.draft_value` ≠ `published_value` per `content_key` |
| Published history | `platform.website_versions.snapshot_json` + `changed_keys` (**immutable**; never written by Change Manager) |
| Audit trail | `platform.website_audit_events` (existing draft.save / discard / publish) |
| Historical drafts | Current unpublished keys via live draft rows; prior publish deltas via version snapshots |

---

## Supported field-level history content types

All shared `CONTENT_TYPES` are eligible when stored on content rows / version snapshots:

- `short_text`, `long_text`, `rich_text`
- `image`, `video_url`, `url`
- `email`, `phone`, `boolean`, `enum`
- `structured`

Field history is reconstructed by walking version snapshots for a `contentKey` and optionally appending the current draft tip. Entries marked `immutable: true` for published versions.

BlessBoard product overlays outside `platform.website_content` (legacy `public_pages` / Phase 7 structured drafts) remain product-side until bridged into engine keys — not counted by this foundation unless they live as content keys.

---

## API surface (`websiteChangeManagerService`)

| Function | Purpose |
|----------|---------|
| `compareDraftToPublished` | Authorized full diff + `pendingChangeCount` (distinct keys) |
| `getPendingChangeSummary` | Toolbar / Stitch badge summary |
| `auditWebsiteChangeHistory` | Pending + version inventory + storage metadata |
| `listFieldHistory` | Per-key history from snapshots + current draft tip |
| `revertFieldToPublished` | Discard one key to published; returns new count |
| `revertAllPendingToPublished` | Discard all pending drafts |

Authorization: view-capable grants for reads; `website.edit` for revert. Empty / unrelated grants → `forbidden`. Cross-org / product mismatch → not found / tenant mismatch.

---

## Tests

Command: `node --test tests/v2-01-website-change-manager-foundation.test.js`

| Case | Result |
|------|--------|
| One field changed once → count **1** | **PASS** |
| Same field saved repeatedly → count **1** | **PASS** |
| Multiple fields → correct distinct count | **PASS** |
| Revert to published decreases count | **PASS** |
| Publish clears pending changes | **PASS** |
| BB + AC tenant isolation (+ cross-tenant deny) | **PASS** |
| Unauthorized history / compare denied | **PASS** |
| Version audit does not mutate historical snapshots | **PASS** |
| Existing publish path still green after reads | **PASS** |

Also re-ran `tests/platform-website-engine.test.js`: **4/4 PASS**.

---

## Gaps (follow-up, not blockers)

| Gap | Notes |
|-----|-------|
| HTTP / UI wiring | Stitch Unpublished Changes Panel / Field History screens not mounted in this task |
| BlessBoard overlay-only fields | Counted only when synced into `platform.website_content` |
| Hosted smoke on `moovex-platform-v8-testing` | Requires deploy of this commit/diff |
| Autosave | Intentionally **not** introduced |

---

## Explicit non-actions

| Action | Done? |
|--------|-------|
| Production changes | **No** |
| Hostinger deploy / restart | **No** |
| Mutate `website_versions` history | **No** |
| New autosave loop | **No** |
| Independent change counter column/table | **No** |

---

## Verdict (restated)

**`V2_01_CHANGE_MANAGER_FOUNDATION_PASS`**
