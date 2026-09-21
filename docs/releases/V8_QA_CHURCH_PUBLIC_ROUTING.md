# V8 QA Church Public Routing (PROMPT 32)

**Verdict:** `V8_QA_CHURCH_PUBLIC_ROUTING_PASS`  
**Branch:** `V8` only  
**Church:** `bb-v8qa-mub23a6v6a6b`  
**Host:** `blessboard.neuniversity.org`

## Canonical public URL (path-public — preferred)

Existing BlessBoard convention (no new prefix, no new hostname):

| Surface | URL |
|---------|-----|
| Church home | `https://blessboard.neuniversity.org/c/bb-v8qa-mub23a6v6a6b` |
| Membership apply | `https://blessboard.neuniversity.org/c/bb-v8qa-mub23a6v6a6b/register` |
| Visitor form | `https://blessboard.neuniversity.org/c/bb-v8qa-mub23a6v6a6b/visit` |
| Announcements list | `https://blessboard.neuniversity.org/c/bb-v8qa-mub23a6v6a6b/hq/announcements` |
| Announcement detail | `https://blessboard.neuniversity.org/c/bb-v8qa-mub23a6v6a6b/announcements/:id` |

Unknown org keys under `/c/:organizationKey` return **404**. Cross-tenant announcement IDs do not render another church’s content.

## Why not a dedicated hostname

- `canonicalHostRegistry` is exact-match; Hostinger has **no wildcard DNS** for `*.blessboard.neuniversity.org`.
- Invented host `bb-v8qa-mub23a6v6a6b.blessboard.neuniversity.org` → **NXDOMAIN** (verified).
- Path-public `/c/:organizationKey` is the documented Foundation public church route.

### Optional Hostinger DNS (only if a hostname is later required)

1. In Hostinger DNS for `neuniversity.org` (or the BlessBoard product zone), add **A/AAAA** (or CNAME to the V8 Node app) for:
   - `bb-v8qa-mub23a6v6a6b.blessboard.neuniversity.org`
2. Attach the hostname to Node app `moovex-platform-v8-testing`.
3. Insert `platform.domains` row for org `bb-v8qa-mub23a6v6a6b` and allowlist the host for authoritative tenant routing.
4. Do **not** change V7/pronline DNS or production BlessBoard DNS.

Until those steps exist, use path-public URLs above — do not claim the hostname works.

## Code / data changes

- Path-public action routes: `/c/:org/register`, `/visit`, `/announcements/:id` (`pathPublicChurchActionRoutes.js`).
- Published disposable QA website + visitor form via `db/scripts/v8-qa-church-public-prepare.js` (testing DB only, `test_cleanup_eligible`).
- Regression: `tests/v8-bb-qa-church-path-public.test.js`.

V7 and production routing/DNS were not modified.
