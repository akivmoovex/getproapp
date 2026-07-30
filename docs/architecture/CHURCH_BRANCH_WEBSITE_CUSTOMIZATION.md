# Church & Branch Website Customization Architecture

**Status:** Architecture / requirements — **not** an implementation mandate  
**Date:** 2026-07-30  
**Surface:** BlessBoard V5 tenant public websites + HQ / Branch Admin editors  
**Related:** `docs/migrations/STAGE7_BRANCH_MINI_WEBSITES_MIGRATION.md`, `resolveWebsiteScope.js`, `websiteBranchPageInheritanceService.js`, `loadTenantPublicPageModel.js`

**Verdict:** `READY_FOR_IMPLEMENTATION` — §K product decisions approved 2026-07-30. Implement Prompt 7 in **eight staged passes** (do not combine).

### Prompt 7 Stage 1 (2026-07-30) — foundation landed (local)

| Deliverable | Status |
|-------------|--------|
| Migration `052_branch_website_governance_and_scope_settings.sql` | Additive |
| Org `allow_branch_giving_methods` / `allow_branch_urgent_updates` (default false) | Done |
| `branch_website_governance` + backfill defaults | Done |
| `website_scope_settings` (override/hidden; empty = inherit) | Done |
| Church-wide URL ≠ primary branch mirror | Done in `loadTenantPublicPageModel` |
| Primary fallback for contact + service times only | Done |
| Stages 2–8 | **Not started** |

See `docs/migrations/PROMPT7_STAGE1_BRANCH_WEBSITE_GOVERNANCE.md`.

### Prompt 7 gate (superseded)

~~Prompt 7 blocked until §K~~ — product decisions approved; proceed stage-by-stage.

---

## A. Current-state architecture

### Identity & tenancy

| Layer | Storage | Notes |
|-------|---------|--------|
| Organization | `platform.organizations` | Tenant boundary |
| Church | `blessboard.churches` (`organization_id` UNIQUE) | One church per org |
| Branch | `blessboard.branches` (`church_id`, `branch_key`, `is_primary`) | Campuses / HQ branch |
| Church settings | `blessboard.church_settings` | Includes `website_status` |
| Branch settings | `blessboard.branch_settings` | Local contact/address/geo; **no** website status |

### Content scope model (today)

Almost all public CMS rows use:

- `church_id` **NOT NULL**
- `branch_id` **NULLABLE** (`NULL` = church-wide)

Unique indexes:

- Church-wide: `(church_id, page_key) WHERE branch_id IS NULL`
- Branch: `(church_id, branch_id, page_key) WHERE branch_id IS NOT NULL`

Same nullable-`branch_id` pattern: `page_sections` (via page), `leaders`, `ministries`, `events`, `sermons`, `contact_channels` (incl. social), `giving_methods`.

**There is no `website_field_overrides` table** and no `inherit` / `override` enum on content rows.

### Inheritance (read-time, not copied)

Public resolution (`loadTenantPublicPageModel.js`):

| Kind | Rule |
|------|------|
| **Page** | Branch published page if present → else church-wide |
| **Entity list** | If branch published list **non-empty** → **branch only** (replace); else church-wide. **No merge** |
| **Service times** | Branch home `service_times` section → else church-wide → else `[]` |
| **Contact chrome** | Prefer `branch_settings` over `church_settings` when present |

Provision (`provisionRegisteredBlessBoardChurch.js`):

- Seeds **church-wide** draft pages only (`branch_id NULL`).
- Creating a branch (`createBlessBoardBranch.js`) does **not** copy CMS content.

Explicit page override (`websiteBranchPageInheritanceService.js`):

- `createBranchPageOverride` — creates branch draft page and **copies** church published sections once; stamps `layout_metadata.branchOverride`.
- `removeBranchPageOverride` — archives branch page/sections; church-wide untouched.

### Governance (today)

| Concern | Reality |
|---------|---------|
| Approval settings | `website_approval_settings` (org PK); modes include `approval_required`, `trusted_branch_publish`, `draft_only` |
| Trusted branch publish | **Configured but not activated** — `resolveBranchEditMode` forces `trustedActive: false` |
| Submissions | `website_change_submissions.branch_id` **REQUIRED** |
| Drafts | `website_inline_field_drafts`, `website_structured_drafts` (`organization_id`, `church_id`, `branch_id` nullable) |
| Versions | `website_publication_versions.branch_id` nullable (migration `051`) |
| Audit | `website_audit_events` + `recordBlessBoardAudit` |
| Entitlements | `websitePlanEntitlementService` (Foundation / Growth / Network capabilities) |

### Branding gap

Parent logo, primary color, typography preset, custom CSS, and approved accent palettes are **not first-class CMS fields** today. Public chrome uses platform design tokens (`tenant-public.css` / design-tokens). Logo readiness is treated as settings/overview checklist, not a scoped override system.

---

## B. Scope and route matrix

### Public

| Route family | Branch scope |
|--------------|--------------|
| Host `/`, `/about`, … `/giving` | Church-wide URL; content may still prefer **primary branch** rows when present (see open decision) |
| Host `/branches/:branchKey` (+ pages) | Explicit branch mini-site |
| `/c/:organizationKey` (+ pages) | Path-public church-wide |
| `/c/:organizationKey/branches/:branchKey` (+ pages) | Explicit branch mini-site |

### Editors

| Surface | How branch is chosen | Preference |
|---------|----------------------|------------|
| `/hq/website`, `/hq/content` | Church-wide (`branchId = null`) | Explicit church |
| `/hq/website/branches/:branchKey/**`, `/hq/content/b/:branchKey/**` | Path `:branchKey` | **Preferred** |
| `/branch-admin/content/**`, `/branch-admin/website/**` | Session-assigned branch (no path key) | Ambiguous for multi-branch operators; keep but document; prefer HQ path form for HQ |
| Preview / draft-preview | Editor scope from `resolveWebsiteScope` | Must stay auth-gated |

### Ambiguous / infer-from-session

- Branch Admin editors: branch comes from **role assignment**, not URL.
- Church-wide public URL still selecting primary-branch content for lists/pages when overrides exist blurs “church vs primary campus.”

**Rule going forward:** Prefer **explicit** `:branchKey` (or church-wide `branchId = null`) in every draft, submission, preview, publish, and audit payload. Never trust client-supplied org/church/branch IDs; tenant context wins (`resolveWebsiteScope.js`).

---

## C. Final customization matrix

Legend: **HQ** = church HQ / platform admin · **BO** = branch override allowed · **AP** = HQ approval required when org mode = `approval_required` · **IN** = inherited by default when branch has no override

| Setting | HQ owns | Branch override | HQ approval | Inherited by default |
|---------|---------|-----------------|-------------|----------------------|
| Church name | Yes | No | — | — |
| Branch display name | Sets default policy | Yes | No* | Branch record is source |
| Main logo | Yes | No (branch mark only) | — | Yes |
| Branch mark / avatar | Optional HQ policy | Yes | No* | Platform fallback |
| Primary color | Yes | No | — | Yes |
| Approved accent palette | Yes | Select-only if HQ allows | No* | Yes |
| Fonts / typography preset | Yes | No | — | Yes |
| Custom CSS | Yes (plan-gated; prefer none) | No | — | — |
| Primary navigation | Yes | Hide page only if HQ allows | Yes if changing visibility | Yes |
| Page visibility | Yes defaults | Yes where HQ allows | Yes* | Yes |
| Hero image | Church default | Yes | Yes* | Yes |
| Hero copy | Church default | Yes | Yes* | Yes |
| Mission / about story | Church default | Soft (page override) | Yes* | Yes |
| Address / map / phone / email | Church defaults | Yes (`branch_settings`) | No* (urgent OK) | Yes |
| Service times | Church default | Yes | No* (urgent OK) | Yes |
| Leadership | Church-wide roster | Branch roster / featured | Yes* | Replace-if-present (today) |
| Ministries | Church-wide | Branch roster | Yes* | Replace-if-present |
| Events | Church-wide | Branch events | Yes* | Replace-if-present |
| Sermons | Church-wide | Branch sermons | Yes* | Replace-if-present |
| Announcements | Church-wide | Branch announcements | Yes* | TBD product |
| Giving methods | Church policy + methods | Branch methods **only with HQ permission** | Yes | Linked inherit (target) |
| Social links | Church defaults | Yes | No* | Yes |
| SEO title/description | Church defaults | Local description | No* | Yes |
| Footer / legal / attribution | Yes | No (except local contact lines) | — | Yes |
| Domain | Yes | No | — | — |
| Payment disclaimer | Yes | No | — | Yes |
| Governance / entitlements | Yes | No | — | — |
| Publication approval mode | Yes | No | — | — |

\*When org is in `approval_required`, branch publishes go through submission; `trusted_branch_publish` remains a future activation.

### Branches must not independently change

Parent church name · global legal wording · unsupported CSS · global font family · security notices · platform attribution (BlessBoard / GetPro) · governance rules · plan entitlements · organization domain · payment disclaimer · HQ-controlled giving policy.

---

## D. Inheritance model

### States (target)

Each **branch-customizable field** (or section) supports:

1. **`inherit`** — resolve from church (or platform fallback)
2. **`override`** — explicit branch value; church updates do **not** overwrite
3. **`hidden`** — only where HQ allows (e.g. hide a nav page on a campus)

Editor UI must show: Inherited from church · Overridden by this branch · Reset to church default · Locked by HQ · Hidden by branch (if allowed).

### Resolution order

```text
branch override → church default → platform fallback
```

### Granularity (recommended)

| Layer | Granularity | Rationale |
|-------|-------------|-----------|
| Settings (contact, SEO local, branch mark) | **Field-level** | Avoid full settings-row copy drift |
| Page heroes / mission / about blocks | **Section-level** (page section keys) | Matches `page_sections` |
| Leaders, ministries, events, sermons, announcements | **Record-level** (`branch_id` on row) | Collections already scoped |
| Giving methods | **Record-level + policy link** | Inherit by reference, not deep copy |
| Brand tokens (color, font) | **Church-only** | No branch override |

### Avoid copied-value drift

- Do **not** bulk-copy church pages/entities into every new branch (already STAGE7 policy).
- Page override may **seed** drafts from church once; thereafter treat as override with reset capability.
- Church default updates must flow to inheriting branches; explicit overrides stay.
- Prefer storing `source = inherit|override` (or equivalent) rather than silent duplication.

### Gap vs today

Today: page override = **presence of branch page row** + soft `layout_metadata.branchOverride`. Entity lists = **non-empty branch published set replaces church**. Field-level inherit/override metadata **does not exist**.

---

## E. Collection behavior

| Collection | Public branch mini-site (target) | Church-wide URL (target) | Notes |
|------------|----------------------------------|---------------------------|--------|
| Leaders | Branch roster if overridden; else inherit church | Church roster (optionally highlight primary campus) | Decide: replace vs merge featured |
| Ministries | Same | Church | Same |
| Events | Branch-only upcoming **or** branch + tagged church-wide | Church-wide + optional primary | Product must choose aggregate vs replace |
| Sermons | Same as events | Church-wide | Same |
| Announcements | Branch local + optional church-wide flags | Church-wide | Needs visibility flags |
| Giving methods | Inherited church methods (linked) + permitted local | Church methods only | See §F |
| Service times | Branch override or inherit | Church (or primary campus — **decision**) | Stored as home section today |

**Current default to document honestly:** replace-if-branch-list-non-empty (no merge). Recommended product clarification before changing loaders.

---

## F. Giving-method policy

### Recommended rules

1. Church-wide methods are the default; branches **inherit by reference** (same row / link), not a deep copy.
2. Branch-local methods require **HQ permission** (governance flag or entitlement).
3. Branch methods must identify the **receiving branch** in public UI.
4. Branch methods never appear on another branch’s mini-site.
5. HQ can disable local methods org-wide or per branch.
6. Publication of giving changes follows org approval mode.
7. Member portal and public site must use the **same resolution rules** (today they diverge: member uses primary branch exact match with no church fallback).

### Do not

- Copy IBAN/account blobs into branch rows “for convenience” without inheritance metadata.
- Let soft-fill / demo content invent cross-branch methods.

---

## G. Governance workflow

### Modes (`website_approval_settings.branch_edit_mode`)

| Mode | Branch behavior | HQ behavior |
|------|-----------------|-------------|
| `approval_required` | Edit drafts → submit | Approve / request changes / reject; may publish |
| `trusted_branch_publish` | Direct publish when **activated** | Audit + optional review |
| `draft_only` | Drafts only | HQ publishes |

**Today:** trusted mode is not activated in code (`trustedActive: false`). Document as future until product turns it on.

### Explicit scope on every artifact

Every draft, submission, preview, version, and publish action must carry:

- `organization_id` (trusted)
- `church_id` (trusted)
- `branch_id` **null = church-wide**, else that branch
- Actor role + capability checks

### Workflows to support

1. Branch direct publish (trusted mode, when activated)
2. Branch submits to HQ
3. HQ edits branch website (explicit `:branchKey`)
4. HQ approves / rejects / requests changes
5. Branch resolves requested changes
6. Version history + rollback (church-wide and per-branch via `051`)
7. Inherited church changes applying to inheriting branches without clobbering overrides
8. Urgent contact / service-time corrections (prefer low-friction path; still audited)

---

## H. Recommended schema changes (minimum, review-first)

Do **not** apply until product signs off. Prefer additive migrations.

### 1. `blessboard.website_scope_settings` (optional thin table)

**Purpose:** Field-level inherit/override/hidden for settings-like keys (SEO description, branch mark URL, local CTA label, giving local-methods allowed).  
**Ownership:** `organization_id`, `church_id`, `branch_id` NOT NULL for branch rows; church defaults stay on `church_settings` / pages.  
**Uniqueness:** `(church_id, branch_id, setting_key)`.  
**Deletion:** ON DELETE CASCADE from branch.  
**Backfill:** Empty = inherit.  
**Indexes:** `(church_id, branch_id)`, `(organization_id)`.

### 2. `blessboard.branch_website_governance`

**Purpose:** Per-branch locks / permissions (local giving allowed, which pages may be hidden, trusted publish eligible).  
**Ownership:** PK `branch_id`; `organization_id` denormalized for audit.  
**Deletion:** CASCADE with branch.  
**Backfill:** Defaults from org `website_approval_settings`.

### 3. Extend existing rows (prefer over new tables when possible)

| Change | Why |
|--------|-----|
| `public_pages.layout_metadata` document contract for `branchOverride`, `inheritanceMode` | Already used; formalize JSON schema in code |
| `giving_methods.visibility_policy` or governance flag “branch_local_allowed” at org | Avoid silent local methods |
| Align member giving loader with public inheritance | No schema; service fix |
| Brand tokens on `church_settings` (logo URL, primary color) when product ready | Church-owned only |

### Explicitly **not** recommended now

- Broad `website_field_overrides` for every CMS paragraph (too heavy; use sections + records).
- Copying all church content into branch tables at provision.
- Dropping nullable `branch_id` model (it is the right spine).

---

## I. Migration risks

| Risk | Mitigation |
|------|------------|
| Backfilling “overrides” from existing branch pages | Classify with current `classifyOverride`; do not rewrite church rows |
| Church URL vs primary-branch content surprise | Product decision before changing `contentBranchId` selection |
| Giving portal vs public mismatch | Unify resolution in one service |
| Activating trusted publish | Feature flag + audit + entitlement |
| Dual HQ mounts (`/hq/content/b/:key` vs `/hq/website/branches/:key`) | Prefer canonical Stage 5 paths; keep aliases |
| Version history church vs branch | Already split in `051`; keep scope on restore |

---

## J. Token-efficient implementation stages

| Stage | Scope | Outcome |
|------:|-------|---------|
| **0** | Product sign-off on §K decisions | Architecture locked |
| **1** | Docs + editor UX copy for Inherited / Override / Reset (page-level, existing API) | No schema |
| **2** | Unify giving resolution (public + member); document policy in UI | Service-only |
| **3** | Formalize page inheritance state in UI; reset = `removeBranchPageOverride` | Existing services |
| **4** | `branch_website_governance` + org flag for local giving | Small migration |
| **5** | Field-level settings inherit (`website_scope_settings`) for contact/SEO/mark | Small migration |
| **6** | Collection merge/featured rules if product chooses aggregation | Loader changes + tests |
| **7** | Brand tokens on church_settings; lock branch from color/font/CSS | Schema + CSS variables |
| **8** | Activate trusted branch publish behind flag | Governance only |

Each stage: tests for scope 404, CSRF, audit, inheritance non-clobber, cross-org isolation.

---

## K. Architecture verdict

### `READY_FOR_IMPLEMENTATION`

§K product decisions were approved 2026-07-30 (church-wide ≠ primary mirror; three inheritance models; collection policies; giving governance; branding ownership; nav visibility; publish modes; urgent path). Implement Prompt 7 stages 1→8 sequentially.

Open decisions that previously blocked “READY_FOR_IMPLEMENTATION” (historical):

1. **Church-wide URL content:** ~~Keep preferring primary-branch overrides~~ → **Approved:** church-wide only; primary contact/service-time fallback only.
2. **Collections:** ~~replace vs merge~~ → **Approved:** per-collection rules in product decisions §3.
3. **Field-level inheritance:** ~~now vs later~~ → **Approved:** field-level for settings catalog; page-level for structured pages; record-level for collections.
4. **Giving:** ~~HQ gate + linked inherit~~ → **Approved:** `allow_branch_giving_methods` default false.
5. **Branding:** HQ owns global brand; branch limited local treatments.
6. **Trusted branch publish:** per-branch `branch_publish_mode`, default `hq_approval`.
7. **Urgent contact/service-time path:** HQ-enabled, audited, scoped.

### What is already sound (do not undo)

- Nullable `branch_id` spine
- No bulk copy on branch create (STAGE7)
- `resolveWebsiteScope` trusted tenant IDs
- Explicit public `/branches/:branchKey` routes
- Submissions always branch-scoped
- Publication versions per church-wide and per branch (`051`)

---

## Security requirements (non-negotiable)

- Organization scope from tenant context only.
- Branch scope validated server-side; cross-org / wrong branch → **404**.
- Branch admins cannot mutate HQ-locked fields (enforce in apply/publish services).
- Ownership checks before or with plan locks (already pattern for change requests).
- CSRF on all state-changing routes.
- Audit overrides, resets, approvals, publishes with explicit `branch_id`.
- Publication must never apply another branch’s draft or version.

---

## References (code)

- `src/blessboard/services/resolveWebsiteScope.js`
- `src/blessboard/services/websiteBranchPageInheritanceService.js`
- `src/blessboard/http/loadTenantPublicPageModel.js`
- `src/blessboard/services/websiteApprovalSettingsService.js`
- `src/blessboard/services/websitePlanEntitlementService.js`
- `src/blessboard/http/contentAdminRoutes.js`
- `docs/migrations/STAGE7_BRANCH_MINI_WEBSITES_MIGRATION.md`
