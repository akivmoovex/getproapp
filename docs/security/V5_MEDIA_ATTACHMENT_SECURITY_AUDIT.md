# BlessBoard V5 — Media and attachment security audit

**Date:** 2026-07-19  
**Constraint:** Audit + clear defect fixes only. No storage-provider or schema changes. No malware scanning claims.  
**Companions:** [`V5_INPUT_OUTPUT_SAFETY_AUDIT.md`](./V5_INPUT_OUTPUT_SAFETY_AUDIT.md) · [`V5_CSRF_ACTION_AUDIT.md`](./V5_CSRF_ACTION_AUDIT.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Explicit MIME + extension allowlists + magic-byte validation? | **YES** |
| SVG / HTML / exe / unrecognized signatures rejected? | **YES** |
| Size limits enforced server-side? | **YES** (multer + `validateMediaFile`) |
| Cross-tenant list/download/archive denied? | **YES** |
| Media archive requires auth + CSRF? | **YES** (soft-archive; no hard-delete HTTP) |
| Announcement attachments audience-gated at download? | **YES** (fixed this pass) |
| Architecture / storage provider changed? | **NO** |

---

## 2. Upload / download paths reviewed

| Path | Role |
|------|------|
| `POST …/content/media/upload` | Authz’d HQ/BA upload (CSRF) |
| `GET …/content/media` | Authz’d picker list (church-scoped DTO) |
| `POST …/content/media/:id/archive` | Soft-archive (CSRF) |
| `GET …/content/media/:id` | Admin private preview |
| `GET /_bb/media/:assetId` | Public visibility only, tenant church match |
| Forms/requests `…/file` | Private attachment download (ownership/scope) |
| Announcement `…/attachments/:attachmentId/file` | Private announcement attachment download (**new**) |

Core modules: `validateMediaFile.js`, `mediaConstants.js`, `generateStorageKey.js`, `mediaUploadService.js`, `contentAdminRoutes.js`, `publicMediaRoutes.js`, announcement + forms download routes.

---

## 3. Controls verified

| Control | Status |
|---------|--------|
| Allowed MIME explicit | **PASS** — jpeg/png/webp/gif/pdf |
| Allowed extensions explicit | **PASS** — per-MIME list; mismatch rejected |
| Size limits server-side | **PASS** — 5 MiB images / 15 MiB docs + multer cap |
| MIME ↔ signature mismatch rejected | **PASS** |
| Filename display normalization | **PASS** — `sanitizeOriginalFilename` |
| Storage key non-traversable | **PASS** — `blessboard/<churchUuid>/<objectUuid>/<safeName>` + `isSafeStorageKey` |
| No arbitrary local path requests | **PASS** — UUID → DB key only |
| Tenant/church authz on download | **PASS** |
| Cross-tenant cannot list/select | **PASS** |
| Delete (archive) authz + CSRF | **PASS** |
| In-use protections | **SOFT** — soft-archive only; FK `RESTRICT` if hard-deleted; no reference scan API |
| Content-Disposition safe | **PASS** — CRLF/`"` stripped; `attachment` on private downloads |
| Executable/script uploads rejected | **PASS** |
| SVG disallowed | **PASS** |
| Upload errors no internal paths | **PASS** — generic reasons; picker copy sanitized |
| Storage keys/credentials not rendered | **PASS** — list/upload DTO + picker source checks |
| Attachment audience restrictions | **PASS** — download only after member/admin announcement access |

---

## 4. Defects found

| ID | Issue |
|----|-------|
| A | Announcement attachments uploaded as **private** but linked via public `/_bb/media` (403 for recipients; “fix” by making public would bypass audience) |
| B | `removeAnnouncementAttachment` treated `churchId` as optional (latent; not HTTP-mounted) |

---

## 5. Fixes made

| Fix | Detail |
|-----|--------|
| Authenticated attachment downloads | `GET …/announcements/:id/attachments/:attachmentId/file` (member + HQ/BA) using `loadMediaBytes(allowPrivate: true)` + `sendPrivateMediaDownload` |
| Templates | Member detail, admin form/detail use authz URLs; no `/_bb/media` for announcement attachments |
| Attach policy | Announcement attach requires media `visibility === 'private'` + same church + active |
| Detach harden | `removeAnnouncementAttachment` requires church UUID and enforces church match |

Shared helper: `src/blessboard/http/sendPrivateMediaDownload.js`.

---

## 6. Tests added / extended

| Coverage | Where |
|----------|--------|
| MIME + extension mismatch | `tests/blessboard-media.test.js` |
| Content-Disposition CRLF/`"` sanitization | same |
| Same-church private attach; reject public/foreign | `tests/blessboard-announcements.test.js` |
| Authz download, public path blocked, cross-tenant denied, no storage leak in HTML | same |

Existing media suite already covered SVG/exe/size/CSRF upload+archive/cross-tenant list/archive/picker path exclusion.

---

## 7. Limitations (operational)

| Topic | Note |
|-------|------|
| No malware / AV scanning | Do not claim files are virus-scanned |
| Soft-archive only | Objects retained; no automated “in use” report |
| Church-wide media library | Same-church branch admins can see all church assets (not cross-tenant) |
| Supabase public CDN | Public assets may 302 to CDN URL after church checks; private uses signed URL when adapter has no `read` |
| UUID secrecy | Public `/_bb/media` is UUID-addressable for **public** assets on the tenant host — keep announcement attachments private |

---

## 8. Suggested commit message

```
Add authz-gated announcement attachment downloads and document media security.
```
