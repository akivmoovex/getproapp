# BlessBoard Stitch Asset Map

**Last updated:** 2026-07-10  
**CSS freeze baseline:** v36; Batch A starts v37  
**Goal:** Localize Stitch `aida-public` images into `public/church/images/` and wire them in EJS/CSS. Do **not** serve Stitch PNGs as UI.

**Related:** [`docs/blessboard-stitch-screen-inventory.md`](blessboard-stitch-screen-inventory.md)

---

## Localized assets (public website — done through v36)

All paths below are under `public/church/images/`.

### Homepage (`01-public-home-*`)

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Home desktop | Hero auditorium | `01-public-home-desktop.png` | `homepage/desktop-hero-auditorium.jpg` | Yes (Stitch HTML) | Done |
| Home desktop | Social avatars ×3 | `01-public-home-desktop.png` | `homepage/desktop-avatar-1.jpg` … `desktop-avatar-3.jpg` | Yes | Done |
| Home desktop | Member directory shot | `01-public-home-desktop.png` | `homepage/desktop-feature-directory.jpg` | Yes | Done |
| Home desktop | Coordination illustration | `01-public-home-desktop.png` | `homepage/desktop-feature-coordination.jpg` | Yes | Done |
| Home mobile | Hero sanctuary | `01-public-home-mobile.png` | `homepage/mobile-hero-sanctuary.jpg` | Yes | Done |
| Home mobile | Map card | `01-public-home-mobile.png` | `homepage/mobile-map-kafue.jpg` | Yes (includes phone chrome; CSS-cropped) | Done |
| Home mobile | Ministry — Children | `01-public-home-mobile.png` | `homepage/mobile-ministry-children.jpg` | Yes | Done |
| Home mobile | Ministry — Youth | `01-public-home-mobile.png` | `homepage/mobile-ministry-youth.jpg` | Yes | Done |
| Home mobile | Ministry — Worship | `01-public-home-mobile.png` | `homepage/mobile-ministry-worship.jpg` | Yes | Done |

### About (`02-public-about-*`)

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| About mobile | Hero church exterior | `02-public-about-mobile.png` | `about/about-mobile-hero.jpg` | Yes | Done |
| About mobile | Find Us map | `02-public-about-mobile.png` | `about/about-map.jpg` | Yes (Stitch light placeholder) | Done |
| About desktop | Branch building photo | `02-public-about-desktop.png` | `about/about-branch-building.jpg` | Yes | Done |
| About desktop | Service culture collage ×4 | `02-public-about-desktop.png` | `about/about-culture-1.jpg` … `about-culture-4.jpg` | Yes | Done |
| About desktop | Values icons | `02-public-about-desktop.png` | Material Symbols | Yes (icons, not bitmaps) | Done |

### Leadership (`03-public-leadership-*`)

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Leadership mobile | Featured pastor | `03-public-leadership-mobile.png` | `leadership/pastor-mobile.jpg` | Yes | Done |
| Leadership mobile | Ministry leaders ×3 | `03-public-leadership-mobile.png` | `leadership/ministry-m1.jpg` … `ministry-m3.jpg` | Yes | Done |
| Leadership desktop | Senior pastor | `03-public-leadership-desktop.png` | `leadership/pastor-desktop.jpg` | Yes | Done |
| Leadership desktop | Assistant pastor | `03-public-leadership-desktop.png` | `leadership/assistant-desktop.jpg` | Yes | Done |
| Leadership desktop | Elders ×4 | `03-public-leadership-desktop.png` | `leadership/elder-1.jpg` … `elder-4.jpg` | Yes | Done |
| Leadership desktop | Ministry leader avatars ×3 | `03-public-leadership-desktop.png` | `leadership/ministry-1.jpg` … `ministry-3.jpg` | Yes | Done |

### Contact (`08-public-contact-*`)

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Contact desktop | Map | `08-public-contact-desktop.png` | `contact/contact-map-desktop.jpg` | Yes | Done |
| Contact mobile | Map | `08-public-contact-mobile.png` | `contact/contact-map-mobile.jpg` | Yes | Done |

### Events (`05-public-events-calendar-*`)

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Events desktop | Card photos ×4 | `05-public-events-calendar-desktop.png` | `events/event-1.jpg` … `event-4.jpg` | Yes | Done |
| Events mobile | Featured photo | `05-public-events-calendar-mobile.png` | `events/event-featured-mobile.jpg` | Yes | Done |

### Sermons (`06-public-sermons-resources-*`)

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Sermons desktop | Featured + grid | `06-public-sermons-resources-desktop.png` | `sermons/sermon-featured-desktop.jpg`, `sermon-1.jpg` … `sermon-3.jpg` | Yes | Done (featured now uses live embed; thumbs remain) |
| Sermons mobile | Featured + thumbs | `06-public-sermons-resources-mobile.png` | `sermons/sermon-featured-mobile.jpg`, `sermon-thumb-1.jpg`, `sermon-thumb-2.jpg` | Yes | Done |
| Sermons media demo | YouTube / MP3 / PDF | — | `demo-media/sermon-demo.mp3` (~60s), `demo-media/sermon-notes-demo.pdf`; embed via `SERMON_DEMO_MEDIA.demoVideoEmbedUrl` | Yes (placeholders) | Wired v44–v45; Phase 2 upload/storage |

### Ministries (`04-public-ministries-desktop`)

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Ministries | Icons only | `04-public-ministries-desktop.png` | Material Symbols | Yes | Done |
| Ministries mobile | — | *(no PNG)* | Same bento stack | N/A | Missing PNG pair; desktop design stacked for mobile |

### Public not-found

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Public not-found | — | no PNG | — | Missing PNG | Keep current `not_found.ejs` styling |

---

## Batch A — Giving assets

Source PNGs: `01-public-website/07-public-giving-information-{desktop,mobile}/`  
Localized targets: `public/church/images/giving/`

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Giving desktop | QR / scan card | `07-public-giving-information-desktop.png` | `giving/giving-qr-desktop.jpg` | Yes from Stitch HTML | Wire in Batch A |
| Giving mobile | QR hero | `07-public-giving-information-mobile.png` | `giving/giving-qr-mobile.jpg` | Yes | Wire |
| Giving desktop | Transparency / landscape photo | `07-public-giving-information-desktop.png` | `giving/giving-transparency.jpg` (if 2nd URL) **or** Material/CSS only | Check — desktop Stitch HTML has **one** `aida-public` URL (serene Kafue landscape background); mobile has **one** (portrait/headshot). Confirm whether QR is CSS/Material-generated vs a separate downloadable bitmap before inventing a second file | Check / Wire |
| Ministries | icons only | `04-public-ministries-desktop.png` | Material Symbols | Yes | Done |
| Public not-found | — | no PNG | — | Missing PNG | — |

**Stitch HTML notes (2026-07-10):**

- Desktop giving HTML: one `aida-public` background image (landscape / transparency band).
- Mobile giving HTML: one `aida-public` image (friendly member headshot used as QR/hero visual in the mock).
- Files already present on disk: `giving/giving-qr-desktop.jpg`, `giving/giving-qr-mobile.jpg`. Wire these in Batch A EJS/CSS (`church.css?v=38`). If a distinct transparency photo is needed beyond the desktop landscape URL, export/download that URL as `giving/giving-transparency.jpg`; otherwise treat transparency as Material/CSS-only.

---

## Assets still needed (later batches)

Export from Stitch when each batch starts (do not block Batch A):

| Batch | Module | Likely assets | Notes |
|-------|--------|---------------|--------|
| C | Member | Dashboard avatars, event thumbs, ministry cards, form icons | From `14`–`20` Stitch HTML |
| E | Leader / HQ / Platform | Leader roster photos, HQ broadcast art, platform dashboard charts | From `46`–`50`, `58`–`61` (mobile only), `62`–`68` |

Until exported, Batch E screens remain **Partial** with functional EJS and placeholder/CSS treatment.

---

## Asset directory layout

```
public/church/images/
  homepage/     # v34 — done
  about/        # v35 — done
  leadership/   # v35 — done
  contact/      # v36 — done
  events/       # v36 — done
  sermons/      # v36 — done
  giving/       # Batch A — QR JPGs present; wire + transparency check
  auth/         # Batch B — login bg, submitted, waiting, forgot illustrations
  member/       # Batch C — avatars, heroes, events, ministries, resources
  branch-admin/ # Batch D — pastor avatar, map, event covers, sermon/resource thumbs
  admin/        # Batch E — platform admin avatar + provision map
  ministries/   # icons via Material Symbols (no photo set)
```

---

## Batch B — Authentication assets (v38)

Localized from Stitch HTML `aida-public` URLs into `public/church/images/auth/`.

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Login desktop | Atmospheric sanctuary background | `09-auth-member-login-desktop.png` | `auth/login-bg-desktop.jpg` | Yes (Stitch HTML) | Wired (desktop only, low opacity) |
| Login mobile | Logo / icons only | `09-auth-member-login-mobile.png` | Material Symbols + CSS | Yes (no photo in HTML) | Wired |
| Registration | Form / section icons | `10-auth-member-registration-*.png` | Material Symbols | Yes (no photo in HTML) | Wired |
| Registration submitted desktop | Sanctuary hero illustration | `11-auth-registration-submitted-desktop.png` | `auth/registration-submitted.jpg` | Yes | Wired |
| Registration submitted mobile | Check / info icons | `11-auth-registration-submitted-mobile.png` | Material Symbols | Yes (no photo) | Wired |
| Waiting verification mobile | Illustration | `12-auth-waiting-verification-mobile.png` | `auth/waiting-verification.jpg` | Yes | Wired (mobile hero) |
| Waiting verification desktop | Calendar / status icons | `12-auth-waiting-verification-desktop.png` | Material Symbols | Yes (no photo in desktop HTML) | Wired |
| Forgot password desktop | Side illustration | `13-auth-forgot-password-desktop.png` | `auth/forgot-password.jpg` | Yes | Wired (desktop two-column) |
| Forgot password mobile | Tips / icons | `13-auth-forgot-password-mobile.png` | Material Symbols | Yes (no photo) | Wired |

**Brand note:** Stitch footers say “Powered by GetPro Church”; product uses **Powered by GetPro** secondary + church name / BlessBoard primary.

---

## Batch C — Member portal assets (v40)

Localized into `public/church/images/member/` (Stitch downloads + reused public church photos).

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Dashboard / shell | Member avatar | `14-member-dashboard-*.png` | `member/avatar-member.jpg` (from Stitch Mary Phiri) | Yes | Wired in sidebar + mobile top bar |
| Dashboard desktop | Hero garden image | `14-member-dashboard-desktop.png` | `member/dashboard-hero-garden.jpg` | Yes (Stitch HTML) | Wired |
| Dashboard / events | Event card photos | `14` / `17` | `member/event-1..3.jpg`, `event-featured.jpg` | Reused from `events/` | Wired |
| Announcements | Featured hero | `16-member-announcements-desktop.png` | `member/announcement-featured.jpg` | Reused from sermons | Wired |
| My ministries | Cover photos | `18-member-my-ministries-*.png` | `member/ministry-*.jpg` | Reused homepage/leadership | Wired |
| My ministries | Leader avatars | `18-member-my-ministries-desktop.png` | `member/avatar-leader-*.jpg` | Reused homepage avatars | Wired |
| Resources | Hero + thumbs | `19-member-resources-study-*.png` | `member/resource-*.jpg` | Reused sermons | Wired |
| Profile | Area map | `15-member-profile-mobile.png` | `member/profile-map-kafue.jpg` | Reused homepage map | Wired |
| Forms | Row icons | `20-member-forms-documents-mobile.png` | Material Symbols | Yes (icons) | Wired |
| Requests / prayer / giving | — | *(no PNG in 03-member-portal)* | Shell + form layouts | N/A | Shell-aligned only |

**Not created:** `/member/learning` assets (no Stitch PNG / route).

---

## Batch D — Branch admin assets (v41)

Localized into `public/church/images/branch-admin/`.

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Shell / dashboard | Admin avatar | `25-branch-admin-dashboard-*.png` | `branch-admin/avatar-pastor-stitch.jpg` | Yes (Stitch / shared) | Wired in sidebar + top bars |
| Dashboard | Branch map | `25-branch-admin-dashboard-desktop.png` | `branch-admin/map-kafue.jpg` | Reused / localized | Wired |
| Events management | Event covers | `32-branch-events-management-*.png` | `branch-admin/event-cover-1..3.jpg` | Reused events assets | Wired |
| Sermons (no PNG) | Thumb | — | `branch-admin/sermon-thumb.jpg` | Reused sermons | Shell-aligned |
| Resources (no PNG) | Thumb | — | `branch-admin/resource-thumb.jpg` | Reused | Shell-aligned |
| Verification / nav | Icons | `26-*.png` | Material Symbols | Yes | Wired |
| Charts / budget ring | Desktop/mobile dash | `25-*.png` | CSS + Material (no live chart lib) | Partial | Static/demo treatment |

**Brand note:** Stitch uses “Ecclesia Branch / HQ Admin Portal”; product uses church name + **Branch Admin · BlessBoard** and **Powered by GetPro**.

---



## Batch E — Platform admin assets (v42)

Localized into `public/church/images/admin/`.

| Screen | Design element | PNG file | Current asset | Exact asset found? | Action |
|--------|----------------|----------|---------------|--------------------|--------|
| Shell / dashboard | Admin avatar | `62-platform-admin-dashboard-*.png` | `admin/avatar-admin.jpg` | Yes (Stitch HTML) | Wired in sidebar + top bars |
| Create organization | Map / onboarding visual | `64-platform-create-church-organization-mobile.png` | `admin/provision-map.jpg` | Yes (Stitch HTML) | Wired in onboarding card |
| Organizations / diagnostics | Icons | `63` / `68` | Material Symbols | Yes | Wired |
| Charts / MRR | Dashboard / orgs | `62` / `63` | CSS only (no live chart lib) | Partial | Static/demo treatment |
| HQ avatars | `58`–`61` mobile | — | Not exported this batch | Missing | HQ shell uses Material + existing church assets |

**Brand note:** Stitch uses “Moovex/GetPro”; product uses **BlessBoard Admin** + **Powered by GetPro**.


## Batch status (assets)

| Batch | Scope | CSS | Asset status |
|-------|--------|-----|--------------|
| A | Giving + public remaining | v37–v38 | Complete |
| B | Auth | v38 | Complete |
| C | Member | v40 | Complete — `public/church/images/member/` |
| D | Branch admin | v41 | Complete — `public/church/images/branch-admin/` |
| E | Platform / HQ | v42 | Complete — `public/church/images/admin/` |
