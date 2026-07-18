# BlessBoard V5 public Stitch implementation

**Last updated:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591` (GetPro Church Platform)  
**Tokens:** Sacred Modernity — Hanken Grotesk, violet `#6C5CE7`, GetPro orange (not Stitch HTML Inter / `#3b22b5`).

---

## Batch 1 — Shell + Home + About

### Stitch IDs

| Surface | Device | Screen title | Screen ID |
|---------|--------|--------------|-----------|
| Home | Desktop | `01-public-home-desktop-v2 (Refined)` | `ead45db5be774baa9454412262096ffc` |
| Home | Mobile | `01-public-home-mobile-v2 (Refined)` | `89177588fbf8405dbebd5747c38e19ce` |
| About | Desktop | `02-public-about-desktop-v3 (Populated)` | `44492f6abbe849d0a8a89303ce83129b` |
| About | Mobile | `02-public-about-mobile-v3 (Populated)` | `3f0b8a5c30544d9495064df8d5f9e62e` |

### Files

| File | Role |
|------|------|
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Header, desktop nav, mobile drawer, SEO |
| `views/blessboard/v5/partials/tenant-public-shell-end.ejs` | Footer + drawer script |
| `views/blessboard/v5/public/page.ejs` | Shared page wrapper |
| `views/blessboard/v5/public/home.ejs` | Home hero + published sections + explore shortcuts |
| `views/blessboard/v5/public/about.ejs` | About hero + published sections + join CTA |
| `public/blessboard/v5/tenant-public.css` | Shell + home/about layout |
| `public/blessboard/v5/tenant-public.js` | Accessible mobile drawer |
| `src/blessboard/http/loadTenantPublicPageModel.js` | Branch → church → empty published content |

**Not copied from Stitch:** fabricated member counts, service-time widgets, prayer forms, newsletter signup, or demo announcements.

---

## Batch 2a — Leadership + Ministries (2026-07-18)

### Stitch IDs

| Surface | Device | Screen title | Screen ID |
|---------|--------|--------------|-----------|
| Leadership | Desktop | `03-public-leadership-desktop-v2 (Populated)` | `372faa60f8df4983b627db3cb5d35f9d` |
| Leadership | Mobile | `03-public-leadership-mobile-v4 (Restored)` | `0f4e816fd64d4592bd3677fbde3b7544` |
| Leadership empty | Desktop | `03-public-leadership-desktop-v2 (Empty)` | `5f7b1d44bd454d45a0b72fb76d94bbd0` |
| Ministries | Desktop | `04-public-ministries-desktop-v4 (Populated)` | `f146cdccadb34ff3bd8b0b75a0450d15` |
| Ministries | Mobile | `04-public-ministries-mobile-v4 (Populated)` | `d2fd7ecc586541d3beb5d0d3bed98d56` |

### Files

| File | Role |
|------|------|
| `views/blessboard/v5/public/leadership.ejs` | Featured leader + mobile list / desktop cards |
| `views/blessboard/v5/public/ministries.ejs` | Ministry card grid |
| `public/blessboard/v5/tenant-public.css` | Directory layouts (`?v=7`) |
| `src/blessboard/http/loadTenantPublicPageModel.js` | CSS cache bump only |

**Shell unchanged.** Events/Sermons untouched in this pass.

### Intentional V4 / Stitch differences

| Item | V5 behavior |
|------|-------------|
| Contact Pastor / View Profile | Not rendered (no leader contact/profile routes) |
| View Schedule / impact stats | Not rendered (no fabricated schedules or metrics) |
| Join a Ministry | Links to `/contact` (supported) |
| Image fallback | Initials avatar / ministry icon mesh — no stock portraits |
| Nav set | Full V5 public routes (not Stitch’s shorter demo nav) |

---

## Batch 2 — Leadership, Ministries (directory foundations)

See **Batch 2a** above for Leadership + Ministries. Events/Sermons were completed in Batch 3.

Calendar Stitch variants (`05-public-events-calendar-*`) are **not** implemented — V5 data model is an event list.

---

## Batch 3 — Events + Sermons (2026-07-18)

### Stitch IDs

| Surface | Device | Screen title | Screen ID |
|---------|--------|--------------|-----------|
| Events | Desktop | `05-public-events-desktop-v2 (Populated)` | `6f618576f0304982bd239bfe04946e72` |
| Events | Mobile | `05-public-events-mobile-v2 (Populated)` | `f58c416cbbd545429258d963b3a15b60` |
| Events empty | Desktop | `05-public-events-desktop-v2 (Empty)` | `6c3a2b460ac54e6a88336af9085e8c38` |
| Sermons | Desktop | `06-public-sermons-desktop-v2 (Populated)` | `4f4995dc4ec84354ac80ed022a767ef3` |
| Sermons | Mobile | `06-public-sermons-mobile-v2 (Populated)` | `96b380d4e47649c1bd7f05cabe9c3a1d` |
| Sermons empty | Desktop | `06-public-sermons-desktop-v2 (Empty)` | `0c7262cdda4547739ec0c1fa5128fb51` |

### Files changed (batch 3)

| File | Role |
|------|------|
| `views/blessboard/v5/public/events.ejs` | Featured + upcoming list; Register only when safe URL |
| `views/blessboard/v5/public/sermons.ejs` | Featured + recent list; media/resource only when safe URL |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `preparePublicEvents`, `mapEvent`/`mapSermon` + `safeExternalUrl`, `cssHref?v=8` |
| `src/blessboard/http/renderTenantPublicPage.js` | `formatEventParts` / `formatDate` (timezone-safe) |
| `src/blessboard/http/tenantPublicSafe.js` | `safeExternalUrl` allowlist |
| `public/blessboard/v5/tenant-public.css` | Events/sermons layouts |
| `tests/blessboard-public-pages.test.js` | Ordering, timezone, published filter, safe URLs, isolation |
| `docs/ui/V5_STITCH_SCREEN_MAP.md` | Events/sermons → Done B3 |

**Shell structure unchanged.** Leadership/Ministries templates unchanged in this pass.

### Content rules (batch 3)

| Rule | Behavior |
|------|----------|
| Published only | Draft/cancelled never listed (`status: published` query) |
| Upcoming first | `preparePublicEvents` omits past (`endsAt` else `startsAt` vs now), sorts ASC by `startsAt` |
| Timezone-safe | `formatEventParts(startsAt, event.timezone)` |
| Registration | Button only when `safeExternalUrl(registrationUrl)` is non-null |
| No fake counts | No capacity/attendee chrome unless real data is shown (none fabricated) |
| Sermons published | Draft omitted |
| Media / resource | Buttons only for safe http(s) URLs; no iframes/embeds |
| No placeholders | Empty state when no published upcoming events / sermons |

### Known visual differences vs Stitch

1. No calendar UI (list/featured only).
2. No fake duration badges, series labels, or scripture fields (not in V5 schema).
3. Sacred Modernity tokens vs Stitch Inter/indigo export.

### Tests (batch 3)

```bash
npm run test:blessboard:public-pages      # 21/21
```

---

## Batch 4 — Contact + Giving (2026-07-18)

### Stitch IDs

| Surface | Device | Screen title | Screen ID |
|---------|--------|--------------|-----------|
| Contact | Desktop | `08-public-contact-desktop-v2 (Populated)` | `ab93d842bf2e49caa838a1fd414eb35b` |
| Contact | Mobile | `08-public-contact-mobile-v2 (Populated)` | `9cbad6aacb6246549913e275f228fa80` |
| Giving | Desktop | `07-public-giving-desktop-v2 (Populated)` | `59c8fdedf68a43e3a5d2384b0c2212df` |
| Giving | Mobile | `07-public-giving-mobile-v2 (Populated)` | `a0616f23568c464a95eda9e317e2fa9d` |
| Giving empty | Desktop | `07-public-giving-desktop-v2 (Empty)` | `a08093b9ec32467bad300ef43ac800fa` |

### Files changed (batch 4)

| File | Role |
|------|------|
| `views/blessboard/v5/public/contact.ejs` | Channel + settings cards; OSM map when coords valid |
| `views/blessboard/v5/public/giving.ejs` | Method cards; informational disclaimer; no payment UI |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `buildPublicContact`, channel/method mapping, `cssHref?v=9` |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS `?v=9` |
| `public/blessboard/v5/tenant-public.css` | Contact/giving layouts |
| `tests/blessboard-public-pages.test.js` | Hierarchy, map, published filter, safe URLs, shell |
| `docs/ui/V5_STITCH_SCREEN_MAP.md` | Contact/Giving → Done B4 |

**Shell structure unchanged.**

### Data sources

| UI | Source |
|----|--------|
| Contact channels | Published `contact_channels` (branch first, then church-wide) |
| Phone / email fallback cards | `branch_settings.phone` / `.email`, else `church_settings.primary_phone` / `.primary_email` |
| Address card | Branch `address_line_1/2`, `city`, `province_state`, `postal_code` (non-empty parts only) |
| Map + directions | Only when both `latitude` and `longitude` are finite and in range; OpenStreetMap embed/link via `safeExternalUrl` |
| Giving methods | Published `giving_methods` (branch first, then church-wide) |
| Page intro / extras | Published `page_sections` for contact/giving keys |
| External links | `safeExternalUrl` (`http`/`https`/`mailto`/`tel` only) |

### Empty states

| Page | Empty when |
|------|------------|
| Contact | No published channels, no sections, and no public settings contact (email/phone/address/coords) |
| Giving | No published methods and no sections |

Empty copy is intentional; giving empty state links to `/contact` and states that payments are not processed on-page.

### Content rules (batch 4)

- Do not fabricate address, phone, email, map, or giving methods
- Map iframe only with valid coordinates
- No contact message form (no private data collection)
- No service times / office hours chrome (not in V5 settings schema)
- No payment processing, amount fields, or financial account collection
- No V4 logic / no migrations / no auth changes

### Known visual differences vs Stitch

1. No “Send a Message” form (privacy / no V5 public contact POST).
2. No fabricated service times, office hours, newsletter, or impact stats.
3. Map uses OpenStreetMap embed when coordinates exist — not Stitch demo map imagery.
4. Giving shows published method cards only — no fake bank/mobile-money rows or QR.
5. Sacred Modernity tokens vs Stitch Inter/indigo.

### Tests (batch 4)

```bash
npm run test:blessboard:public-pages      # 24/24
npm run test:blessboard:tenant-routing    # 44/44 (shared-shell regression)
```

---

## Remaining gaps

- Home teasers from live ministries/events lists  
- Playwright visual regression at 1440 / 768 / 390 / 360  

---

## Batch 5 — Tenant registration GUI (2026-07-18)

### Stitch IDs

| Surface | Device | Screen title | Screen ID |
|---------|--------|--------------|-----------|
| Register | Desktop | `10-auth-member-registration-desktop` | `c360aef636d341a8ad3eb47c4c2e5c21` |
| Register | Mobile | `10-auth-member-registration-mobile` | `7d77190575b54d1b8277726570aec1c4` |
| Registration submitted | Desktop | `11-auth-registration-submitted-desktop` | `1d37704351d6425ca872f8803322175c` |
| Registration submitted | Mobile | `11-auth-registration-submitted-mobile` | `f222e55152c349cc880548037aa7d540` |
| Apex login (tenant `/login` transfer target) | Desktop | `09-auth-member-login-desktop` | `9b264ef3081f4b5aab493d9b9710b00b` |
| Apex login | Mobile | `09-auth-member-login-mobile` | `68a84bcc8dff4f4ca5836216c22a2e6a` |

Tenant `/login` remains **redirect-only** (no password form on tenant host). Stitch login chrome applies to the apex transfer login page. `/auth/callback` still redeems and redirects; failure uses styled `renderAuthErrorPage`.

### Files changed (batch 5)

| File | Role |
|------|------|
| `views/blessboard/v5/public/register.ejs` | Stitch dual-pane form; field errors + error summary |
| `views/blessboard/v5/public/register-submitted.ejs` | Confirmation chrome (no fake IDs / auto-account) |
| `public/blessboard/v5/tenant-auth.css` | Auth layout + field error styles (`?v=3`) |
| `public/blessboard/v5/tenant-auth.js` | Error-summary focus |
| `src/blessboard/http/tenantRegistrationRoutes.js` | Presentation-only `mapRegistrationFieldErrors` |
| `tests/blessboard-member-registration.test.js` | Field UX + confirmation assertions |
| `docs/ui/V5_STITCH_SCREEN_MAP.md` | Register → Done Reg |

**Not changed:** `memberRegistrationService`, CSRF validation, transfer create/redeem, cookies, redirects, throttling limits, schema, DB writes.

### Security preserved

| Control | Status |
|---------|--------|
| CSRF field + cookie | Unchanged (`_csrf` / `CSRF_FIELD`) |
| Hostname-derived church/branch | Unchanged — no IDs in form inputs |
| Submitted values after errors | Preserved in register view locals |
| Duplicate / generic errors | Same messages (no account-existence leak wording changes) |
| Tenant `/login` | Still 303 → apex `?tr=` (no tenant password UI) |
| Host-only session cookies | Unchanged (no shared Domain) |
| Auth callback | Still redeem + redirect; errors presentation-only |
| Logs | Structured events only — no email/phone/name in logs |

### Desktop / mobile behavior

| Width | Behavior |
|-------|----------|
| &lt; 900px | Single-column form; brand panel hidden |
| ≥ 900px | Dual-pane Stitch layout; first/last name side-by-side |

### Known visual differences vs Stitch

1. V5 register fields only (first/last/preferred/email/phone) — no gender, address, password, or ministry interests.
2. No fabricated submission ID or “24–48 hour” processing chrome on confirmation.
3. Explicit “account is not created automatically” copy (approval required).
4. Sacred Modernity tokens vs Stitch Inter/indigo.

### Tests (batch 5)

```bash
npm run test:blessboard:member-registration
npm run test:blessboard:tenant-routing
```
