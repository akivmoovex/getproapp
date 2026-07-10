# BlessBoard Screen Implementation Status

Visual alignment pass against Stitch exports in `design-reference/stitch-screens/church-flow/`.

**Design reference root:** `design-reference/stitch-screens/church-flow/`  
(Recommended copy location for deployment-only assets: `public/design-references/blessboard/` — not required; PNGs remain in repo under `design-reference/`.)

**CSS bundle:** `/church/church.css?v=33` (public homepage pixel pass: apex SaaS desktop + branch mobile)

**Last updated:** 2026-07-10 (public homepage Stitch pass)

---

## Summary

| Area | Desktop | Mobile | Notes |
|------|---------|--------|-------|
| Public website shell | Partial → improved | Partial → improved | Hamburger drawer, brand mark, 1280px max-width |
| Public homepage (apex) | Close | Partial | SaaS landing matches desktop Stitch; no dedicated apex-mobile PNG |
| Branch public homepage | Partial | Close | Mobile Stitch layout implemented; desktop branch content remains church-site layout |
| Auth screens | Partial | Partial | Card polish, brand lockup; layout closer to Stitch |
| Member portal | Partial | Partial → improved | Mobile top bar, bento quick actions, announcement cards |
| Branch admin | Partial | Needs mobile fix | Functional; sidebar layout differs from Stitch density |
| HQ / Leader / Platform | Partial | Partial | Implemented; not fully restyled this pass |

**Playwright:** Available (`npm run test:ui`). Homepage QA screenshots: `node scripts/screenshot-blessboard-home.js` → `tmp/blessboard-home-screenshots/` (390px + 1440px).

---

## Screen mapping

Statuses: **Matches** · **Partial** · **Placeholder** · **Missing** · **Needs mobile fix** · **Needs desktop fix**

### Public website

| Screen | Device | PNG File | Current Route | Current View | Match Status | Missing Design Items |
|--------|--------|----------|---------------|--------------|--------------|----------------------|
| Public homepage (BlessBoard apex) | Desktop | `01-public-website/01-public-home-desktop/01-public-home-desktop.png` | `/` (blessboard.com) | `views/church/public/home.ejs` + `home_apex.ejs` | Close | SaaS nav/hero/bento/CTA/footer implemented. Remaining: exact Stitch photo assets (using Unsplash placeholders + CSS mock directory) |
| Public homepage (BlessBoard apex) | Mobile | `01-public-website/01-public-home-mobile/01-public-home-mobile.png` | `/` | `home.ejs` | Partial | Apex mobile stacks SaaS sections; PNG is branch church mobile, not apex marketing |
| Public homepage (branch) | Desktop | `01-public-website/01-public-home-desktop/01-public-home-desktop.png` | `/` (demo.blessboard.com) | `home.ejs` + `home_branch.ejs` | Partial | Desktop PNG is apex SaaS; branch desktop keeps church-site hero + sections (intentional host split) |
| Public homepage (branch) | Mobile | `01-public-website/01-public-home-mobile/01-public-home-mobile.png` | `/` | `home_branch.ejs` | Close | Full mobile Stitch structure. Remaining: original Stitch hero/map/ministry photos (Unsplash + map placeholder); nearby avatars are decorative placeholders |
| About | Desktop | `01-public-website/02-public-about-desktop/02-public-about-desktop.png` | `/about` | `views/church/public/about.ejs` | Partial | Photo hero polish; value rows use plain text split |
| About | Mobile | `01-public-website/02-public-about-mobile/02-public-about-mobile.png` | `/about` | `about.ejs` | Partial | Page hero, story card, mission/vision cards added |
| Leadership | Desktop | `01-public-website/03-public-leadership-desktop/03-public-leadership-desktop.png` | `/leadership` | `views/church/public/leadership.ejs` | Partial | Initials avatars; real photos not wired |
| Leadership | Mobile | `01-public-website/03-public-leadership-mobile/03-public-leadership-mobile.png` | `/leadership` | `leadership.ejs` | Partial | Featured pastor card + leader rows |
| Ministries | Desktop | `01-public-website/04-public-ministries-desktop/04-public-ministries-desktop.png` | `/ministries` | `views/church/public/ministries.ejs` | Partial | Image tiles, filter chips |
| Ministries | Mobile | *(no dedicated PNG in export set)* | `/ministries` | `ministries.ejs` | Partial | Bento tiles on homepage only |
| Events / Calendar | Desktop | `01-public-website/05-public-events-calendar-desktop/05-public-events-calendar-desktop.png` | `/events` | `views/church/public/events.ejs` | Partial | List/cards; no calendar grid widget |
| Events / Calendar | Mobile | `01-public-website/05-public-events-calendar-mobile/05-public-events-calendar-mobile.png` | `/events` | `events.ejs` | Partial | Stacked event rows; demo fallback events |
| Sermons / Resources | Desktop | `01-public-website/06-public-sermons-resources-desktop/06-public-sermons-resources-desktop.png` | `/sermons` | `views/church/public/sermons.ejs` | Partial | DB-backed via `church_sermons`; media upload not wired |
| Sermons / Resources | Mobile | `01-public-website/06-public-sermons-resources-mobile/06-public-sermons-resources-mobile.png` | `/sermons` | `sermons.ejs` | Partial | Seeded demo sermons render as cards |
| Giving information | Desktop | `01-public-website/07-public-giving-information-desktop/07-public-giving-information-desktop.png` | `/giving` | `views/church/public/giving.ejs` | Partial | Method icons, bank detail cards |
| Giving information | Mobile | `01-public-website/07-public-giving-information-mobile/07-public-giving-information-mobile.png` | `/giving` | `giving.ejs` | Partial | Stacked method cards |
| Contact | Desktop | `01-public-website/08-public-contact-desktop/08-public-contact-desktop.png` | `/contact` | `views/church/public/contact.ejs` | Partial | Two-column layout; form display-only |
| Contact | Mobile | `01-public-website/08-public-contact-mobile/08-public-contact-mobile.png` | `/contact` | `contact.ejs` | Partial | Quick action tiles, map card, form panel |

### Authentication

| Screen | Device | PNG File | Current Route | Current View | Match Status | Missing Design Items |
|--------|--------|----------|---------------|--------------|--------------|----------------------|
| Member login | Desktop | `02-authentication/09-auth-member-login-desktop/09-auth-member-login-desktop.png` | `/login` | `views/church/auth/login.ejs` | Partial | Centered card width, illustration |
| Member login | Mobile | `02-authentication/09-auth-member-login-mobile/09-auth-member-login-mobile.png` | `/login` | `login.ejs` | Partial | Rounded-xl full-width card (CSS added) |
| Member registration | Desktop | `02-authentication/10-auth-member-registration-desktop/10-auth-member-registration-desktop.png` | `/register` | `views/church/auth/register.ejs` | Partial | Step sections, progress indicator |
| Member registration | Mobile | `02-authentication/10-auth-member-registration-mobile/10-auth-member-registration-mobile.png` | `/register` | `register.ejs` | Partial | Mobile form spacing |
| Registration submitted | Desktop | `02-authentication/11-auth-registration-submitted-desktop/11-auth-registration-submitted-desktop.png` | `/registration-submitted` | `views/church/auth/registration_submitted.ejs` | Partial | Success illustration sizing |
| Registration submitted | Mobile | `02-authentication/11-auth-registration-submitted-mobile/11-auth-registration-submitted-mobile.png` | `/registration-submitted` | `registration_submitted.ejs` | Partial | — |
| Waiting verification | Desktop | `02-authentication/12-auth-waiting-verification-desktop/12-auth-waiting-verification-desktop.png` | `/waiting-verification` | `views/church/auth/waiting_verification.ejs` | Partial | Status timeline |
| Waiting verification | Mobile | `02-authentication/12-auth-waiting-verification-mobile/12-auth-waiting-verification-mobile.png` | `/waiting-verification` | `waiting_verification.ejs` | Partial | — |
| Forgot password | Desktop | `02-authentication/13-auth-forgot-password-desktop/13-auth-forgot-password-desktop.png` | `/forgot-password` | `views/church/auth/forgot_password.ejs` | Partial | — |
| Forgot password | Mobile | `02-authentication/13-auth-forgot-password-mobile/13-auth-forgot-password-mobile.png` | `/forgot-password` | `forgot_password.ejs` | Partial | — |

### Member portal

| Screen | Device | PNG File | Current Route | Current View | Match Status | Missing Design Items |
|--------|--------|----------|---------------|--------------|--------------|----------------------|
| Member dashboard | Desktop | `03-member-portal/14-member-dashboard-desktop/14-member-dashboard-desktop.png` | `/member/dashboard` | `views/church/member/dashboard.ejs` | Partial | Horizontal event scroller, ministry highlight card |
| Member dashboard | Mobile | `03-member-portal/14-member-dashboard-mobile/14-member-dashboard-mobile.png` | `/member/dashboard` | `dashboard.ejs` | Partial | Bento quick actions + top bar added; event scroller missing |
| My profile | Desktop | `03-member-portal/15-member-profile-desktop/15-member-profile-desktop.png` | `/member/profile` | `views/church/member/profile.ejs` | Partial | Avatar upload, section cards |
| My profile | Mobile | `03-member-portal/15-member-profile-mobile/15-member-profile-mobile.png` | `/member/profile` | `profile.ejs` | Needs mobile fix | Form layout |
| Announcements | Desktop | `03-member-portal/16-member-announcements-desktop/16-member-announcements-desktop.png` | `/member/announcements` | `views/church/member/announcements.ejs` | Partial | Icon list rows |
| Announcements | Mobile | `03-member-portal/16-member-announcements-mobile/16-member-announcements-mobile.png` | `/member/announcements` | `announcements.ejs` | Partial | — |
| Events calendar | Desktop | `03-member-portal/17-member-events-calendar-desktop/17-member-events-calendar-desktop.png` | `/member/events` | `views/church/member/events.ejs` | Partial | Calendar grid UI |
| Events calendar | Mobile | `03-member-portal/17-member-events-calendar-mobile/17-member-events-calendar-mobile.png` | `/member/events` | `events.ejs` | Partial | — |
| My ministries | Desktop | `03-member-portal/18-member-my-ministries-desktop/18-member-my-ministries-desktop.png` | `/member/my-ministries` | `views/church/member/my_ministries.ejs` | Partial | Role cards |
| My ministries | Mobile | `03-member-portal/18-member-my-ministries-mobile/18-member-my-ministries-mobile.png` | `/member/my-ministries` | `my_ministries.ejs` | Partial | — |
| Resources & Study | Desktop | `03-member-portal/19-member-resources-study-desktop/19-member-resources-study-desktop.png` | `/member/resources` | `views/church/member/resources.ejs` | Partial | DB-backed via `church_resources` type `study` |
| Resources & Study | Mobile | `03-member-portal/19-member-resources-study-mobile/19-member-resources-study-mobile.png` | `/member/resources` | `resources.ejs` | Partial | Seeded demo resources |
| Church Forms & Docs | Desktop | `03-member-portal/20-member-forms-documents-desktop/20-member-forms-documents-desktop.png` | `/member/forms` | `views/church/member/forms.ejs` | Partial | DB-backed via `church_resources` types `form`/`document` |
| Church Forms & Docs | Mobile | `03-member-portal/20-member-forms-documents-mobile/20-member-forms-documents-mobile.png` | `/member/forms` | `forms.ejs` | Partial | Seeded demo forms/documents |
| Submit Online Request | Desktop | *(see member requests flow)* | `/member/requests/new` | `views/church/member/request_new.ejs` | Partial | — |
| Submit Online Request | Mobile | *(Stitch member requests PNGs in extended flow)* | `/member/requests/new` | `request_new.ejs` | Partial | — |
| My Request Status | Desktop | *(requests list)* | `/member/requests` | `views/church/member/requests.ejs` | Partial | Status chips |
| My Request Status | Mobile | *(requests list)* | `/member/requests` | `requests.ejs` | Partial | — |
| Submit Prayer Request | Desktop | *(prayer request)* | `/member/prayer-request` | `views/church/member/prayer_request.ejs` | Partial | — |
| Submit Prayer Request | Mobile | *(prayer request)* | `/member/prayer-request` | `prayer_request.ejs` | Partial | — |
| Giving Information (member) | Desktop | *(member giving)* | `/member/giving` | `views/church/member/giving.ejs` | Partial | — |
| Giving Information (member) | Mobile | *(member giving)* | `/member/giving` | `giving.ejs` | Partial | — |

### Branch admin

| Screen | Device | PNG File | Current Route | Current View | Match Status | Missing Design Items |
|--------|--------|----------|---------------|--------------|--------------|----------------------|
| Branch admin dashboard | Desktop | `04-branch-admin/24-branch-admin-dashboard-desktop/24-branch-admin-dashboard-desktop.png` | `/branch/dashboard` | `views/church/branch-admin/dashboard.ejs` | Partial | Chart widgets, compact stat grid |
| Branch admin dashboard | Mobile | `04-branch-admin/25-branch-admin-dashboard-mobile/25-branch-admin-dashboard-mobile.png` | `/branch/dashboard` | `dashboard.ejs` | Partial | Mobile top bar + drawer added; stat card density still differs |
| Member verification | Desktop | `04-branch-admin/26-branch-verification-queue-desktop/` *(if present)* | `/branch/member-verification` | `views/church/branch-admin/verification_queue.ejs` | Partial | Queue table density |
| Member directory | Desktop | `04-branch-admin/28-branch-member-directory-desktop/28-branch-member-directory-desktop.png` | `/branch/members` | `views/church/branch-admin/members_directory.ejs` | Partial | — |
| Announcements management | Desktop | `04-branch-admin/34-branch-announcements-management-desktop/` | `/branch/announcements` | `announcements_management.ejs` | Partial | — |
| Events management | Desktop | `04-branch-admin/37-branch-events-management-desktop/` | `/branch/events` | `events_management.ejs` | Partial | — |
| Giving settings | Desktop | `04-branch-admin/38-branch-giving-settings-desktop/38-branch-giving-settings-desktop.png` | `/branch/giving-settings` | `giving_settings.ejs` | Partial | — |

### Other implemented screens (not fully audited this pass)

| Screen | Route | View | Match Status |
|--------|-------|------|--------------|
| Church not found | unknown subdomain | `views/church/public/not_found.ejs` | Partial |
| Branch unavailable | suspended branch | `views/church/public/unavailable.ejs` | Partial |
| HQ dashboard | `/hq/dashboard` | `views/church/hq/dashboard.ejs` | Partial |
| Leader dashboard | `/leader/dashboard` | `views/church/leader/dashboard.ejs` | Partial |
| Platform admin | GetPro platform routes | platform views | N/A (GetPro, not BlessBoard church UI) |

---

## Manual visual QA checklist

Compare side-by-side with PNG at these widths (browser devtools):

### Mobile (~390px)

- [ ] Public header: church icon in violet square + church name + hamburger (no horizontal link strip)
- [ ] Drawer opens: nav links, Register/Login pills, “BlessBoard / Powered by GetPro”
- [ ] Branch homepage: full-bleed hero, pill CTAs, horizontal service scroller
- [ ] Footer: “BlessBoard” + “Powered by GetPro” on all public pages
- [ ] Auth: rounded card, brand lockup in header
- [ ] Member dashboard: top bar, verified pill, 2×2 bento quick actions, bottom nav

### Desktop (~1440px)

- [ ] Public nav: inline links + ghost Login + primary Register
- [ ] Homepage: two-column hero + glass service/location cards
- [ ] Max content width ~1280px, Inter typography
- [ ] Member portal: left sidebar + panel cards
- [ ] Branch admin: left sidebar + stat cards

---

## Commands

```bash
# Unit / render smoke tests (includes visual markers)
npm test -- tests/church-visual-design.test.js tests/church-branding.test.js

# Homepage screenshots (390 + 1440)
node scripts/screenshot-blessboard-home.js

# Full test suite
npm test

# Optional Playwright (general UI suite)
npm run test:ui
```

### Local URLs (after `npm start` with church host middleware)

| URL | Expected |
|-----|----------|
| http://localhost:3000/ with `Host: blessboard.com` | BlessBoard apex homepage |
| http://localhost:3000/ with `Host: demo.blessboard.com` | Demo branch homepage + mobile drawer |
| http://localhost:3000/register with demo host | Registration form |
| http://localhost:3000/login | Login with brand lockup |
| http://localhost:3000/ with `Host: getproapp.org` | GetPro platform (unchanged) |

### Production URLs

| URL | Expected |
|-----|----------|
| https://blessboard.com | BlessBoard landing |
| https://demo.blessboard.com | Demo church site |
| https://demo.blessboard.com/register | Member registration |
| https://getproapp.org | GetPro platform |

---

## Files changed in this visual pass

- `public/church/church.css` — v33 apex SaaS + branch mobile homepage styles
- `views/church/public/home.ejs` — apex vs branch split
- `views/church/partials/home_apex.ejs`, `home_branch.ejs` — homepage layouts
- `views/church/partials/public_shell_start.ejs`, `public_shell_end.ejs` — apex/branch header & footer
- `src/routes/church/publicPages.js` — apex copy + demo event badges
- `tests/church-visual-design.test.js`, `tests/church-branding.test.js`
- `scripts/screenshot-blessboard-home.js`
- `docs/blessboard-screen-implementation-status.md` — This file

---

## Screens still not matching (priority follow-ups)

1. **Original Stitch photo assets** — hero congregation, map, ministry tile photos not checked into `public/church/images/` (Unsplash / CSS placeholders used)
2. **Public Giving** — method icon cards need Stitch polish
3. **Public Ministries page** — image tiles and filters
4. **Events calendar grid** — month view widget not implemented
5. **Sermons** — real media/archive integration vs demo cards
6. **Leadership** — real photo uploads from website editor
7. **Contact form** — backend submission not wired (display-only)
8. **Branch admin dashboard** — mobile stat card density vs Stitch
9. **HQ / Leader portals** — not restyled this pass

No PNG references are missing for the core public homepage flows; Stitch HTML lives under `design-reference/stitch-screens/church-flow/01-public-website/`.
