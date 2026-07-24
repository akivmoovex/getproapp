# Phase3 Batch A — Compare, Restore, Publishing History

## Implementation note

- **Stitch screens found:** Phase3 - 06 Compare (Desktop); Phase3 - 07 Restore (Desktop + Mobile); Phase3 - 08 Publishing History **not present** in Stitch project → implemented from written spec.
- **Reused:** `websitePublicationVersionRepository/Service`, HQ version-history router, canonical `publishChurchWebsite`, HQ shell, immutable `snapshot_json`.
- **Minimal files:** migration 042, version repo/service/routes, 4 EJS views, CSS, 2 test files.
- **Immutable snapshots:** already exist; restore never mutates historical rows.
- **Blocker:** none for 06–07; 08 visual parity limited to prompt (no Stitch export).

## Routes

| Method | Path |
|--------|------|
| GET | `/hq/website/version-history/compare` |
| GET | `/hq/website/version-history/:versionId/preview` |
| GET/POST | `/hq/website/version-history/:versionId/restore` |
| GET | `/hq/website/publishing-history` |

## Migration

`042_website_version_restoration_metadata.sql` — adds `source_version_id`, `restoration_reason`, `restored_by`.
