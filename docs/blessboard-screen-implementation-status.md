# BlessBoard Screen Implementation Status

Visual alignment pass against Stitch exports in `design-reference/stitch-screens/church-flow/`.

**Design reference root:** `design-reference/stitch-screens/church-flow/`  
(Recommended copy location for deployment-only assets: `public/design-references/blessboard/` — not required; PNGs remain in repo under `design-reference/`.)

**CSS bundle:** `/church/church.css?v=39` (desktop public menu hotfix after Batch B Auth)

**Last updated:** 2026-07-10 (Desktop public menu/header hotfix — Batch C not started)

### Desktop public menu hotfix (v39)

**Issue:** On `demo.blessboard.com` (branch host), the homepage desktop header reused the apex SaaS nav (`Features` / `Pricing` / `About Us`) and hid the branch church nav. That produced a broken mixture vs a clean branch public header.

**Fix:** Branch hosts always use one branch public header:
- Desktop (≥900px): BlessBoard lockup + centered church nav + Login / Register; hamburger hidden
- Mobile (<900px): church name + hamburger drawer (unchanged link set)

Apex (`blessboard.com`) keeps Features / Pricing / About Us.

**Screenshots:** `test-results/blessboard-homepage-visual/menu-fix-desktop.png`, `menu-fix-mobile.png`

**Remaining differences from Stitch `01-public-home-desktop.png`:** Stitch shows SaaS nav (Features/Pricing/About Us) because that PNG is the platform homepage. Branch desktop body still uses the SaaS content layout from that PNG, but the header correctly uses Option B church links. Brand text is BlessBoard / Powered by GetPro (not “GetPro Church”).

### Homepage v34 status (unchanged layout; CSS cache bumped to v35)

Homepage remains visually aligned to the Stitch PNGs (`01-public-home-desktop.png` / `01-public-home-mobile.png`).

Remaining known differences are **intentional / documented** (not regressions):
- Brand text uses **BlessBoard** (+ Powered by GetPro) where PNGs say GetPro Church
- Map asset is the Stitch export cropped via CSS (source includes phone chrome)
- Stitch source images are ~512px; PNG exports may look sharper
- Nearby avatars are initials placeholders
- Apex mobile has no dedicated marketing PNG (branch mobile PNG is the mobile target)

### About + Leadership v35 status

About and Leadership are aligned to Stitch section order and layout for:
- `02-public-about-desktop.png` / `02-public-about-mobile.png`
- `03-public-leadership-desktop.png` / `03-public-leadership-mobile.png`

**Routes confirmed working** on branch host (`demo.blessboard.com`): `/about`, `/leadership` (200). Nav + mobile drawer include About and Leadership. Footer About/Contact links are valid. Apex-only admin provisioning and getproapp.org isolation covered by existing host tests.

Regression guards live in `tests/church-visual-design.test.js` (CSS v35 shells, About/Leadership assets + markers, nav/drawer hrefs).

---

## Summary

| Area | Desktop | Mobile | Notes |
|------|---------|--------|-------|
| Public website shell | Close | Close | Dual header/footer for branch home |
| Public homepage (apex) | Close | Partial | Desktop SaaS uses Stitch assets; apex has no dedicated mobile PNG |
| Branch public homepage | Close | Close | Mobile = church PNG; desktop = SaaS PNG via CSS split |
| Auth screens | Close | Close | Batch B Stitch dual layouts; CSS v38 |
| Member portal | Partial | Partial → improved | Mobile top bar, bento quick actions, announcement cards |
| Branch admin | Partial | Needs mobile fix | Functional; sidebar layout differs from Stitch density |
| HQ / Leader / Platform | Partial | Partial | Implemented; not fully restyled this pass |

**Playwright:**
- `node scripts/screenshot-blessboard-home.js` → `test-results/blessboard-homepage-visual/`
- `node scripts/screenshot-blessboard-about-leadership.js` → `test-results/blessboard-about-leadership-visual/`
- `node scripts/screenshot-blessboard-public-screens.js` → `test-results/blessboard-public-screens-visual/` (contact/ministries/events/sermons × mobile+desktop)

### Contact / Ministries / Events / Sermons asset mapping (v36)

| Screen | Design Element | PNG Reference | Current Asset | Correct Asset Found? | Action |
|--------|----------------|---------------|---------------|----------------------|--------|
| Contact desktop | Map | `08-public-contact-desktop.png` | `contact/contact-map-desktop.jpg` | Yes | Wired |
| Contact mobile | Map | `08-public-contact-mobile.png` | `contact/contact-map-mobile.jpg` | Yes | Wired |
| Ministries | Icons | `04-public-ministries-desktop.png` | Material Symbols | Yes (icons) | Wired; no photo assets in Stitch HTML |
| Ministries mobile | — | *(no PNG)* | Same bento stack | N/A | Desktop design stacked for mobile |
| Events desktop | Card photos ×4 | `05-public-events-calendar-desktop.png` | `events/event-1..4.jpg` | Yes | Wired |
| Events mobile | Featured photo | `05-public-events-calendar-mobile.png` | `events/event-featured-mobile.jpg` | Yes | Wired |
| Sermons desktop | Featured + thumbs | `06-public-sermons-resources-desktop.png` | `sermons/sermon-featured-desktop.jpg`, `sermon-1..3.jpg` | Yes | Wired |
| Sermons mobile | Featured + thumbs | `06-public-sermons-resources-mobile.png` | `sermons/sermon-featured-mobile.jpg`, `sermon-thumb-1..2.jpg` | Yes | Wired |

**Missing from export set:** `04-public-ministries-mobile.png` (not present). Calendar month-grid widget and live sermon media players are not implemented.

---

## Public homepage asset mapping

Assets localized from Stitch HTML `aida-public` URLs into `public/church/images/homepage/`.

| Design Element | PNG Reference | Current Asset Used | Correct Asset Found? | Action |
|----------------|---------------|--------------------|----------------------|--------|
| Desktop hero auditorium | `01-public-home-desktop.png` | `desktop-hero-auditorium.jpg` | Yes (from Stitch HTML) | Wired |
| Desktop social avatars | desktop PNG | `desktop-avatar-1/2/3.jpg` | Yes | Wired |
| Desktop member directory shot | desktop PNG | `desktop-feature-directory.jpg` | Yes | Wired |
| Desktop coordination illustration | desktop PNG | `desktop-feature-coordination.jpg` | Yes | Wired |
| Mobile hero sanctuary | `01-public-home-mobile.png` | `mobile-hero-sanctuary.jpg` | Yes | Wired |
| Mobile map card | mobile PNG | `mobile-map-kafue.jpg` | Yes (full phone mock in export) | Cropped via CSS to map area; chrome may still peek |
| Ministry — Children | mobile PNG | `mobile-ministry-children.jpg` | Yes | Wired |
| Ministry — Youth | mobile PNG | `mobile-ministry-youth.jpg` | Yes | Wired |
| Ministry — Worship | mobile PNG | `mobile-ministry-worship.jpg` | Yes | Wired |

**Missing / recommend export from Stitch if available:**
- Clean map crop without phone chrome/search bar (`mobile-map-kafue-clean.png`)
- Higher-resolution desktop hero if Stitch has a larger export than 512px

---

## About + Leadership asset mapping

Assets localized from Stitch HTML `aida-public` URLs into `public/church/images/about/` and `public/church/images/leadership/`.

| Screen | Design Element | PNG Reference | Current Asset | Correct Asset Found? | Action |
|--------|----------------|---------------|---------------|----------------------|--------|
| About mobile | Hero church exterior | `02-public-about-mobile.png` | `about/about-mobile-hero.jpg` | Yes | Wired |
| About mobile | Find Us map area | `02-public-about-mobile.png` | `about/about-map.jpg` | Yes (Stitch light map placeholder) | Wired + purple pin overlay |
| About desktop | Kafue Main Branch photo | `02-public-about-desktop.png` | `about/about-branch-building.jpg` | Yes | Wired |
| About desktop | Service Culture collage ×4 | `02-public-about-desktop.png` | `about/about-culture-1..4.jpg` | Yes | Wired |
| About desktop | Values icons | `02-public-about-desktop.png` | Material Symbols | Yes (icons, not bitmaps) | Wired |
| Leadership mobile | Featured pastor photo | `03-public-leadership-mobile.png` | `leadership/pastor-mobile.jpg` | Yes | Wired |
| Leadership mobile | Ministry leader photos | `03-public-leadership-mobile.png` | `leadership/ministry-m1..m3.jpg` | Yes | Wired |
| Leadership desktop | Senior pastor photo | `03-public-leadership-desktop.png` | `leadership/pastor-desktop.jpg` | Yes | Wired |
| Leadership desktop | Assistant pastor photo | `03-public-leadership-desktop.png` | `leadership/assistant-desktop.jpg` | Yes | Wired |
| Leadership desktop | Elder portraits ×4 | `03-public-leadership-desktop.png` | `leadership/elder-1..4.jpg` | Yes | Wired |
| Leadership desktop | Ministry leader avatars | `03-public-leadership-desktop.png` | `leadership/ministry-1..3.jpg` | Yes | Wired |

**Missing / recommend export from Stitch if available:**
- Higher-resolution culture collage and pastor photos if Stitch has larger than ~512px exports
- Optional: real interactive map tile (current Stitch asset is a pale placeholder)

**Routes / links (confirmed):**
- `demo.blessboard.com/about` → 200
- `demo.blessboard.com/leadership` → 200
- Public nav + mobile drawer → `/about`, `/leadership`
- Branch footer → `/about`, `/contact` (no broken routes)
- `getproapp.org/about` → not a BlessBoard branch page
- `unknownslug.blessboard.com` → friendly Church not found
- `demo.blessboard.com/admin/churches/new` → 404 (apex-only)
- Unauthenticated `/branch/*` and `/member/*` → redirect to login

---

## Screen mapping

Statuses: **Matches** · **Close** · **Partial** · **Placeholder** · **Missing** · **Needs mobile fix** · **Needs desktop fix**

### Public website

| Screen | Device | PNG File | Current Route | Current View | Match Status | Missing Design Items |
|--------|--------|----------|---------------|--------------|--------------|----------------------|
| Public homepage (BlessBoard apex) | Desktop | `01-public-website/01-public-home-desktop/01-public-home-desktop.png` | `/` (blessboard.com) | `home.ejs` + `home_apex.ejs` | Close | Brand text BlessBoard (PNG says GetPro Church); Stitch source images are ~512px |
| Public homepage (BlessBoard apex) | Mobile | `01-public-website/01-public-home-mobile/01-public-home-mobile.png` | `/` | `home.ejs` | Partial | Apex mobile shows SaaS stack; PNG is branch church mobile |
| Public homepage (branch) | Desktop | `01-public-website/01-public-home-desktop/01-public-home-desktop.png` | `/` (demo.blessboard.com) | `home_branch.ejs` includes `home_apex` | Close | Same SaaS desktop layout as apex at ≥900px |
| Public homepage (branch) | Mobile | `01-public-website/01-public-home-mobile/01-public-home-mobile.png` | `/` | `home_branch.ejs` | Close | Map asset includes phone chrome (CSS-cropped); nearby avatars are initials placeholders |
| About | Desktop | `01-public-website/02-public-about-desktop/02-public-about-desktop.png` | `/about` | `views/church/public/about.ejs` | Close | BlessBoard brand (PNG: GetPro Church); Stitch images ~512–1024px |
| About | Mobile | `01-public-website/02-public-about-mobile/02-public-about-mobile.png` | `/about` | `about.ejs` | Close | Map is Stitch light placeholder + pin; bottom tab bar not used (drawer + FAB instead) |
| Leadership | Desktop | `01-public-website/03-public-leadership-desktop/03-public-leadership-desktop.png` | `/leadership` | `views/church/public/leadership.ejs` | Close | DB names override Stitch demo names when published; photos from Stitch assets |
| Leadership | Mobile | `01-public-website/03-public-leadership-mobile/03-public-leadership-mobile.png` | `/leadership` | `leadership.ejs` | Close | Ministry leader names are layout demo unless editor adds them; bottom tab bar not used |
| Ministries | Desktop | `01-public-website/04-public-ministries-desktop/04-public-ministries-desktop.png` | `/ministries` | `views/church/public/ministries.ejs` | Close | Icon bento layout; no dedicated mobile PNG in export |
| Ministries | Mobile | *(no dedicated PNG in export set)* | `/ministries` | `ministries.ejs` | Close | Stacked bento from desktop design; no mobile PNG |
| Events / Calendar | Desktop | `01-public-website/05-public-events-calendar-desktop/05-public-events-calendar-desktop.png` | `/events` | `views/church/public/events.ejs` | Close | Photo cards + filters; calendar toggle is visual-only |
| Events / Calendar | Mobile | `01-public-website/05-public-events-calendar-mobile/05-public-events-calendar-mobile.png` | `/events` | `events.ejs` | Close | Featured + list cards; bottom tab bar not used |
| Sermons / Resources | Desktop | `01-public-website/06-public-sermons-resources-desktop/06-public-sermons-resources-desktop.png` | `/sermons` | `views/church/public/sermons.ejs` | Close | Featured hero + grid + study sidebar; filters visual-only |
| Sermons / Resources | Mobile | `01-public-website/06-public-sermons-resources-mobile/06-public-sermons-resources-mobile.png` | `/sermons` | `sermons.ejs` | Close | Featured + recent list + study resources |
| Giving information | Desktop | `01-public-website/07-public-giving-information-desktop/07-public-giving-information-desktop.png` | `/giving` | `views/church/public/giving.ejs` | Close | Stitch bento + QR; DB settings override demo; brand BlessBoard |
| Giving information | Mobile | `01-public-website/07-public-giving-information-mobile/07-public-giving-information-mobile.png` | `/giving` | `giving.ejs` | Close | Accordion methods + QR hero; bottom tab bar not used |
| Contact | Desktop | `01-public-website/08-public-contact-desktop/08-public-contact-desktop.png` | `/contact` | `views/church/public/contact.ejs` | Close | Info + map + form + Sunday CTA; form posts to DB |
| Contact | Mobile | `01-public-website/08-public-contact-mobile/08-public-contact-mobile.png` | `/contact` | `contact.ejs` | Close | Quick actions, map, hours, form; bottom tab bar not used |

### Authentication

| Screen | Device | PNG File | Current Route | Current View | Match Status | Missing Design Items |
|--------|--------|----------|---------------|--------------|--------------|----------------------|
| Member login | Desktop | `02-authentication/09-auth-member-login-desktop/09-auth-member-login-desktop.png` | `/login` | `views/church/auth/login.ejs` | Close (v38) | Brand: Powered by GetPro (not GetPro Church); autofill chrome |
| Member login | Mobile | `02-authentication/09-auth-member-login-mobile/09-auth-member-login-mobile.png` | `/login` | `login.ejs` | Close (v38) | Same brand rule |
| Member registration | Desktop | `02-authentication/10-auth-member-registration-desktop/10-auth-member-registration-desktop.png` | `/register` | `views/church/auth/register.ejs` | Close (v38) | Product enums; single-page (no multi-step Continue) |
| Member registration | Mobile | `02-authentication/10-auth-member-registration-mobile/10-auth-member-registration-mobile.png` | `/register` | `register.ejs` | Close (v38) | Same |
| Registration submitted | Desktop | `02-authentication/11-auth-registration-submitted-desktop/11-auth-registration-submitted-desktop.png` | `/registration-submitted` | `views/church/auth/registration_submitted.ejs` | Close (v38) | No fake Submission ID/timestamp |
| Registration submitted | Mobile | `02-authentication/11-auth-registration-submitted-mobile/11-auth-registration-submitted-mobile.png` | `/registration-submitted` | `registration_submitted.ejs` | Close (v38) | Icon-led mobile (hero desktop-only) |
| Waiting verification | Desktop | `02-authentication/12-auth-waiting-verification-desktop/12-auth-waiting-verification-desktop.png` | `/waiting-verification` | `views/church/auth/waiting_verification.ejs` | Close (v38) | Needs pending session; no Stitch reference ID |
| Waiting verification | Mobile | `02-authentication/12-auth-waiting-verification-mobile/12-auth-waiting-verification-mobile.png` | `/waiting-verification` | `waiting_verification.ejs` | Close (v38) | Same |
| Forgot password | Desktop | `02-authentication/13-auth-forgot-password-desktop/13-auth-forgot-password-desktop.png` | `/forgot-password` | `views/church/auth/forgot_password.ejs` | Close (v38) | Extra optional fields for branch review flow |
| Forgot password | Mobile | `02-authentication/13-auth-forgot-password-mobile/13-auth-forgot-password-mobile.png` | `/forgot-password` | `forgot_password.ejs` | Close (v38) | Same; tips adapted (no email-link promise) |

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

# About + Leadership screenshots (390 + 1440)
node scripts/screenshot-blessboard-about-leadership.js

# Targeted tests for this pass
node --test tests/church-visual-design.test.js tests/church-branding.test.js tests/church-blessboard-admin-host.test.js

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
| http://localhost:3000/about with demo host | About (Stitch dual layout) |
| http://localhost:3000/leadership with demo host | Leadership (Stitch dual layout) |
| http://localhost:3000/register with demo host | Registration form |
| http://localhost:3000/login | Login with brand lockup |
| http://localhost:3000/ with `Host: getproapp.org` | GetPro platform (unchanged) |

### Production URLs

| URL | Expected |
|-----|----------|
| https://blessboard.com | BlessBoard landing |
| https://demo.blessboard.com | Demo church site |
| https://demo.blessboard.com/about | About page |
| https://demo.blessboard.com/leadership | Leadership page |
| https://demo.blessboard.com/register | Member registration |
| https://blessboard.com/admin/churches/new | Provisioning (after admin login) |
| https://getproapp.org | GetPro platform |

---

## Files changed in About / Leadership visual pass (v35)

- `views/church/public/about.ejs` — dual mobile/desktop Stitch layouts
- `views/church/public/leadership.ejs` — featured pastor, elders, ministry leaders, admin tiles
- `public/church/church.css` — About/Leadership fidelity styles; cache `?v=35`
- `public/church/images/about/*`, `public/church/images/leadership/*` — Stitch assets
- All church shells referencing `church.css?v=39`
- `tests/church-visual-design.test.js` — CSS version + About/Leadership markers
- `scripts/screenshot-blessboard-about-leadership.js`
- `docs/blessboard-screen-implementation-status.md` — This file

---

## Batch B — Authentication (v38)

| Screen | Device | PNG | Route | View | CSS version | Match status | Remaining differences |
|--------|--------|-----|-------|------|-------------|--------------|----------------------|
| Member login | Desktop | `09-auth-member-login-desktop.png` | `/login` | `church/auth/login.ejs` | v38 | Close | Brand: church name + Powered by GetPro (not “GetPro Church”); Stitch submission IDs not shown |
| Member login | Mobile | `09-auth-member-login-mobile.png` | `/login` | `church/auth/login.ejs` | v38 | Close | Same brand rule; browser autofill may alter input chrome |
| Registration | Desktop | `10-auth-member-registration-desktop.png` | `/register` | `church/auth/register.ejs` | v38 | Close | Age/attendance option labels come from product enums (not Stitch sample lists); single-page form (no multi-step Continue) |
| Registration | Mobile | `10-auth-member-registration-mobile.png` | `/register` | `church/auth/register.ejs` | v38 | Close | Same enum / single-page differences |
| Registration submitted | Desktop | `11-auth-registration-submitted-desktop.png` | `/registration-submitted` | `church/auth/registration_submitted.ejs` | v38 | Close | No fake Submission ID / timestamp (honest status meta); brand footer differs from Stitch |
| Registration submitted | Mobile | `11-auth-registration-submitted-mobile.png` | `/registration-submitted` | `church/auth/registration_submitted.ejs` | v38 | Close | Same; desktop hero image hidden on mobile per Stitch mobile (icon-led) |
| Waiting verification | Desktop | `12-auth-waiting-verification-desktop.png` | `/waiting-verification` | `church/auth/waiting_verification.ejs` | v38 | Close | Requires pending member session; no Stitch reference ID; branch location from DB |
| Waiting verification | Mobile | `12-auth-waiting-verification-mobile.png` | `/waiting-verification` | `church/auth/waiting_verification.ejs` | v38 | Close | Illustration from Stitch mobile HTML; copy adapted to product |
| Forgot password | Desktop | `13-auth-forgot-password-desktop.png` | `/forgot-password` | `church/auth/forgot_password.ejs` | v38 | Close | Product keeps optional name/phone/email fields (admin review flow); Stitch shows identifier-only |
| Forgot password | Mobile | `13-auth-forgot-password-mobile.png` | `/forgot-password` | `church/auth/forgot_password.ejs` | v38 | Close | Same field set; tips adapted (no email-link promise — branch reviews requests) |

**Screenshots:** `test-results/blessboard-stitch-visual/auth/` via `node scripts/screenshot-blessboard-all-screens.js --batch=B`

**Waiting-verification screenshot note:** script seeds a pending `churchMember` session. Live: log in as a pending member.

**Out of Batch B PNG set (kept working):** `/branch/login`, `blessboard.com/admin/login`, `/forgot-password-submitted`, `register_closed.ejs`.

---

## Screens still not matching (priority follow-ups)

1. **Member portal (Batch C)** — dashboard and portal pages vs Stitch
2. **Branch admin (Batch D)** — dashboard density vs Stitch
3. **Platform / HQ admin (Batch E)** — apex admin vs Stitch
4. **Events calendar grid** — month view widget not implemented
5. **Sermons** — real media players vs demo cards
6. **Branch admin login** — no dedicated Stitch PNG in auth set
7. **Leadership photo uploads** — website editor photo fields not wired
8. **Contact form** — works; Stitch subject dropdown not required for DB submit
9. **Stitch bottom tab bars** — product uses drawer + FAB instead (intentional)

Stitch HTML for About/Leadership lives under `design-reference/stitch-screens/church-flow/01-public-website/`.
