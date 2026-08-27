# BlessBoard classic CMS — draft routing contract

The classic CMS (`/hq/content`, `/branch/:key/content`) predates the shared V7
website engine. This document is the authoritative classification of every
editable field it exposes.

Invariant: **no ordinary editable field modifies live content directly.** Every
field is exactly one of:

- `DRAFT_ROUTED` — an edit on published content is rewritten into a shared-engine
  draft, previewable, and only reaches the public site at publish time.
- `READ_ONLY` — locked once the row is live because no draft representation
  exists; changed through the visual website editor instead.
- `DEPRECATED_AND_REPLACED_BY_VISUAL_EDITOR` — no longer exposed in the classic UI.

Draft rows (not yet published) remain freely editable in place; the guard only
applies to rows whose `status = 'published'`.

## Enforcement points

| Layer | File | Role |
|---|---|---|
| HTTP routing | `src/blessboard/http/contentAdminRoutes.js` | `routePublishedSectionEditToDraft`, `routePublishedEntityEditToDraft` rewrite live edits into drafts |
| Service guard | `src/blessboard/services/publicContentAdminService.js` | `isEditorFormWrite` + `mutatesPublishedContent` refuse any editor write that would mutate a published row (defense in depth) |
| Draft store | `websiteInlineFieldDrafts`, `websiteStructuredDrafts` | canonical draft representation |
| Preview | `websiteStructuredDraftService.applyStructuredDraftsToModel` | overlays drafts onto the public page model |
| Publish | `websiteDraftApplyService.applyWebsiteDraftsInTransaction` | applies drafts to the public projection in the publish transaction |

## Page form — `views/blessboard/v5/content-admin/page.ejs`

| Field / action | Classic UI | Draft routed | Previewable | Publishable | Status |
|---|---|---|---|---|---|
| `title` | text (readonly when live) | n/a | n/a | n/a | `READ_ONLY` |
| `status` | select | n/a | n/a | yes | publication control, not content |
| `section_key` / add section | create form | n/a (creates a draft row) | yes | yes | `DRAFT_ROUTED` |

## Section form — `views/blessboard/v5/content-admin/section.ejs`

| Field / action | Classic UI | Draft routed | Previewable | Publishable | Status |
|---|---|---|---|---|---|
| `heading` | text | yes — inline field draft (`heading`) | yes | yes | `DRAFT_ROUTED` |
| `body_text` | textarea | yes — inline field draft (`bodyText`) | yes | yes | `DRAFT_ROUTED` |
| `media_url` | text + media picker | yes — structured `image` draft | yes | yes | `DRAFT_ROUTED` |
| `media_alt_text` | text (added in Phase 3) | yes — same `image` draft | yes | yes | `DRAFT_ROUTED` |
| `sort_order` | number | yes — structured `page_section` `reorder` draft | yes | yes | `DRAFT_ROUTED` |
| `section_type` | text (readonly when live) | n/a | n/a | n/a | `READ_ONLY` |
| `status` | select | n/a | n/a | yes | publication control, not content |

Accessibility policy for media: a structured `image` draft is rejected when a
URL is present without alt text (`websiteStructuredDraftValidation`). The classic
form pre-fills `media_alt_text` from the live `layout_metadata.altText`, and a
request that omits the field entirely keeps the existing alt text rather than
clearing it. No alt text is ever invented.

## Entity forms — `views/blessboard/v5/content-admin/entities.ejs`

Applies to `leadership`, `ministries`, `events`, `sermons`, `giving`, `contact`.
Content fields are routed into a structured `upsert` draft for the item; a
changed `sort_order` is routed into a separate `reorder` draft that records the
whole intended collection order.

| Field / action | Classic UI | Draft routed | Previewable | Publishable | Status |
|---|---|---|---|---|---|
| Leadership: `display_name`, `role_title`, `biography`, `image_url` | form | yes — `leader` upsert draft | yes | yes | `DRAFT_ROUTED` |
| Ministries: `name`, `summary`, `description`, `meeting_day`, `contact_email`, `image_url` | form | yes — `ministry` upsert draft | yes | yes | `DRAFT_ROUTED` |
| Events: `title`, `summary`, `starts_at`, `ends_at`, `timezone`, `location`, `registration_url`, `image_url` | form | yes — `event` upsert draft | yes | yes | `DRAFT_ROUTED` |
| Sermons: `title`, `speaker_name`, `preached_at`, `summary`, `media_url`, `resource_url` | form | yes — `sermon` upsert draft | yes | yes | `DRAFT_ROUTED` |
| Giving: `method_type`, `label`, `description`, `account_details`, `instructions`, `external_url`, `button_label`, `qr_image_url` | form | yes — `giving_method` upsert draft | yes | yes | `DRAFT_ROUTED` |
| Contact: `channel_type`, `label`, `value` | form | yes — `social_link` upsert draft | yes | yes | `DRAFT_ROUTED` |
| `sort_order` (all collections) | number | yes — `reorder` draft on `collection:<kind>:order` | yes | yes | `DRAFT_ROUTED` |
| `status` | select | n/a | n/a | yes | publication control, not content |
| `q`, `when` (list filters) | inputs | n/a | n/a | n/a | read-only query params |

## Reorder draft semantics

A reorder draft records an explicit ordered key list, not a relative move, so it
reproduces the intended order deterministically even if other sort values change
meanwhile.

- Section ordering: `draft_kind = 'page_section'`, `entity_key = 'page:<pageKey>:section-order'`,
  `payload.order` = section keys.
- Collection ordering: `draft_kind = '<entity kind>'`,
  `entity_key = 'collection:<routeKey>:order'`, `payload.order` = entity ids.

Idempotency:

- `upsertStructuredDraft` keys on church, branch, kind, page, section and entity
  key, so repeated saves update one draft row instead of accumulating rows.
- A duplicated id in `payload.order` is rejected as a corrupt payload.
- `orderedStructuredDrafts` applies reorder operations after upserts and removes,
  so ordering always settles last within a publish transaction.
- Reverting to the original order before publishing publishes as a no-op move.
- Publishing clears all draft rows, leaving no orphan ordering operations.

## Lifecycle guarantee

```
CURRENT PUBLIC STATE
  -> save (classic form)      => draft row only, public unchanged
  -> preview                  => draft overlay visible
  -> publish                  => public projection updated, version captured
  -> restore previous version => new draft, public still unchanged until published
```

Covered by `tests/v7-classic-cms-media-order-drafts.test.js` and
`tests/v7-website-engine-contract.test.js`.
