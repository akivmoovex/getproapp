# BlessBoard Church Onboarding

Platform super admins create new BlessBoard churches from the **BlessBoard platform admin** on `blessboard.com`. Each church gets a public subdomain at **`<slug>.blessboard.com`**.

**Last updated:** 2026-07-10

---

## Who can create a church

| Role | Access |
|------|--------|
| **BlessBoard platform admin (GetPro super admin)** | Full provisioning at `https://blessboard.com/admin/churches/new` |
| **Church HQ admin** | Read-only branch registry on branch host — cannot create branches |
| **Branch admin** | Manages content for their branch only |

HQ admins log in on a branch host at `/hq/login`. Branch admins log in at `/branch/login`.

> **Note:** Legacy URLs on `getproapp.org/admin/church/*` redirect to `blessboard.com/admin/*`.

---

## How to create a church

### 1. Sign in as BlessBoard platform admin

Open `https://blessboard.com/admin/login` with a GetPro **super admin** account.

### 2. Open the onboarding form

| Route | Purpose |
|-------|---------|
| `https://blessboard.com/admin/churches/new` | Primary onboarding form |
| `/admin/church/branches/new` | Redirects to the form above (internal alias) |

### 3. Fill in the form

| Section | Fields |
|---------|--------|
| Organization | Name, slug, country, city, plan |
| First branch | Name, **host slug** (subdomain), city, country, address, pastor, contact phone/email, status |
| Options | Publish starter website content, member registration enabled |
| HQ admin | Full name, email/phone, temporary password |
| Branch admin | Full name, **username** (optional), email/phone, temporary password |

The form shows a live preview: **`kafuebaptist.blessboard.com`** when slug is `kafuebaptist`.

### 4. Submit

On success you are redirected to the organization detail page with:

- Public site URL
- Branch admin login URL
- Member registration URL
- HQ login URL

---

## What gets created (transactional)

In one database transaction:

1. `church_organizations` row
2. `church_branches` row with `host_slug`
3. `church_hq_admins` — first HQ admin
4. `church_branch_admins` — first branch admin
5. `church_branch_website_content` — starter about/mission/vision/contact (published if “Publish starter website content” is checked)
6. Optional draft starter rows (non-blocking if they fail):
   - Draft event (“Sunday Worship Service”)
   - Draft sermon (“Welcome Message”)
7. Audit log entries

If website content fails, the entire transaction rolls back and the admin sees a friendly error.

---

## Slug / subdomain rules

| Rule | Detail |
|------|--------|
| Format | Lowercase letters, numbers, hyphens only |
| Pattern | `/^[a-z0-9][a-z0-9-]{0,62}$/` |
| Uniqueness | `host_slug` must be globally unique across all branches |
| Reserved | `www`, `admin`, `api`, `app`, `mail`, `demo`, `blessboard`, `getpro`, `support`, `static`, `assets`, `hq`, `branch`, `member`, `login`, `register`, and others |

The **`demo`** slug is reserved but already seeded for `demo.blessboard.com`.

---

## URL behavior

| Host | Behavior |
|------|----------|
| `blessboard.com` | BlessBoard marketing landing page |
| `demo.blessboard.com` | Demo church (seeded) |
| `kafuebaptist.blessboard.com` | Resolves branch where `host_slug = kafuebaptist` |
| `unknownslug.blessboard.com` | Friendly **Church not found** page (404) |
| `getproapp.org` | GetPro platform — no church routes |

Routing is handled by `attachChurchContext` → `findBranchByHostSlug`.

---

## Member registration

Registration is **host-driven** — no slug picker on the form.

| URL | Behavior |
|-----|----------|
| `https://<slug>.blessboard.com/register` | Creates `church_members` row with correct `branch_id` |
| `/registration-submitted` | Confirmation page after signup |
| `/branch/member-verification` | Branch admin approves/rejects pending members |

Requirements:

- Branch and organization must be **active** (not suspended/archived)
- Members are scoped to `branch_id` — branch admins never see another branch’s queue

---

## Branch admin content management

After onboarding, the branch admin signs in and manages:

| Route | Purpose |
|-------|---------|
| `/branch/website-editor` | About, leadership, contact, homepage copy |
| `/branch/events` | Events |
| `/branch/sermons` | Sermons |
| `/branch/resources` | Member resources and forms |

---

## Example: add kafuebaptist.blessboard.com

1. Super admin → `https://blessboard.com/admin/churches/new`
2. Organization name: **Kafue Baptist Church**
3. Organization slug: `kafuebaptist` (or different internal slug)
4. Branch host slug: **`kafuebaptist`** ← this becomes the subdomain
5. Branch name: **Kafue Baptist — Main**
6. Country: Zambia, City: Kafue, Address: your street address
7. Contact email/phone
8. Branch admin name, email, username, temporary password
9. HQ admin credentials
10. Check **Publish starter website content**
11. Submit

Hand off to the church:

| URL | User |
|-----|------|
| `https://kafuebaptist.blessboard.com` | Public visitors |
| `https://kafuebaptist.blessboard.com/branch/login` | Branch admin |
| `https://kafuebaptist.blessboard.com/register` | New members |
| `https://kafuebaptist.blessboard.com/hq/login` | HQ admin |

---

## DNS / SSL (Hostinger)

BlessBoard branch hosts use **`*.blessboard.com`**.

### Recommended: wildcard SSL

1. Add DNS **A record**: `*.blessboard.com` → your Hostinger Node.js server IP (or use Hostinger’s wildcard subdomain tool)
2. Issue **wildcard SSL** for `*.blessboard.com` in hPanel
3. Add **`blessboard.com`** and **`*.blessboard.com`** to the Node.js app **Domains** list (same app as GetPro if shared, or dedicated BlessBoard app)

### Without wildcard SSL

For each new church subdomain:

1. Add subdomain in hPanel (e.g. `kafuebaptist.blessboard.com`)
2. Point it to the same Node.js application
3. Issue individual SSL for that subdomain
4. Repeat for every new church (not scalable — prefer wildcard)

Ensure the **`Host`** header is forwarded to Node (LiteSpeed/reverse proxy). If Host is stripped, routing fails with wrong tenant or 503.

---

## Tables reused (no duplicate schema)

| Table | Role |
|-------|------|
| `church_organizations` | Church org |
| `church_branches` | Branch + `host_slug` |
| `church_branch_admins` | Branch admin auth |
| `church_hq_admins` | HQ admin auth |
| `church_branch_website_content` | Public site copy |
| `church_events`, `church_sermons` | Optional draft starters |

---

## Code references

| Area | Path |
|------|------|
| Onboarding service | `src/services/church/branchOnboardingService.js` |
| Provisioning repo | `src/db/pg/church/platformProvisioningRepo.js` |
| Validation | `src/church/platformProvisioningValidation.js` |
| Admin routes | `src/routes/admin/adminChurchPlatform.js` |
| Host routing | `src/church/attachChurchContext.js`, `src/church/host.js` |
| Demo seed | `src/seeds/seedChurchDemoOrganization.js` |

---

## Tests

```bash
npm test -- tests/church-onboarding.test.js
npm test -- tests/church-platform-provisioning.test.js tests/church-blessboard-subdomains.test.js
```

---

## Remaining gaps

- No automated DNS/SSL provisioning per church
- No welcome email with credentials
- No self-service church signup (super admin only)
- Welcome email automation (copyable handoff on provision success page instead)
- `member_registration_enabled` is stored on `church_branches` (default `true`); toggle in onboarding or branch admin Website Editor → Site settings
- File uploads for leader photos / resources still URL-only

See also: [blessboard-production-checklist.md](./blessboard-production-checklist.md), [blessboard-content-management.md](./blessboard-content-management.md)
