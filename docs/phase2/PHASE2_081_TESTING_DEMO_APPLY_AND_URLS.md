# PHASE2_081 — Testing demo content apply & tenant URL confirmation

**Date:** 2026-07-24  
**Scope:** BlessBoard V5 testing database + live `blessboard.org` path-public routes  
**Org:** BlessBoard Automated Test Church (`automated-test-church`)  
**Constraint:** No destructive deletes/truncates; no `--refresh-demo-content`; no application code changes

## Verdict

**READY_WITH_GAPS**

Demo content was diagnosed and applied successfully to the testing database. Canonical live public route is path-based `/c/automated-test-church` on `blessboard.org`. Public pages return **200** with published seed content. Authenticated HQ preview returns **200**, includes the preview banner, and shows draft content that public omits.

**Gap:** Live Hostinger still serves the legacy sparse `content-admin/preview.ejs` chrome (`bb-ca-preview-banner`, CSS `?v=30`), not the local 079 shared public-shell renderer. Functional draft/publish separation works; Stitch-parity preview UI awaits Hostinger deploy of 079.

## 1–2. Database identity & deployment env

| Check | Value |
|-------|--------|
| `DATABASE_URL` host | `aws-0-eu-central-1.pooler.supabase.com` (Supabase pooler) |
| Database | `postgres` |
| `platform.database_identity.identity_key` | `blessboard-platform-v5` |
| `environment_code` | `testing` |
| CLI `DEPLOYMENT_ENV` | `testing` (set for seed; `.env` had `NODE_ENV=production` without `DEPLOYMENT_ENV`) |
| `DATABASE_IDENTITY_EXPECTED` | `blessboard-platform-v5` |

Confirmed: active `DATABASE_URL` is the BlessBoard V5 **testing** identity database (not GetPro V4).

## 3–4. Organization & canonical route

| Field | Value |
|-------|--------|
| Organization key | `automated-test-church` |
| Church key | `automated-test-church` |
| Display name | BlessBoard Automated Test Church |
| Org `data_environment` | `testing` |
| Catalogue domain row | `automated-test.blessboard.test` (canonical, primary) — **not** a live public DNS host |
| **Live public route type** | **`/c/:organizationKey` path-public on apex** |

Live probe: `https://blessboard.org/c/automated-test-church` → **200** (after seed: published site).  
`www.blessboard.org` → 301 → `blessboard.org`.

Tenant-host routing for this org is not the live manual-test path.

## 5. Exact live URLs

### Public homepage

`https://blessboard.org/c/automated-test-church`

### HQ (session-scoped on apex; Platform Admin)

| Surface | URL |
|---------|-----|
| HQ home | `https://blessboard.org/hq` |
| Announcements | `https://blessboard.org/hq/announcements` |
| Website editor / content | `https://blessboard.org/hq/content` |
| Website status UI | `https://blessboard.org/hq/website` |

### Preview

| Page | URL |
|------|-----|
| Home | `https://blessboard.org/hq/content/preview/home` |
| About | `https://blessboard.org/hq/content/preview/about` |
| Leadership | `https://blessboard.org/hq/content/preview/leadership` |
| Ministries | `https://blessboard.org/hq/content/preview/ministries` |
| Events | `https://blessboard.org/hq/content/preview/events` |
| Sermons | `https://blessboard.org/hq/content/preview/sermons` |
| Contact | `https://blessboard.org/hq/content/preview/contact` |
| Giving | `https://blessboard.org/hq/content/preview/giving` |

Also public suffixes:  
`/c/automated-test-church/{about,leadership,ministries,events,sermons,contact,giving}`

## 6–8. Seed diagnose & apply

### Diagnose

```text
mode=diagnose ok=true status=planned
organization_key=automated-test-church
actions=51 refresh=false
action_counts: already_present=7, planned=44
```

### Apply (no refresh)

```text
mode=apply ok=true status=applied
organization_key=automated-test-church
actions=51 refresh=false
action_counts: already_present=6, applied=44, skipped=1
```

`--refresh-demo-content` was **not** used.

## 9. Demo content verified (read-only)

| Content | Status |
|---------|--------|
| Website status | `published` |
| Home hero | published + media `/church/images/tenant-public/home-desktop-hero.jpg` |
| Service times | published; **pre-existing** “Demo Service / Kafue Rd” preserved (`bb_demo: false`) |
| Announcement highlight | published `[Demo] This Week at Church` |
| Welcome | published |
| About mission/vision/values/story | published |
| Leadership | 3 published |
| Ministries | 4 published |
| Future events | 3 published (`starts_at > now()`) |
| Sermons | 4 published |
| Contact channels | 5 published + HQ address/email/phone |
| Giving | 1 published method + disclaimer copy |

## 10. No overwrite / no deletes

- Apply used fill-empty only (`refresh_demo_content: false`).
- **Skipped: 1** — existing non-demo `service_times` (Kafue Rd entry) left unchanged.
- No `DELETE` / `TRUNCATE` / global reseed.
- No V4 tables touched.

## 11–14. Public / preview HTTP verification

Authenticated as `platform-admin@example.test` (testing fixture) on apex.

| Check | Result |
|-------|--------|
| Public pages `/c/automated-test-church…` | all **200** |
| HQ announcements / content / website | **200** |
| Preview pages listed above | all **200** |
| Public home shows published hero | yes |
| Public home preview banner | **absent** |
| Draft section `081-DRAFT-ONLY-MARKER-NOT-FOR-PUBLIC` on public | **absent** |
| Same draft marker on preview | **present** |
| Preview banner (`bb-ca-preview-banner`) | **present** on live Hostinger |

Draft probe section left as **draft** (demo-marked) for ongoing visibility checks — not deleted.

## 15. Safety confirmation

No data was deleted, truncated, globally reseeded, or refreshed over user-owned rows. Pre-existing service times preserved.

## Remaining gaps

1. Deploy 079 shared public renderer to Hostinger so preview matches published chrome.
2. Optional: register a real `*.blessboard.org` tenant hostname if host-based testing is desired (path `/c/…` is sufficient today).
3. Set `DEPLOYMENT_ENV=testing` in Hostinger/runtime env permanently for seed CLIs (CLI override used here).
