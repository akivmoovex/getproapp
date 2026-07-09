# BlessBoard Content Management

Branch admins manage public website content through existing BlessBoard admin tools. Public pages read published content from PostgreSQL with safe fallbacks when data is missing.

**Last updated:** 2026-07-10

---

## Data model audit (existing vs new)

### Already existed (reused — no duplicate tables)

| Domain | Table | Notes |
|--------|-------|-------|
| Site copy (about, mission, leadership JSON, contact) | `church_branch_website_content` | One row per branch; publish workflow |
| Branch fallbacks | `church_branches` | `welcome_message`, `service_times`, `location_text`, contact fields |
| Events | `church_events` | Full CRUD via `/branch/events` |
| Ministries | `church_ministries` | Structured ministries + website JSON fallback |
| Giving | `church_giving_settings` | Structured giving config |
| Announcements | `church_announcements` | Public + member feeds |

### Added in migration `089_church_sermons_resources.sql`

| Table | Purpose |
|-------|---------|
| `church_sermons` | Public sermon archive (`title`, `speaker`, `sermon_date`, `description`, `media_url`, `scripture`, `category`, `status`) |
| `church_resources` | Member/public resources (`resource_type`: `study` \| `document` \| `form`, `visibility`, `file_url`, `external_url`, `status`) |

### Not added (by design)

| Suggested table | Reason |
|-----------------|--------|
| `church_leaders` | Public leadership lives in `church_branch_website_content.leadership_json`; operational leaders use `church_ministry_leaders` |
| `church_events` | Already exists |
| `church_public_content` | Use `church_branch_website_content` |
| `site_settings` | Split across `church_branches`, website content, giving settings |

---

## Repos

| Repo | File |
|------|------|
| Website content | `src/db/pg/church/websiteContentRepo.js` |
| Events | `src/db/pg/church/eventsRepo.js` |
| Sermons | `src/db/pg/church/sermonsRepo.js` |
| Resources | `src/db/pg/church/resourcesRepo.js` |

---

## Demo seeding

**File:** `src/seeds/seedChurchDemoOrganization.js`  
**Function:** `seedChurchDemoOrganizationIfMissing(pool)`

Idempotent seeds for `demo.blessboard.com`:

| Content | Seeded when missing |
|---------|---------------------|
| Organization `slug=demo` | BlessBoard Demo Church |
| Branch `host_slug=demo` | Active branch with contact/service times |
| Published website content | About, mission, vision, values, leadership JSON, contact |
| Announcements | 2 published items |
| Events | 2 published public events |
| Ministries | Worship Team, Youth Ministry |
| Sermons | 3 published sermons |
| Resources | Study, document, and form items for member portal |
| Branch admin | `admin@demo.blessboard.com` / `testpass123` |

Re-running seed does not duplicate rows (checks counts / published content existence).

---

## Public pages (DB-backed)

| Route | Data source |
|-------|-------------|
| `/` | Published website content + events + ministries + announcements |
| `/about` | `church_branch_website_content` (about/mission/vision/values) |
| `/leadership` | `leadership_json` from published website content |
| `/contact` | Contact fields from published website content + branch fallbacks |
| `/events` | `church_events` where `status=published`, `visibility=public` |
| `/sermons` | `church_sermons` where `status=published`; safe fallback if empty |
| `/member/resources` | `church_resources` type `study`, visibility `members` |
| `/member/forms` | `church_resources` types `form` + `document` |

---

## Branch admin routes

| Route | Purpose |
|-------|---------|
| `/branch/site` | Redirects to `/branch/website-editor` |
| `/branch/website-editor` | About, leadership JSON, contact, homepage copy (existing) |
| `/branch/events` | Event CRUD (existing) |
| `/branch/sermons` | Sermon list + create/edit/publish |
| `/branch/sermons/new` | Add sermon |
| `/branch/sermons/:id` | Edit sermon |
| `/branch/resources` | Resource list + create/edit/publish |
| `/branch/resources/new` | Add resource |
| `/branch/resources/:id` | Edit resource |

Login: `/branch/login` on branch host (e.g. `demo.blessboard.com/branch/login`).

---

## URLs to test

| URL | Expected |
|-----|----------|
| https://demo.blessboard.com/about | DB story + mission/vision from seeded website content |
| https://demo.blessboard.com/leadership | Rev. Demo Pastor + elders from `leadership_json` |
| https://demo.blessboard.com/events | Seeded Sunday Worship + Fellowship events |
| https://demo.blessboard.com/sermons | 3 seeded sermon cards |
| https://demo.blessboard.com/contact | Seeded phone/email/address |
| https://demo.blessboard.com/branch/website-editor | Edit site copy (admin login required) |
| https://demo.blessboard.com/branch/sermons | Manage sermons |
| https://demo.blessboard.com/branch/resources | Manage member resources |
| https://getproapp.org | Unchanged — no church `/about` |

---

## Commands

```bash
npm test -- tests/church-content-management.test.js tests/church-visual-design.test.js tests/church-branding.test.js tests/church-mvp-placeholder-screens.test.js
npm test
```

---

## Remaining gaps

- Contact form submission (display-only on public contact page)
- Leader photo URLs (initials placeholders; no `photo_url` on JSON leadership)
- Calendar month grid on `/events`
- File upload for resources/sermons (URL fields only for now)
- Giving page visual polish
- Ministries page image tiles/filters
- HQ/leader portal content management (out of scope)
