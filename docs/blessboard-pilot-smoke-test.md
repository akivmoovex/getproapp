# BlessBoard Pilot Smoke Test

Manual checklist for production verification before and after onboarding **Kafue Baptist Church** (`kafuebaptist.blessboard.com`).

**Last updated:** 2026-07-10

Run after every deploy and again after provisioning the pilot church. Do not invite real church staff until all **Pilot** rows pass.

Super admin diagnostics (no secrets): `https://getproapp.org/admin/church/diagnostics`

---

## Public — BlessBoard apex & demo

| # | URL | Expected status | Expected marker text | If it fails | Suggested fix |
|---|-----|-----------------|----------------------|-------------|---------------|
| 1 | https://blessboard.com | 200 | BlessBoard landing, “Powered by GetPro” or similar marketing copy | SSL error or wrong site | Confirm apex domain on Node.js app; issue SSL; verify `CHURCH_HOST_DOMAIN=blessboard.com` |
| 2 | https://demo.blessboard.com | 200 | Demo church name / homepage hero | 404 Church not found | Run demo seed on boot; check `church_branches.host_slug = demo` |
| 3 | https://demo.blessboard.com/about | 200 | About / mission content | 500 or empty page | Apply migration 089+; check `church_branch_website_content`; review server logs |
| 4 | https://demo.blessboard.com/contact | 200 | Contact form, church address or email | 500 | Apply migration 090; verify branch contact fields |
| 5 | https://demo.blessboard.com/register | 200 | Member registration form | “Registration closed” or 404 | Check `member_registration_enabled`; branch/org status `active` |
| 6 | https://demo.blessboard.com/giving | 200 | Giving instructions section | 500 | Ensure giving page fallback when DB slow; check website content |
| 7 | https://demo.blessboard.com/ministries | 200 | Ministries list or empty state | 500 | Check ministries query; branch must be active |

---

## Pilot — Kafue Baptist (after provisioning)

Provision first via `https://getproapp.org/admin/church/organizations/new` (see [blessboard-church-onboarding.md](./blessboard-church-onboarding.md)).

| # | URL | Expected status | Expected marker text | If it fails | Suggested fix |
|---|-----|-----------------|----------------------|-------------|---------------|
| 8 | https://kafuebaptist.blessboard.com | 200 | “Kafue Baptist” (or branch name from form) | 404 Church not found | Confirm `host_slug = kafuebaptist`; wildcard DNS/SSL; Host header forwarded |
| 9 | https://kafuebaptist.blessboard.com/about | 200 | Starter about/mission if “Publish starter content” checked | Blank or 500 | Re-save website editor; check starter content transaction on provision |
| 10 | https://kafuebaptist.blessboard.com/contact | 200 | Contact form + church details | 500 | Migration 090; branch contact email/phone on org form |
| 11 | https://kafuebaptist.blessboard.com/register | 200 or closed page | Registration form **or** “Registration is currently closed” if disabled | Wrong branch members | Host must be `kafuebaptist.blessboard.com`; check `member_registration_enabled` |
| 12 | https://kafuebaptist.blessboard.com/branch/login | 200 | Branch admin login form | 404 | Church context must resolve branch; route mounted on church host |
| 13 | https://kafuebaptist.blessboard.com/branch/contact-submissions | 302 → login | Redirect to login when logged out | 404 on church host | Log in as branch admin first; expect list after auth |
| 14 | https://kafuebaptist.blessboard.com/branch/website-editor | 302 → login | Redirect when logged out | 500 after login | Branch admin session; website content row exists |
| 15 | https://kafuebaptist.blessboard.com/branch/sermons | 302 → login | Sermons admin (after login) | 500 | Migration 089 applied |
| 16 | https://kafuebaptist.blessboard.com/branch/resources | 302 → login | Resources admin (after login) | 500 | Migration 089 applied |

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
| 17 | https://getproapp.org | 200 | GetPro marketing / platform home (not BlessBoard church UI) | Shows church or wrong product | Verify `BASE_DOMAIN=getproapp.org`; church middleware must not hijack platform apex |
| 18 | https://getproapp.org/admin/church | 302 → login or 200 dashboard | BlessBoard admin (super admin) | 403 for super admin | Use super admin account; not tenant manager |
| 19 | https://getproapp.org/admin/church/diagnostics | 302 or 200 | “BlessBoard production diagnostics”, no secrets | Exposes DATABASE_URL | Report bug — diagnostics must never show connection strings |

---

## Negative checks

| URL | Expected |
|-----|----------|
| https://unknown.blessboard.com | 404, “Church not found” |
| https://getproapp.org/register | Not a church member registration form |

---

## Automated subset (local / CI)

```bash
npm test -- tests/church-pilot-launch.test.js tests/church-operational-readiness.test.js tests/church-onboarding.test.js tests/church-blessboard-subdomains.test.js
```

---

## Related docs

- [blessboard-production-checklist.md](./blessboard-production-checklist.md)
- [blessboard-church-onboarding.md](./blessboard-church-onboarding.md)
- [blessboard-branch-admin-training.md](./blessboard-branch-admin-training.md)
