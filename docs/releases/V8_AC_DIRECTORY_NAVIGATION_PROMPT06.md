# V8 PROMPT 06 — ActiveClinic directory navigation

**Branch:** `V8` only  
**Verdict:** `V8_AC_DIRECTORY_CODE_PASS`  
**Date:** 2026-09-21  
**Hosts:** Code + local automated tests; hosted directory read-only spot-check

## Trace (Directory → Key → URL → Route)

| Step | Implementation |
|------|----------------|
| Query | `listPublishableClinics` — active org + AC product + published HCO + directory facility |
| Present | `presentDirectoryClinic` → canonical `clinicKey` + `detailHref` |
| URL | Shared `buildPublicOrganizationWebsitePath` / `directoryClinicDetailHref` |
| Card | `public-clinic-card.ejs` full-card `<a class="acw-clinic-card__link">` |
| Route | `GET /clinics/:clinicKey` via `resolvePublishableClinicByKey` |

## Hardening in this prompt

1. **`isPublicOrganizationKey`** — shared slug guard (`^[a-z][a-z0-9_-]{0,63}$`) used by URL builder, directory presenter, resolve, and card markup.
2. **Invalid keys fail closed** — `.` / `..` / spaces / punctuation / overlong keys never become public paths; resolve returns `invalid_input` → 404.
3. **Card href** — prefers server `detailHref`; rejects mismatched `publicBasePath` overrides.
4. **Visibility** — unpublished/inactive orgs stay out of the directory; direct URLs return 403/404.
5. **Encoding** — uppercase/encoded keys redirect to canonical lowercase `/clinics/:key`.

## Tests

| Suite | Result |
|-------|--------|
| `tests/activeclinic-clinic-directory.test.js` | **14/14 PASS** |

Coverage: navigation, invalid-key, unpublished/inactive visibility, tenant isolation, mobile/desktop card markup CSS contract.

## Hosted read-only (neuniversity)

`GET /clinics` — 10 full-card links; sample follow → **200** matching clinic; missing key → **404**.

## Non-goals

- Hosted write mutations / deploy (overnight rule 10)
- Changing BlessBoard `/c` product prefix

## Preserve V7

Shared URL helpers remain the single builder; V7-compatible `/c/:key` alias redirect unchanged for ActiveClinic.
