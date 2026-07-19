# Foundation Path Routing & Delivery Plan (Prompt 2D)

**Status:** Architecture decision — analysis only (expanded)  
**Date:** 2026-07-19  

**Inputs:** Audit + 2A/2B/2C architecture docs; Hostinger has **no wildcard DNS**.

**Constraints:** No code, routes, migrations, DB writes, provisioning/registration implementation, admin UI, dashboards, host-routing enablement, custom-domain behavior, or V4 changes.

---

## 1. Executive recommendation

| Surface | Choice |
|---------|--------|
| **Public church** | **`/c/:organizationKey`** (+ existing page suffixes) |
| **Portal** | **`/portal/:organizationKey`** (+ nested existing admin paths) |
| **Login** | Apex **`/login`** (`next=` safe path only) |
| **Canonical identifier** | **`platform.organizations.organization_key`** (same as Free slug; church_key aligns) |
| **Resolver** | One core `resolveOrganizationContext` with `mode: public \| portal` |
| **URL helpers** | One `churchUrlHelper` supporting `path` → future `subdomain` → `custom_domain` |
| **First portal screen** | Minimal onboarding/home at portal entry; reuse **branch-admin shell** for depth |
| **First build phase** | **Phase 1 — Schema and status migration** |

Public and portal prefixes stay **separate** (avoid mounting private admin under `/c/…` for cache/auth clarity).

---

## 2. Current route inventory (V5 foundation)

### 2.1 Apex public / marketing
`/`, `/features`, `/for-churches`, `/pricing`, `/directory`, `/register-church`, `/terms`, `/privacy`, `/login`, `/logout`, `/account`, `/healthz`, `/auth/callback`

### 2.2 Platform admin
`/admin`, `/admin/account`, `/admin/organizations`, `/admin/organizations/:organizationKey`, plan/entitlement POSTs, `/admin/plans`, `/admin/subscriptions`, `/admin/domains*`, `/admin/deployments*`, `/admin/settings`, `POST /admin/logout`  
(**Not yet:** `/admin/registration-applications`)

### 2.3 Tenant shells (today: **non-apex / host-gated**)
`/hq/*`, `/branch-admin/*`, `/member/*`, content/attendance/giving/forms admin & member routers, tenant public pages on **tenant host** via `tenantPublicRoutes` + `tenantPublicPaths`

### 2.4 Host / domain resolution
`resolveHostname`, `evaluateTenantRoute`, `platform.domains`, authoritative allowlist — **modes off/shadow/authoritative**; Foundation currently path-first, host routing **not enabled** for Free.

### 2.5 Canonical host
`foundationWwwToApexRedirect`: `www.blessboard.org` → `https://blessboard.org…` (before Set-Cookie).

### 2.6 Hardcoded / helper URLs
Marketing and PA use relative paths; V4 helpers still build `*.blessboard.*` hosts — **do not reuse in new Foundation EJS**. Introduce central helper.

### 2.7 Prefix classification

| Prefix | Class | Notes |
|--------|-------|-------|
| `/c` | **AVAILABLE** | No current mounts |
| `/church` | **RESERVED / UNSAFE** | Unavailable-path / reserved slug noise |
| `/churches` | **AVAILABLE** but weaker (directory confusion) | |
| `/org` | **AVAILABLE** | Prefer not (public says Church) |
| `/organizations` | **PARTIALLY** via `/admin/organizations` | Keep under admin |
| `/portal` | **AVAILABLE** | Choose for private entry |
| `/account` | **RESERVED** | Apex account page |
| `/admin` | **RESERVED** | Platform admin |
| `/api` | **AVAILABLE** (unused V5) | Keep free for future API |
| `/login` `/register-church` `/directory` | **RESERVED** | Marketing/auth |
| `/hq` `/branch-admin` `/member` | **PARTIALLY USED** | Host tenant; nest under portal for path mode |

---

## 3. Public church route

### Evaluation

| Family | Verdict |
|--------|---------|
| **`/c/:organizationKey`** | **Choose** — short, free prefix, clear namespace, easy subdomain redirect later |
| `/church/:slug` | Reject — reserved word / marketing confusion |
| `/churches/:slug` | Reject — clashes with directory mental model |

### Canonical identifier
**`platform.organizations.organization_key`** only.  
Align `church_key` / HQ `branch_key` at provision; do **not** maintain a second public slug.

### Child routes (reuse `tenantPublicPaths` keys)
`/c/:organizationKey` (home), `/about`, `/leadership`, `/ministries`, `/events`, `/sermons`, `/contact`, `/giving` (and any mapped keys already in `tenantPublicPaths.js`).

---

## 4. Portal route

### Evaluation

| Pattern | Verdict |
|---------|---------|
| `/portal` alone | Weak bookmarks / multi-org |
| **`/portal/:organizationKey`** | **Choose** — explicit org, separate from public `/c` |
| `/c/…/portal` | Mixes public+private prefixes |
| `/organizations/…/portal` | Admin-flavored; longer |
| Nest only under `/c/…/branch-admin` | Prior draft; superseded for separation |

### Canonical portal tree
```text
/portal/:organizationKey                 → first screen (onboarding/home)
/portal/:organizationKey/branch-admin/*  → existing BA routes (adapted)
/portal/:organizationKey/hq/*            → later / Growth
/portal/:organizationKey/member/*        → later
```

Login remains **`/login`**. After auth, redirect to `/portal/:organizationKey`.

---

## 5. Organization-context resolver

**Core:** `resolveOrganizationContext({ slug, mode, user? })`

| Step | Behavior |
|------|----------|
| 1–3 | Read/normalize slug; reject reserved |
| 4–6 | Load org by `organization_key`; load church 1:1; require active BlessBoard enrolment |
| 7 | Org status gate |
| 8 | Mode policy: public publication vs portal authz |
| 9 | Attach `req.blessBoardOrgContext` |
| 10 | Never trust client-supplied UUIDs without re-resolve |

**Context (minimal public):** `organizationKey`, `organizationId`, `churchId`, `churchDisplayName`, `orgStatus`, `publicationAggregate`, `routingMode: 'path'`.

**Portal adds:** roles, branchId, entitlements summary — not full member PII.

**Structure:** one core service + `requirePublicChurch` / `requirePortalChurch` wrappers.

---

## 6. Publication behavior

| Case | Response |
|------|----------|
| **Published** | Render requested public page (200) |
| **Unpublished** | Neutral **setup/preparation** page, **200**, `noindex`, no fake ministries/leaders; optional “Sign in to manage” if preview policy allows; PA/church admin preview via portal, not public HTML |
| **Suspended / inactive org or church** | Generic **unavailable** page (403 or 404 — prefer **404** to avoid enumeration), **no reason detail** |
| **Unknown slug** | Genuine **404** |
| **Org without BlessBoard enrolment** | **404** (same as unknown to public) |

Unpublished ≠ nonexistent: unpublished is known org with setup page; unknown has no org row.

---

## 7. Portal authorization

Must verify: authenticated session, user `active`, role on **that** org/church/branch, org/church not suspended, branch scope where needed.

| Actor | Behavior |
|-------|----------|
| Unauthenticated | 303 `/login?next=/portal/{key}…` |
| Other org’s user | 403 or chooser |
| Suspended user/org | 403 / unavailable |
| `branch_admin` / `church_hq_admin` | Allow portal |
| Member / leader | Only member routes when mounted |
| `platform_admin` | Use `/admin`; do not imply church portal by slug alone |

**Never** authorize on slug existence alone.

---

## 8. Login and post-provision redirect

```text
POST /register-church (CSRF OK)
  → outer TX provisionRegisteredBlessBoardChurch
  → COMMIT
  → regenerate session
  → store user + org context
  → 303 /portal/:organizationKey
```

| Failure | Fallback |
|---------|----------|
| Session regen / auto-login fails | Success page + CTA `/login?next=/portal/{key}` |
| Refresh | Session cookie keeps portal access |
| Second browser | Must login |
| Logout | Clear session → `/login` |
| Back button | Idempotent provision; portal or login |

**Do not** redirect new admins to `/c/:key` public site after provision.

---

## 9. Multi-organization compatibility

Foundation: duplicate email → `duplicate_review` (no auto multi-org).

Future-ready:
- Explicit `/portal/:organizationKey` (no reliance on single session org forever)
- Optional `/portal` chooser listing memberships
- Switch = navigate to other key + re-eval roles
- Session may cache “last org” but URL remains source of truth for portal

---

## 10. URL-helper architecture

Module (conceptual): `src/blessboard/urls/churchUrlHelper.js`

```text
buildChurchPublicUrl({ organizationKey, pagePath?, absolute? })
buildChurchPortalUrl({ organizationKey, portalPath?, absolute? })
buildAdminOrganizationUrl({ organizationKey })
buildAdminRegistrationApplicationUrl({ applicationId })
```

**Routing mode order (future):** custom domain → subdomain → **path** (Foundation default).

Sources: env canonical host; later `platform.domains`; never scatter `blessboard.org` in EJS.

Absolute URLs for email; relative OK in same-apex HTML.

---

## 11. Future subdomain migration

Keep `organization_key` stable. Flip helper mode to subdomain; add host resolver sharing **same** core context loader; **301** `/c/{key}` → `https://{key}.blessboard.org/`; portal similarly.  

**Do not** bake path-only assumptions into DB identity or dual slug columns.

---

## 12. Custom-domain precedence (future only)

1. Approved active custom domain (entitled)  
2. BlessBoard subdomain (when DNS exists)  
3. Path URL  

Free Foundation provision: **no domain row**. Helper/resolver later consult `platform.domains` once.

---

## 13. First portal screen

**Choose:** dedicated minimal **portal home / onboarding entry** at `/portal/:organizationKey` (new thin view), not a huge dashboard. Deeper tools via nested `branch-admin`.

| Element | Class |
|---------|--------|
| Church name | REQUIRED |
| Basic/Free plan label | REQUIRED |
| Onboarding checklist (MVP keys) | REQUIRED |
| Public website status | REQUIRED |
| Preview link (`/c/{key}` setup or preview) | REQUIRED |
| Setup actions | REQUIRED |
| Support/help indicator | OPTIONAL |
| Logout / account | REQUIRED |
| Full HQ analytics | DEFERRED |

---

## 14. Security controls

Exact-match normalized slug; reject `..`, encoded slashes, mixed-case variants via normalize-to-lower; reserved list; no open redirects (`next` allowlist `/portal/`, `/c/` carefully); portal `no-store`; CSRF on writes; rate limits; unpublished ≠ leak existence beyond setup page; no SQL in errors; slug enumeration mitigated via generic 404 for unknown/suspended.

---

## 15. Caching and SEO

| Surface | Cache | SEO |
|---------|-------|-----|
| Portal / auth / register | `no-store` | noindex |
| Unpublished setup | conservative / no-store; **noindex** | |
| Published public | public cache only if **Vary** includes tenant key/host and no cross-slug leak | canonical `/c/{key}/…` |
| Login | no-store | noindex |

---

## 16. Implementation phases

### Phase 1 — Schema and status migration
**Objective:** 2B columns/tables; app→org FK; onboarding; support contacts; Free `max_branches=1`.  
**Deps:** 2A/2B approved. **Migrations:** yes. **Routes:** none. **Tests:** migrate/backfill/constraints. **Rollback:** reverse migration. **Exclude:** HTTP provision, path routes. **Prompt size:** medium.

### Phase 2 — Transaction composability
**Objective:** `manageTransaction: false` (+ `skipDomain`). **Deps:** none hard. **Migrations:** no. **Tests:** nested TX rollback. **Rollback:** flag off / revert. **Exclude:** orchestrator HTTP. **Size:** small–medium.

### Phase 3 — Shared orchestrator
**Objective:** `provisionRegisteredBlessBoardChurch`, locks, idempotency, failed status. **Deps:** 1–2. **Migrations:** no. **Tests:** integration matrix 2C. **Exclude:** public register wire-up. **Size:** medium.

### Phase 4 — Instant Basic/Free registration
**Objective:** password, map `foundation`→`free`, provision, session regen, auto-login, redirect portal (or interim `/account` until Phase 7). **Deps:** 3. **Flag:** `INSTANT_PROVISION_ENABLED`. **Exclude:** path public site. **Size:** medium.

### Phase 5 — Admin registration applications
**Objective:** `/admin/registration-applications` list/detail. **Deps:** 1. **Flag:** `ADMIN_APPLICATIONS_ENABLED`. **Exclude:** full follow-up actions. **Size:** medium.

### Phase 6 — Admin onboarding/support actions
**Objective:** assign, follow-up statuses, append contacts, org detail summary. **Deps:** 1, 5. **Exclude:** impersonation. **Size:** medium.

### Phase 7 — Path-based portal resolver
**Objective:** `/portal/:organizationKey`, authz, first screen shell. **Deps:** 3–4. **Flag:** `PATH_PORTAL_ENABLED`. **Exclude:** full BA nest if needed follow-on. **Size:** medium–large (split if needed).

### Phase 8 — Minimal onboarding screen
**Objective:** derived checklist, publication status, preview/publish entry. **Deps:** 1, 7. **Exclude:** fancy wizard. **Size:** small–medium.

### Phase 9 — Path-based public website
**Objective:** `/c/:organizationKey/*`, published pages, unpublished setup, 404 unknown. **Deps:** 7–8 helpers. **Flag:** `PATH_PUBLIC_ENABLED`. **Exclude:** enable authoritative host mode. **Size:** medium.

### Phase 10 — Dashboard metrics and polish
**Objective:** non-duplicative cards → filtered orgs/apps; docs/stitch maps. **Deps:** 5–9 data. **Exclude:** fake tickets/MRR. **Size:** small–medium.

---

## 17. Failure / rollback / flags

| Flag (conceptual) | Off behavior |
|-------------------|--------------|
| Instant provision | Enquiry-only insert (current) |
| Path portal | No `/portal` mount; login → `/account` |
| Path public | No `/c` mount |
| Admin applications | No nav item |

Each phase deployable alone behind flags; data migrations forward-compatible; old enquiry path remains until Phase 4 flag on.

---

## 18. Duplicate-prevention rules

1. One org resolver.  
2. One `organization_key`.  
3. One URL helper.  
4. One provisioning orchestrator.  
5. One orgs list (`/admin/organizations`).  
6. One applications queue.  
7. One onboarding row per org.  
8. One support-contact history.  
9. No extra church-tenant table.  
10. No V4 routing/provision.  
11. Shared resolver for path/subdomain/custom.  
12. No Free custom-domain rows.  
13. Every dashboard metric has a filtered destination.  
14. No portal auth from slug alone.  
15. Publication not inferred from org `active` alone.

---

## 19. Open owner decisions

1. Portal nest full `/branch-admin` in Phase 7 or thin home first?  
2. Suspended public: 404 vs dedicated unavailable?  
3. Admin preview of unpublished without login cookie?  
4. Exact feature-flag env names in repo convention?  
5. Interim Phase 4 redirect if portal flag off: `/account` vs success-only?

---

## 20. Confirmation

- No application code changed  
- No migrations created or executed  
- No database records changed  
- No routes / admin screens / dashboard items added  
- No V4 code changed  
- Host-based tenant routing not enabled  
- Custom-domain behavior not implemented  
