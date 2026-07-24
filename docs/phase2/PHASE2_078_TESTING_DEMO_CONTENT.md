# PHASE2_078 — Testing demo content for church website

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 testing/demo data only  
**Org target:** `automated-test-church` / BlessBoard Automated Test Church  
**Follows:** `docs/phase2/PHASE2_077_CHURCH_WEBSITE_PREVIEW_PUBLISH_AUDIT.md`

## Objective

Populate Stitch-shaped public CMS content so HQ preview and published mini-sites look complete during manual testing on the **testing** deployment.

## What was added

| Path | Role |
|------|------|
| `src/blessboard/services/testingWebsiteDemoContentSpec.js` | Fictional demo copy, media paths, relative dates |
| `src/blessboard/services/testingWebsiteDemoContentService.js` | Env gate + idempotent fill-empty / refresh seed |
| `db/scripts/blessboard-testing-demo-content-seed.js` | CLI (`--diagnose`, `--apply`, `--organization-key`, `--refresh-demo-content`) |
| `tests/blessboard-testing-demo-content-seed.test.js` | Safety + content + overwrite/refresh tests |
| `package.json` | `blessboard:testing-demo-content:seed`, `test:blessboard:testing-demo-content-seed` |

## Content categories

- Church identity (display name, tagline, welcome, mission, vision, values)
- Home hero (+ static `/church/images/…` media)
- Service times (Sunday, midweek, prayer)
- HQ address / phone / email (+ map coords for OSM)
- 3 leadership profiles with safe image placeholders
- 4 ministries (children, youth, women, men/outreach)
- 3 upcoming events (future-relative to seed `d0`)
- 4 sermons (category encoded in summary prefix — no DB category column)
- 3 member announcements (requires existing actor email)
- Giving intro + TEST-ONLY bank instructions (`DEMO-00-0000`)
- Contact intro, office hours, channels + social placeholders (`example.test`)
- Footer: quick links / copyright from public shell; socials as contact channels

## Safety / idempotency

| Rule | Behavior |
|------|----------|
| Testing only | Requires `DEPLOYMENT_ENV=testing` or `NODE_ENV=test` (or `BLESSBOARD_ALLOW_TESTING_DEMO_CONTENT=true` in non-production). Refuses `DEPLOYMENT_ENV=production`. Hostinger testing may use `NODE_ENV=production` **with** `DEPLOYMENT_ENV=testing`. |
| Default | Fill empty / create missing demo-marked rows only |
| `--refresh-demo-content` | Updates demo-owned rows (`[Demo]` / `bb_demo` tool marker); never user-owned sections |
| No deletes | No `DELETE` / `TRUNCATE` of content |
| No real PII / banking | `example.test`, `+1-555-…`, `DEMO-00-0000` |
| No V4 | Does not touch `public.tenants` / `public.session` |
| Identity | CLI requires `DATABASE_IDENTITY_EXPECTED` match + no legacy public tables |

## Tests

```bash
npm run test:blessboard:testing-demo-content-seed
```

**Result (2026-07-24):** 15/15 pass.

## Hostinger apply command

From the V5 app root on the testing Hostinger host (replace `<NODE_BINARY>` with `which node` / hosted Node path):

```bash
DEPLOYMENT_ENV=testing \
DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5' \
<NODE_BINARY> db/scripts/blessboard-testing-demo-content-seed.js --apply \
  --organization-key=automated-test-church
```

Diagnose first (no writes):

```bash
DEPLOYMENT_ENV=testing \
DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5' \
<NODE_BINARY> db/scripts/blessboard-testing-demo-content-seed.js --diagnose \
  --organization-key=automated-test-church
```

Refresh demo-owned rows only:

```bash
DEPLOYMENT_ENV=testing \
DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5' \
<NODE_BINARY> db/scripts/blessboard-testing-demo-content-seed.js --apply \
  --organization-key=automated-test-church \
  --refresh-demo-content
```

Announcements need an existing staff user (default `--actor-email=church-hq-admin@example.test` from test-users seed).

## Notes

- Hero CTAs remain template-driven (`home.ejs` → `/events`, `/giving`).
- Admin CMS preview may still look sparse until preview uses public templates (077 batch 6).
- After seed, publish the website from `/hq/website` if `website_status` was draft and readiness gaps are cleared.
