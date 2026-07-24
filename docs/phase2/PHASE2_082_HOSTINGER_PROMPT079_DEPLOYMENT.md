# PHASE2_082 — Hostinger Prompt 079 deployment attempt

**Date:** 2026-07-24  
**Scope:** Deploy Prompt 079 (church website preview/publish parity) to BlessBoard V5 testing on `blessboard.org`  
**Org under test:** `automated-test-church` / path-public `/c/automated-test-church`

## Verdict

**NOT_DEPLOYED**

Prompt 079 code was **committed and pushed** to `origin/V5` (`5447559`), and local pre-deploy verification passed. Hostinger could **not** be updated from this environment:

- SSH to Hostinger (`blessboard.org` / CDN IPs `92.113.*`, ports 22 and 65002) is **unreachable** (`No route to host` / ports closed).
- No SSH identities in the agent; no Hostinger CLI/API credentials in env.
- Live site **still serves pre-079** assets after the GitHub push (no auto-redeploy observed).

Operator action required: pull `V5` @ `5447559` on Hostinger and **Restart** the Node.js app in hPanel.

---

## 1. Pre-change deployment record

| Field | Value |
|-------|--------|
| Local branch | `V5` |
| Pre-commit HEAD | `b88d8d1882b5077cc7399ec311f629f402ed7f8e` |
| Remote `origin/V5` (before push) | `b88d8d1882b5077cc7399ec311f629f402ed7f8e` |
| Working tree (before commit) | Dirty with uncommitted 076–081 website/announcement/demo work |
| Hostinger project directory (canonical) | `/home/u549637099/domains/blessboard.org/nodejs` |
| Node start command | `npm start` → `node index.js` → `server.js` (per production checklist) |
| Live process PID | **Unavailable** (no SSH) |
| Live CSS before | `tenant-public.css?v=30` |
| Live preview before | Legacy `bb-ca-preview-body` / `bb-ca-preview-banner` |

Credentials were not printed or logged.

---

## 2. Required local files verified

| Path | Marker |
|------|--------|
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | `tenant-public.css?v=31`, `data-bb-preview-banner` |
| `views/blessboard/v5/partials/tenant-public-shell-end.ejs` | footer socials |
| `views/blessboard/v5/public/home.ejs` | `data-bb-home-*` teasers / CTAs |
| `views/blessboard/v5/public/about.ejs` | `data-bb-about-services` |
| `views/blessboard/v5/public/leadership.ejs` | present |
| `views/blessboard/v5/public/ministries.ejs` | present |
| `views/blessboard/v5/public/events.ejs` | present |
| `views/blessboard/v5/public/sermons.ejs` | category display |
| `views/blessboard/v5/public/contact.ejs` | service times strip |
| `views/blessboard/v5/public/giving.ejs` | present |
| `public/blessboard/v5/tenant-public.css` | 079 styles |
| `src/blessboard/http/renderTenantPublicPage.js` | shared renderer |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref …?v=31`, preview mode |
| `src/blessboard/http/contentAdminRoutes.js` | `loadTenantPublicPageModel({ preview: true })` + `renderTenantPublicPage` |

---

## 3. Deploy steps attempted

| Step | Result |
|------|--------|
| Pre-deploy tests (079/080 focused) | **81/81 pass** |
| `db:status` on testing DB | **pending=0**, applied=59 — **no migrate** |
| Commit on `V5` | `5447559ed11cadfc7b572d0c3563ad1ac4ab2d5a` |
| `git push origin V5` | **Success** (`b88d8d1..5447559`) |
| Hostinger `git pull` / restart | **Blocked** — SSH unreachable |
| `npm install` on Hostinger | Not run (blocked); `package.json` scripts only — lockfile unchanged |
| Demo seed rerun | **Not run** (explicitly avoided) |
| Database reset | **Not run** |

### Operator commands (Hostinger SSH or panel terminal)

```bash
cd /home/u549637099/domains/blessboard.org/nodejs
git fetch origin
git checkout V5
git pull origin V5
git rev-parse HEAD   # expect 5447559ed11cadfc7b572d0c3563ad1ac4ab2d5a
# package-lock unchanged — npm install optional; only if install fails at runtime
npm run db:status    # expect pending=0; do NOT migrate unless pending
# Then hPanel → Node.js → Restart
```

Do **not** run demo seed, truncate, or reset.

---

## 4. Live verification after push (still pre-079)

| Check | Result |
|-------|--------|
| Public `…/c/automated-test-church` | **200**, shell present, CSS still **`?v=30`** |
| Preview `…/hq/content/preview/home` | **200**, still **`bb-ca-preview-body`**, CSS **`?v=30`** |
| Distinctive 079 markers (`data-bb-home-announce`, `bb-tp-home-cta-card`, `data-bb-preview-banner`) | **Absent** on live |
| Deployed commit on Hostinger | **Unknown / not updated** |

---

## 5–7. Public / preview / visual / cache

**Not re-verified as post-deploy success** — Hostinger revision unchanged.

Pre-existing (081) public content and draft isolation remain valid for the **old** renderer. Cache is not the blocker; **code checkout + restart** is.

---

## 8. Tests

**Before deploy attempt:** focused suites **81/81 pass**  
(`blessboard-public-pages`, `blessboard-content-admin`, `blessboard-v5-frontend-assets`, announcement testing policy, testing demo content seed).

**After deploy:** live smoke only — still pre-079 (see §4).

---

## Remaining gaps

1. **Hostinger pull + Node restart** by an operator with SSH or hPanel access.
2. After restart, confirm live CSS `tenant-public.css?v=31` and preview uses `data-bb-shell="tenant-public"` / `data-bb-preview-banner` (not `bb-ca-preview-body`).
3. Optionally set `DEPLOYMENT_ENV=testing` in Hostinger env for seed CLIs (not required for this code deploy).

---

## Safety confirmation

- No database reset, truncate, or seed rerun during this attempt.
- No V4 branch merge.
- Env vars on Hostinger were not modified (no SSH access).
