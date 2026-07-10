# BlessBoard Pilot Smoke Test

Manual checklist for production verification before and after onboarding **Kafue Baptist Church** (`kafuebaptist.blessboard.com`).

**Last updated:** 2026-07-10 (public visual freeze CSS **v36**)

Run after every deploy and again after provisioning the pilot church. Do not invite real church staff until all **Pilot freeze** and **Pilot** rows pass.

Super admin diagnostics (no secrets): `https://blessboard.com/admin/diagnostics`

---

## Pilot freeze checklist (pre–Kafue Baptist)

Complete this freeze audit on **demo** + platform hosts before provisioning Kafue Baptist. Visual redesign is frozen at CSS **v36** — only fix broken links, route failures, or obvious regressions.

| # | Check | How to verify | Pass criteria | Status (2026-07-10) |
|---|--------|---------------|---------------|---------------------|
| F1 | Public pages render on demo | Open each URL below | 200, no 500/503 | Pass (automated + markers) |
| F2 | Desktop public nav | Click Home → Contact (+ Sermons) | Each route loads | Pass — Sermons added to desktop nav |
| F3 | Mobile drawer links | Open hamburger; click each link | Each route loads | Pass |
| F4 | Footer links | About / Connect / Contact | No 404 on real routes | Pass — Privacy/Terms remain `#` stubs (non-blocker) |
| F5 | Contact form submits | POST `/contact` with name + message + email/phone | Redirect `?submitted=1`; row in contact submissions | Pass (`church-operational-readiness`) |
| F6 | Member registration submits | `/register` → submit | `/registration-submitted` or pending verification | Pass (onboarding / operational tests) |
| F7 | Branch admin login | `/branch/login` | Login form; auth → dashboard | Pass |
| F8 | Website editor | `/branch/website-editor` after login | Draft / preview / publish | Pass (`church-branch-website-editor`) |
| F9 | Contact submissions admin | `/branch/contact-submissions` | List after auth; unauth → login | Pass |
| F10 | Apex provisioning | `blessboard.com/admin/churches/new` | Form after super-admin login; branch host → 404 | Pass (`church-blessboard-admin-host`) |
| F11 | GetPro unchanged | `getproapp.org` | Not BlessBoard church UI; `/about` not church | Pass |
| F12 | Unknown slug | `unknownslug.blessboard.com` | Friendly Church not found (not 500) | Pass |
| F13 | CSS v36 | View source on public shells | `church.css?v=36` | Pass |
| F14 | Branding | Search public HTML | No primary “GetPro Church” | Pass |

### Demo public URLs (F1)

| URL | Expected |
|-----|----------|
| https://demo.blessboard.com/ | Homepage |
| https://demo.blessboard.com/about | About |
| https://demo.blessboard.com/leadership | Leadership |
| https://demo.blessboard.com/ministries | Ministries |
| https://demo.blessboard.com/events | Events |
| https://demo.blessboard.com/sermons | Sermons & Resources |
| https://demo.blessboard.com/contact | Contact |
| https://demo.blessboard.com/giving | Giving |

### Freeze regression commands

```bash
npm test

# Focused freeze subset
node --test \
  tests/church-visual-design.test.js \
  tests/church-branding.test.js \
  tests/church-blessboard-admin-host.test.js \
  tests/church-content-management.test.js \
  tests/church-branch-website-editor.test.js \
  tests/church-branch-admin.test.js \
  tests/church-onboarding.test.js \
  tests/church-pilot-launch.test.js \
  tests/church-operational-readiness.test.js \
  tests/church-db-resilience.test.js
```

**Automated result (2026-07-10):** `npm test` → **396 pass, 0 fail** (307 skipped). Freeze subset → **58 pass, 0 fail**.

**Go / no-go:** **GO** for Kafue Baptist provisioning after production deploy smoke (F1–F14 on live hosts). Non-blockers: footer Privacy/Terms `#` placeholders; calendar/sermon filter UI visual-only; Stitch bottom tab bars not used.

---

## Public — BlessBoard apex & demo

| # | URL | Expected status | Expected marker text | If it fails | Suggested fix |
|---|-----|-----------------|----------------------|-------------|---------------|
| 1 | https://blessboard.com | 200 | BlessBoard landing, “Powered by GetPro” | SSL error or wrong site | Confirm apex domain on Node.js app; issue SSL; verify `CHURCH_HOST_DOMAIN=blessboard.com` |
| 2 | https://demo.blessboard.com | 200 | Demo church homepage; `church.css?v=36` | 404 Church not found | Run demo seed on boot; check `church_branches.host_slug = demo` |
| 3 | https://demo.blessboard.com/about | 200 | About / mission / Stitch sections | 500 or empty page | Apply migration 089+; check `church_branch_website_content` |
| 4 | https://demo.blessboard.com/leadership | 200 | Our Leadership | 500 | Website content `leadership_json`; public route |
| 5 | https://demo.blessboard.com/ministries | 200 | Growing Together / ministries | 500 | Ministries query; branch active |
| 6 | https://demo.blessboard.com/events | 200 | Upcoming / Church Events | 500 | Events table or demo fallback |
| 7 | https://demo.blessboard.com/sermons | 200 | Media Library / Sermons | 500 | Migration 089; sermons list |
| 8 | https://demo.blessboard.com/contact | 200 | Contact form | 500 | Migration 090; branch contact fields |
| 9 | https://demo.blessboard.com/giving | 200 | Giving instructions | 500 | Giving settings / website fallback |
| 10 | https://demo.blessboard.com/register | 200 | Member registration form | “Registration closed” or 404 | Check `member_registration_enabled`; branch/org `active` |

---

## Pilot — Kafue Baptist (after provisioning)

Provision first via `https://blessboard.com/admin/churches/new` (see [blessboard-church-onboarding.md](./blessboard-church-onboarding.md)).

| # | URL | Expected status | Expected marker text | If it fails | Suggested fix |
|---|-----|-----------------|----------------------|-------------|---------------|
| 11 | https://kafuebaptist.blessboard.com | 200 | “Kafue Baptist” (or branch name from form) | 404 Church not found | Confirm `host_slug = kafuebaptist`; wildcard DNS/SSL; Host header forwarded |
| 12 | https://kafuebaptist.blessboard.com/about | 200 | Starter about/mission if “Publish starter content” checked | Blank or 500 | Re-save website editor; check starter content on provision |
| 13 | https://kafuebaptist.blessboard.com/leadership | 200 | Leadership page | 500 | Starter leadership_json |
| 14 | https://kafuebaptist.blessboard.com/contact | 200 | Contact form + church details | 500 | Migration 090; branch contact on org form |
| 15 | https://kafuebaptist.blessboard.com/register | 200 or closed page | Registration form **or** closed message | Wrong branch | Host must be `kafuebaptist.blessboard.com` |
| 16 | https://kafuebaptist.blessboard.com/branch/login | 200 | Branch admin login form | 404 | Church context must resolve branch |
| 17 | https://kafuebaptist.blessboard.com/branch/contact-submissions | 302 → login | Redirect when logged out | 404 | Log in as branch admin first |
| 18 | https://kafuebaptist.blessboard.com/branch/website-editor | 302 → login | Redirect when logged out | 500 after login | Branch admin session; website content row |
| 19 | https://kafuebaptist.blessboard.com/branch/sermons | 302 → login | Sermons admin (after login) | 500 | Migration 089 |
| 20 | https://kafuebaptist.blessboard.com/branch/resources | 302 → login | Resources admin (after login) | 500 | Migration 089 |

### Pilot functional checks (logged in as branch admin)

| Action | Expected |
|--------|----------|
| Submit public contact form | Success flash; row in **Contact submissions** with status `new` |
| Submit member registration (if enabled) | Redirect to `/registration-submitted`; pending in **Member verification** |
| Add draft sermon → publish | Visible on public `/sermons` |
| Edit website editor → save | Public `/about` reflects changes |

---

## Main platform — GetPro (must stay unchanged)

| # | URL | Expected status | Expected marker text | If it fails | Suggested fix |
|---|-----|-----------------|----------------------|-------------|---------------|
| 21 | https://getproapp.org | 200 | GetPro marketing / platform home (not BlessBoard church UI) | Shows church or wrong product | Verify `BASE_DOMAIN=getproapp.org`; church middleware must not hijack platform apex |
| 22 | https://blessboard.com/admin/login | 302 → login or 200 dashboard | BlessBoard Admin, Powered by GetPro | Wrong product | Must be blessboard.com apex, not church subdomain |
| 23 | https://blessboard.com/admin/diagnostics | 302 or 200 | “BlessBoard production diagnostics”, no secrets | Exposes DATABASE_URL | Super admin only; never on getproapp.org |
| 24 | https://getproapp.org/admin/church/organizations/new | 302 | Redirect to blessboard.com/admin/churches/new | Cannot GET /admin/church/... | Deploy latest code to blessboard.com Node app |
| 25 | https://blessboard.com/admin/churches/:id/edit | 200 (super admin) | Edit church details | 404 on blessboard apex | Super admin login; use org id from `/admin/churches` |
| 26 | https://blessboard.com/admin/church/organizations/:id/edit | 302 | Redirect to `/admin/churches/:id/edit` | Shows legacy URL without redirect | Deploy latest blessboard.com code |
| 27 | https://demo.blessboard.com/admin/churches/:id/edit | 404 | Platform admin blocked on branch hosts | Exposes edit form on subdomain | Host guard — apex only |
| 28 | https://getproapp.org/admin/church/organizations/:id/edit | 302 | Redirect to blessboard.com/admin/churches/:id/edit | 404 on getpro | Deploy latest code to both Node apps |

---

## Negative checks

| URL | Expected |
|-----|----------|
| https://unknownslug.blessboard.com | 404, “Church not found” |
| https://getproapp.org/register | Not a church member registration form |
| https://getproapp.org/about | Not BlessBoard branch About page |

---

## Automated subset (local / CI)

```bash
npm test -- tests/church-pilot-launch.test.js tests/church-operational-readiness.test.js tests/church-onboarding.test.js tests/church-blessboard-subdomains.test.js tests/church-blessboard-admin-host.test.js tests/church-visual-design.test.js tests/church-branding.test.js
```

---

## Related docs

- [blessboard-production-checklist.md](./blessboard-production-checklist.md)
- [blessboard-church-onboarding.md](./blessboard-church-onboarding.md)
- [blessboard-branch-admin-training.md](./blessboard-branch-admin-training.md)
- [blessboard-screen-implementation-status.md](./blessboard-screen-implementation-status.md)
