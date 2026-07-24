# PHASE2_083 — Live Hostinger revision check (Prompt 079 renderer)

**Date:** 2026-07-24  
**Scope:** Read-only verification of BlessBoard V5 testing on `blessboard.org`  
**Org:** `automated-test-church` / path-public `/c/automated-test-church`  
**Constraint:** No code, database, migration, or environment changes

## Verdict

**DEPLOYED_CURRENT**

Live Hostinger now serves Prompt 079 shared public/preview rendering: `tenant-public.css?v=31`, `data-bb-shell="tenant-public"`, rich home teasers/CTAs, and authenticated preview via the shared public shell (`data-bb-preview-banner`) — not legacy `bb-ca-preview-body` / `content-admin/preview.ejs`.

This reverses the **NOT_DEPLOYED** / pre-079 live state recorded in `PHASE2_082` (then CSS `?v=30` + legacy preview chrome).

Exact Hostinger `git rev-parse` / process PID remain **unavailable** (SSH closed). Revision currency is established from live HTML/CSS behavioral markers and byte-identical static CSS vs local `V5` tip.

---

## 0. Local / GitHub expectation

| Field | Value |
|-------|--------|
| Local branch | `V5` |
| Local / `origin/V5` tip | `33fd042331d010a0079eacc781036cc623284187` |
| Includes Prompt 079 code | `5447559` (ancestor of tip) |
| Tip includes 082 docs | `33fd042` (or later — matches tip) |
| Canonical Hostinger app root (documented) | `/home/u549637099/domains/blessboard.org/nodejs` |
| Expected CSS | `tenant-public.css?v=31` |
| Expected preview | Shared tenant public renderer |

---

## 1. Live asset check (public)

Fetched with `Cache-Control: no-cache` / `Pragma: no-cache` (no cache-policy changes on the server).

| Path | HTTP | CSS | Shell | Legacy preview wrapper |
|------|------|-----|-------|------------------------|
| `/c/automated-test-church` | **200** | `?v=31` | `tenant-public` / `home` | **absent** |
| `/c/automated-test-church/about` | **200** | `?v=31` | `tenant-public` / `about` | **absent** |
| `/c/automated-test-church/leadership` | **200** | `?v=31` | `tenant-public` / `leadership` | **absent** |
| `/c/automated-test-church/ministries` | **200** | `?v=31` | `tenant-public` / `ministries` | **absent** |
| `/c/automated-test-church/events` | **200** | `?v=31` | `tenant-public` / `events` | **absent** |
| `/c/automated-test-church/sermons` | **200** | `?v=31` | `tenant-public` / `sermons` | **absent** |
| `/c/automated-test-church/contact` | **200** | `?v=31` | `tenant-public` / `contact` | **absent** |
| `/c/automated-test-church/giving` | **200** | `?v=31` | `tenant-public` / `giving` | **absent** |

Shared-shell markers present on all: `data-bb-shell="tenant-public"`, `data-bb-product="blessboard-v5"`, `data-bb-page=…`.  
Public pages: **no** `data-bb-preview-banner`, **no** `bb-ca-preview-*`.

Rich home markers on homepage: `data-bb-home="1"`, `data-bb-home-service-times`, `data-bb-home-announce`, `data-bb-home-welcome`, `data-bb-home-ministries`, `data-bb-home-leadership`, `data-bb-home-events`, `data-bb-home-sermons`, `bb-tp-home-cta-card--give`, `bb-tp-home-cta-card--contact`, `bb-tp-footer`.

Static CSS: live `tenant-public.css?v=31` is **byte-identical** to local `public/blessboard/v5/tenant-public.css` (73155 bytes, same SHA-256). File `Last-Modified: Fri, 24 Jul 2026 16:11:40 GMT`. Query `?v=30` returns the **same** file body (query is cache-bust only; HTML correctly links `?v=31`).

---

## 2. Live preview check (Platform Admin session)

Authenticated on apex as testing fixture `platform-admin@example.test` (session cookie established; credentials not recorded here).

| Path | HTTP | CSS | Shell | Shared preview banner | `bb-ca-preview-body` | Draft marker |
|------|------|-----|-------|----------------------|----------------------|--------------|
| `/hq/content/preview/home` | **200** | `?v=31` | `tenant-public` | **yes** (`data-bb-preview-banner`) | **no** | **yes** (`081-DRAFT-ONLY-MARKER-NOT-FOR-PUBLIC`) |
| `/hq/content/preview/about` | **200** | `?v=31` | `tenant-public` | **yes** | **no** | n/a |
| `/hq/content/preview/leadership` | **200** | `?v=31` | `tenant-public` | **yes** | **no** | n/a |
| `/hq/content/preview/ministries` | **200** | `?v=31` | `tenant-public` | **yes** | **no** | n/a |
| `/hq/content/preview/events` | **200** | `?v=31` | `tenant-public` | **yes** | **no** | n/a |
| `/hq/content/preview/sermons` | **200** | `?v=31` | `tenant-public` | **yes** | **no** | n/a |
| `/hq/content/preview/contact` | **200** | `?v=31` | `tenant-public` | **yes** | **no** | n/a |
| `/hq/content/preview/giving` | **200** | `?v=31` | `tenant-public` | **yes** | **no** | n/a |

Banner copy matches shared shell: “Admin preview (includes drafts)…” with back/edit links — not legacy `bb-ca-preview-banner` / `bb-ca-preview-meta` / “Page status:” sparse chrome.

Home preview section markers match public home section parity (hero through CTAs + footer). Layout uses the same public templates (`bb-tp-home`, `bb-tp-hero`, teasers), not `content-admin/preview.ejs`.

---

## 3. Live content check

### Homepage sections (public)

| Section | Found |
|---------|-------|
| Hero | yes (`bb-tp-hero`; heading “A Place for Growth & Community”; hero media path present) |
| Service times | yes (`data-bb-home-service-times`; includes pre-existing Kafue Rd entry) |
| Announcement highlight | yes (`[Demo] This Week at Church`) |
| Welcome/about | yes (`data-bb-home-welcome`) |
| Ministries teaser | yes |
| Leadership teaser | yes |
| Events teaser | yes |
| Sermons teaser | yes |
| Giving CTA | yes (`bb-tp-home-cta-card--give`) |
| Visit/contact CTA | yes (`bb-tp-home-cta-card--contact`) |
| Footer | yes (`bb-tp-footer`) |

Draft-only marker **absent** on public home; **present** on preview home → draft isolation intact.

### Internal public pages (seeded demo content)

| Page | Seeded content / page markers |
|------|-------------------------------|
| About | `data-bb-about` / mission-vision story; `[Demo]` copy |
| Leadership | `[Demo] Senior Pastor Jordan Hale` + profiles |
| Ministries | `[Demo] Children's Ministry` and other demo ministries |
| Events | Featured `[Demo] Sunday Worship Gathering` |
| Sermons | Featured `[Demo] Welcome Home` + list |
| Contact | Channels + service times strip; demo office copy |
| Giving | Bank-transfer method + no-payment notice |

---

## 4. Cache and process analysis

| Hypothesis | Assessment |
|------------|------------|
| Old Hostinger checkout | **Ruled out for 079 surface** — live HTML/CSS match 079 markers; CSS equals local tip asset |
| Old Node process | **Unlikely** — EJS markers require restarted process after pull; preview no longer uses legacy template |
| Stale browser/CDN cache | **Not the mismatch source** — HTML `x-hcdn-cache-status: DYNAMIC`; CSS `MISS` on busted fetch; markers current |
| Stale EJS output | **No** — current shared-shell markup and preview banner |
| Wrong application directory | **Cannot confirm via SSH**; live product responses are consistent with documented BlessBoard V5 app |
| Wrong Git branch | **Cannot confirm via SSH**; behavior matches `V5` @ ≥ `5447559` |
| Asset version mismatch | **No** — HTML requests `?v=31`; body matches local |

Cache policy was **not** weakened.

---

## 5. Deployment evidence (Hostinger access)

| Item | Result |
|------|--------|
| SSH `blessboard.org` / CDN A records (`92.113.*`), ports **22** / **65002** | **Closed / unreachable** from this environment |
| Deployed branch on Hostinger | **Unknown** (no shell) |
| Deployed commit on Hostinger | **Unknown** (no shell); live behavior implies ≥ `5447559` |
| Process PID / start time | **Unavailable** |
| Application root | Documented expectation only: `/home/u549637099/domains/blessboard.org/nodejs` |
| Start command | Documented expectation only: `npm start` → `node index.js` |

**Limitation:** Without Hostinger SSH or hPanel terminal, branch/commit/PID cannot be recorded from the server. Live response evidence is sufficient for the **DEPLOYED_CURRENT** functional verdict.

GitHub `origin/V5` tip at check time: `33fd042` (includes `5447559`).

---

## 6. Comparison to PHASE2_082

| Check | 082 (pre-operator deploy) | 083 (this check) |
|-------|---------------------------|------------------|
| Public CSS | `?v=30` | `?v=31` |
| Preview chrome | `bb-ca-preview-body` | Shared `data-bb-preview-banner` |
| Rich home 079 markers | Absent | Present |
| Verdict | **NOT_DEPLOYED** | **DEPLOYED_CURRENT** |

An operator (or Hostinger auto/panel restart after pull) updated the live app between 082 and 083.

---

## 7. Corrective action

**None required** for Prompt 079 live revision / renderer parity.

Optional ops hygiene (not blocking): when SSH/hPanel is available, record `git rev-parse HEAD` and Node PID under `/home/u549637099/domains/blessboard.org/nodejs` for audit trail.

---

## Safety confirmation

- No application code modified.
- No database writes, seeds, migrations, or env var changes.
- No cache-policy changes.
- Only artifact created: this report.
