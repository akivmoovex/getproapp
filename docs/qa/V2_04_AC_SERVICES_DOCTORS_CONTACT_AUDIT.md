# V2.04 — ActiveClinic Services / Doctors / Contact / Edit-Mode Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_AC_SERVICES_DOCTORS_CONTACT_AUDIT` |
| **Mode** | Audit + **FIX PACK APPLIED** (2026-10-02) |
| **Date** | 2026-10-02 |
| **Scope** | BUG 1–4 (Manage Public Catalogue, Manage Doctors, Contact UX, Pricing edit-mode CTA) |
| **Stitch project** | `8888814012921999511` — *ActiveClinic Design System Foundation* (76 screen instances / 75 screens listed) |
| **Primary code tree** | `Documents/DocumentsAkiv/.../getpro` |
| **Evidence sources** | `docs/design/stitch-exports/`, `docs/design/ACTIVECLINIC_*STITCH*`, live Stitch screens, AC public/CMS routes & views |
| **Fix pack tests** | `tests/v2-04-ac-public-site-management-fix.test.js` |

**Constraints observed:** no second booking/contact/pricing domain proposed; management must use canonical operational catalogues (services → `appointment_service_types`; doctors → staff public profiles).

---

## Inventory snapshot

### Stitch exports on disk

`docs/design/stitch-exports/` currently contains only:

- `ac-mw-e03-image-editor-desktop.png`
- `ac-mw-e03-image-editor-mobile-390.png`

No exported PNGs for services / doctors / contact / catalogue / pricing in that folder. Screen IDs below come from the live Stitch project + design matrices.

### Relevant approved public screens (project `8888814012921999511`)

| Screen name | Screen ID | Width / device | Route (contract) |
|---|---|---|---|
| AC-MW-R03: Our Services (Desktop) | `e8f6b836be7344d99cd9e7ad5e358c44` | 2560 DESKTOP | `/clinics/:clinicKey/services` |
| AC-MW-R03: Our Services (Mobile) | `885b5a099a2b4eb69abc90498ff0ab3c` | 780 MOBILE | same |
| AC-MW-R04: Meet Our Doctors (Desktop) | `90167abd511749e0a8b2cf162d0a47fe` | 2560 DESKTOP | `/clinics/:clinicKey/doctors` |
| AC-MW-R04 Meet Our Doctors | `603e16afb6d848a3b87db84d5314b511` | 780 MOBILE | same |
| AC-MW-R05: Doctor Profile (Desktop) | `8a19a6e2385944798e18e9a44f1d18d2` | 2560 DESKTOP | `/clinics/:clinicKey/doctors/:id` |
| AC-MW-R05 Doctor Profile | `8706630e1c574ce4884695533b968436` | 780 MOBILE | same |
| AC-MW-R06: Service Detail (Desktop) | `fc4038f52096421bb31a1801a1fdbc8f` | 2560 DESKTOP | `/clinics/:clinicKey/services/:id` |
| AC-MW-R06 Service Detail | `49d4fdb3c71641538b2f30b5451d4fa6` | 780 MOBILE | same |
| AC-MW-R07: Contact Page (Desktop) | `e58c06a9435947e594172a92bbadf926` | 2560 DESKTOP | `/clinics/:clinicKey/contact` |
| AC-MW-R07 Contact Page | `92f8da15fae74e4a81242c32a3e066b8` | 780 MOBILE | same |

**Not found in live Stitch project:** dedicated Public Catalogue / Manage Doctors / Manage Services management screens; dedicated Pricing page (live **AC-MW-R09** is *Facilities & Clinic Info*, not pricing). Contract doc still describes catalogue as `AC-MW-H05` and pricing as `AC-MW-R09`, but live H05 is *Version History* (`36ee1df342644e0aa34ba8f8a70cf07a`) — numbering drift.

### Canonical data (Bugs 1–2)

| Domain | Canonical source | Website JSON role |
|---|---|---|
| Services | `activeclinic.appointment_service_types` via `clinicWebsiteCatalogueService` | Overlay (image/visibility/featured) only — **not** a second service store |
| Doctors | `staff_members` public profile fields (`public_profile_*`) via same catalogue service | Overlay only — **not** a parallel doctor CMS |

`activeClinicWebsiteEditorCoverage.js` classifies actual service/doctor lists as **OPERATIONAL_DATA** with `manageHref` → `/app/settings/website/catalogue?tab=…`.

---

## BUG 1 — Services “Manage Public Catalogue” blank

```
BUG_ID: AC-V204-SVC-MANAGE-01
ROUTE: /clinics/:clinicKey/services (edit mode) → manage CTA
CURRENT_ROUTE_TARGET:
  - Affordance (tenant/services.ejs): /app/settings/website/catalogue?tab=services
  - Presentation manageHref (adapter): /app/settings/website/catalogue/services   ← NO GET handler
CURRENT_VIEW:
  - Public: views/activeclinic/tenant/services.ejs (AC-MW-R03 stitch shell)
  - Intended manage: views/activeclinic/app/website-cms-catalogue.ejs inside MW CMS shell
DATA_SOURCE: OPERATIONAL — appointment_service_types (+ library/website visibility overlays). Not website content JSON as SoT.
STITCH_SCREEN_FOUND: YES (public list) / NO (dedicated catalogue management UI)
STITCH_SCREEN_NAME: AC-MW-R03: Our Services (public); no AC-MW catalogue-manage screen in live project
STITCH_SCREEN_ID: e8f6b836be7344d99cd9e7ad5e358c44 (desktop); 885b5a099a2b4eb69abc90498ff0ab3c (mobile)
DESKTOP_SCREEN: e8f6b836be7344d99cd9e7ad5e358c44
MOBILE_SCREEN: 885b5a099a2b4eb69abc90498ff0ab3c
IMPLEMENTATION_GAP: YES
DESIGN_GAP: YES (no approved Stitch frame for Public Catalogue manager; hub “More → Public catalogue” only)
ROOT_CAUSE:
  1) Presentation adapter sets manageHref="/app/settings/website/catalogue/services" but CMS routes only register
     GET /catalogue, GET …/services/new, GET …/services/:id/edit (POST for actions). Bare /catalogue/services
     has no GET → unmatched /app path → blank/404-style response.
  2) collection_grid does not render manageHref; empty/populated pages use the ?tab=services affordance
     (valid). If blank still occurs on the valid URL, secondary UX: catalogue mounts websiteCmsShell /
     ac-app-body--mw (dark Clinic Editor chrome, page header hidden) — same family as AC-WEB-EDITOR-01
     “blank stage” perception — while content is CMS list, not public canvas.
  Management UI correctly targets OPERATIONAL catalogue (not website JSON). Do not invent a second services domain.
RECOMMENDED_ACTION:
  - Point all manageHref / Manage CTAs to /app/settings/website/catalogue?tab=services (or add redirect GET aliases).
  - Keep writes on clinicWebsiteCatalogueService → appointment_service_types.
  - Optionally restyle catalogue as management hub (not fake WE01 canvas); optional Stitch for H-catalogue later.
  - Do not edit services via website JSON keys.
```

---

## BUG 2 — Doctors “Manage Doctors” blank

```
BUG_ID: AC-V204-DOC-MANAGE-01
ROUTE: /clinics/:clinicKey/doctors (edit mode) → manage CTA
CURRENT_ROUTE_TARGET:
  - Affordance (tenant/doctors.ejs): /app/settings/website/catalogue?tab=doctors
  - Presentation manageHref (adaptActiveClinicDoctorsCollection): /app/settings/website/catalogue/doctors ← NO GET handler
  - person_grid.ejs always renders “Manage” when manageHref set (including public edit view via stitch html.doctors)
CURRENT_VIEW:
  - Public: views/activeclinic/tenant/doctors.ejs (AC-MW-R04)
  - Intended manage: website-cms-catalogue.ejs?tab=doctors
DATA_SOURCE: OPERATIONAL — staff public profiles (public_profile_enabled / public_profile_key / display fields) + overlays. Not website JSON SoT.
STITCH_SCREEN_FOUND: YES (public list/profile) / NO (dedicated manage-doctors CMS screen)
STITCH_SCREEN_NAME: AC-MW-R04: Meet Our Doctors; AC-MW-R05 Doctor Profile
STITCH_SCREEN_ID: 90167abd511749e0a8b2cf162d0a47fe / 603e16afb6d848a3b87db84d5314b511 (list); 8a19a6e2385944798e18e9a44f1d18d2 / 8706630e1c574ce4884695533b968436 (profile)
DESKTOP_SCREEN: 90167abd511749e0a8b2cf162d0a47fe (list)
MOBILE_SCREEN: 603e16afb6d848a3b87db84d5314b511 (list)
IMPLEMENTATION_GAP: YES
DESIGN_GAP: YES (no Stitch catalogue/doctors manager; public R04/R05 exist)
ROOT_CAUSE:
  Strongest code defect: manageHref="/app/settings/website/catalogue/doctors" is emitted into person_grid
  “Manage” with no matching GET list route (only …/doctors/new, …/doctors/:staffId/edit, POST …/:staffId).
  Clicking that Manage control leaves public edit mode and hits an unmatched staff-app path → blank/404.
  Affordance label “Manage public doctors” uses the correct ?tab=doctors URL; dual CTAs create inconsistent behavior.
  Data architecture is already correct (OPERATIONAL public profiles). Do not add a website-JSON doctors list.
RECOMMENDED_ACTION:
  - Fix manageHref to /app/settings/website/catalogue?tab=doctors; gate Manage link to websiteEdit only.
  - Keep doctor create/edit on catalogue service → staff public profile fields (no login side effects).
  - Do not route manage to /app/staff as a substitute for public-profile publishing.
```

---

## BUG 3 — Contact demo page / form UX revision

```
BUG_ID: AC-V204-CONTACT-UX-01
ROUTE: /clinics/:clinicKey/contact
CURRENT_ROUTE_TARGET: GET/POST /clinics/:clinicKey/contact (activeClinicPublicRoutes)
CURRENT_VIEW: views/activeclinic/tenant/contact.ejs (data-ac-stitch-screen="R07")
DATA_SOURCE: Hybrid — contact facts via presentation/adapters + optional website overlay (contact.phone/email);
  inquiry form is product POST (not a second contact domain). Facility/org remain authoritative for address.
STITCH_SCREEN_FOUND: YES
STITCH_SCREEN_NAME: AC-MW-R07: Contact Page (Desktop); AC-MW-R07 Contact Page (Mobile)
STITCH_SCREEN_ID: e58c06a9435947e594172a92bbadf926 (desktop); 92f8da15fae74e4a81242c32a3e066b8 (mobile)
DESKTOP_SCREEN: e58c06a9435947e594172a92bbadf926
MOBILE_SCREEN: 92f8da15fae74e4a81242c32a3e066b8
IMPLEMENTATION_GAP: PARTIAL — route/view/form exist; Stitch chrome wired (html.header/contact/location/hours/cta)
DESIGN_GAP: YES — form remains utilitarian product chrome (Class D/E per implementation map); visual/UX parity
  with approved R07 still needs revision (layout hierarchy, aside vs form balance, demo clarity). No new contact product.
ROOT_CAUSE: Presentation/Stitch shell landed; inquiry form not brought to R07 visual/UX standard. Contract explicitly
  keeps form as product (“form stays product”) while facts use WE01 — so gap is design/polish, not missing route.
RECOMMENDED_ACTION:
  - Revise contact.ejs + CSS against R07 desktop/mobile Stitch only (style/structure).
  - Keep single inquiry endpoint; do not fork booking/contact domains.
  - Preserve operational contact manage affordance → /app/settings/organization for org facts.
```

---

## BUG 4 — Pricing “Contact clinic for fees” drops edit-mode query

```
BUG_ID: AC-V204-PRICE-EDITLINK-01
ROUTE: /clinics/:clinicKey/pricing?website_edit=1&website_mode=draft
CURRENT_ROUTE_TARGET: hardcoded <a href="/clinics/<%= clinic.clinicKey %>/contact"> in views/activeclinic/tenant/pricing.ejs
CURRENT_VIEW: views/activeclinic/tenant/pricing.ejs
DATA_SOURCE: Hybrid pricingDisplay / operational catalogue patterns; empty-state CTA is internal nav only
STITCH_SCREEN_FOUND: NO (live project has no Pricing screen; R09 = Facilities & Clinic Info)
STITCH_SCREEN_NAME: n/a (contract historically AC-MW-R09 Pricing — superseded/missing in live inventory)
STITCH_SCREEN_ID: n/a
DESKTOP_SCREEN: n/a
MOBILE_SCREEN: n/a
IMPLEMENTATION_GAP: YES (edit-mode link preservation)
DESIGN_GAP: YES (pricing visual still DESIGN_CAN_ADAPT / missing Stitch — out of scope for link bug)
ROOT_CAUSE:
  CTA href helper path is broken by omission: pricing.ejs hardcodes absolute public paths without
  clinic.publicPagePaths / appendQuery / withEditorNavigationQuery.
  Edit-mode nav normally preserves params via clinicWebsiteLinkQuery({ website_edit:"1", website_mode:"draft" })
  → applyWebsiteLinkQuery on publicPagePaths → buildClinicWebsiteNav. Hardcoded /contact and /services
  bypass that pipeline, so the browser opens the live public contact page without website_edit / website_mode.
  Same defect on “View services” link at bottom of pricing.ejs.
RECOMMENDED_ACTION:
  - Replace hardcoded hrefs with clinic.publicPagePaths.contact / .services (already query-stamped in edit mode)
    or appendQuery(path, EDITOR_NAV_QUERY) when websiteEdit.
  - Do not create a second pricing/contact domain; keep single public contact route.
```

### Edit-mode CTA helper (trace)

| Layer | Behavior |
|---|---|
| `clinicWebsiteLinkQuery` | Returns `{ website_edit:"1", website_mode:"draft" }` when `websiteEdit` |
| `applyWebsiteLinkQuery` | Stamps every `clinic.publicPagePaths.*` + `publicBasePath` |
| `buildClinicWebsiteNav` / `withSurfaceQuery` | Nav hrefs use `appendQuery` |
| `withEditorNavigationQuery` / `EDITOR_NAV_QUERY` (`publicWebsiteUrl.js`) | Canonical editor query pair |
| **pricing.ejs CTAs** | Uses `clinic.publicPagePaths.contact` / `.services` (edit-stamped via `applyWebsiteLinkQuery`) |

Expected: internal public-site navigation in edit mode preserves `?website_edit=1&website_mode=draft`.

---

## Cross-bug architecture notes

1. **OPERATIONAL vs website JSON (Bugs 1–2):** Management continues to edit **OPERATIONAL_DATA** through `/app/settings/website/catalogue` (canonical service + public-profile writers). Website content keys only cover intros/empty copy (`services.intro`, `doctors.intro`, …) via WE01.
2. **No domain duplication:** Do not add parallel booking, contact, or pricing engines. Fix hrefs and catalogue entry points only.
3. **Stitch exports:** C01/C02/E03 PNGs + screen map under `docs/design/stitch-exports/` (project `8888814012921999511`). Earlier “no dedicated manage screens” finding is **superseded**.
4. **Hub vs catalogue chrome:** Hub remains management-only (AC-WEB-EDITOR-01). Catalogue is CMS sub-page with **C01/C02 Stitch structure** (not WE01 public canvas).

---

## Fix pack status (2026-10-02)

| Bug | Status | Change |
|-----|--------|--------|
| BUG 1 Services manage | **FIXED** | `manageHref` → `?tab=services` + returnTo; GET alias `/catalogue/services`; edit-gated Manage CTA; operational `appointment_service_types` |
| BUG 2 Doctors manage | **FIXED** | `manageHref` → `?tab=doctors` + returnTo; GET alias `/catalogue/doctors`; edit-gated Manage Doctors; staff public profiles |
| BUG 3 Contact R07 | **FIXED** | Urgent notice, form heading, legal note, Stitch R07 markers; operational contact + inquiry form retained |
| BUG 4 Pricing edit links | **FIXED** | `pricing.ejs` uses `publicPagePaths` (no hardcoded query; clean public URLs when not editing) |

**Tests:** `tests/v2-04-ac-public-site-management-fix.test.js` (+ related AC stitch/catalogue coverage) **9/9** focused pack; broader focused AC website suite **65/65**.

### True C01/C02 Stitch parity (2026-10-02) — supersedes contract-only PASS

Earlier “SERVICES_STITCH_PARITY=PASS / DOCTORS_STITCH_PARITY=PASS” from manage-route fix packs meant **functional/contract** parity only (generic CMS). That was **misleading for visual Stitch**.

| Screen | IDs | Implementation |
|--------|-----|----------------|
| C01 Services Desktop/Mobile | `d64d1134…` / `9fc7495d…` | `website-cms-catalogue.ejs` + `website-cms.css` markers `data-ac-stitch-screen="C01"` |
| C02 Doctors Desktop/Mobile | `9a9ba9d9…` / `d772e512…` | same template tab=doctors · `data-ac-stitch-screen="C02"` |
| E03 Image Editor | `c37072ac…` / `09401aea…` | Doctor (and service) catalogue forms: shared media-field with `framingEnabled:true` + Adjust Picture |

**Preserved:** `appointment_service_types` / staff public profiles · existing catalogue routes/writes · RBAC · public privacy allowlist · no second domain.

**Focused:** `tests/v2-04-ac-catalogue-c01-c02-stitch-parity.test.js` **11/11**. Hosted visual sign-off remains under **RB-QA-03**.

### Application candidate freeze (2026-10-02)

| Field | Value |
|-------|--------|
| BRANCH | `V4` |
| PREVIOUS_HOSTED_SHA | `554d37406ef5` |
| NEW_APPLICATION_CANDIDATE_SHA | `33e5c29612942e1484086432214b733f353f8601` |
| Commit | `Ver 2.04 AC C01/C02/E03 catalogue Stitch parity.` |
| C01 / C02 / E03 | YES / YES / YES |
| FOCUSED_TESTS | **11/11** |
| Deploy | **NOT deployed** (candidate freeze only; no Cursor deploy; production untouched) |

**Included in candidate:** catalogue list/forms + `website-cms.css` C01/C02 block + catalogue CMS route preview/returnTo aliases + parity test + Stitch screen map/PNGs.  
**Excluded from candidate:** build-identity shared-metadata work, public-site management / Contact R07 dirty tree, `.tmp_*` artifacts.

### Hosted tip reconciliation freeze (2026-10-02) — CASE A

| Field | Value |
|-------|--------|
| PREVIOUS_CANDIDATE | `1b2aa5b7fd60ebff791aafeabed762abe520ee25` (invite origin fix) |
| NEW_APPLICATION_CANDIDATE | `7dbe945d6c9315cbe6c6a45c7a64ee354a2fe22b` |
| Intervening | **1** commit — **DOC_ONLY** (QA handoff/pack docs) |
| C01 / C02 / E03 / invite origin / build-identity | YES |
| RUNTIME_AUDIT_CLEAN | YES (0 tracked `.tmp_runtime_audit`) |
| Focused contracts | **45/45** |
| Auth FEATURE (RB-QA-03/05) | Still OPEN |

```
C01_DESKTOP_IMPLEMENTED=YES
C01_MOBILE_IMPLEMENTED=YES
C02_DESKTOP_IMPLEMENTED=YES
C02_MOBILE_IMPLEMENTED=YES
C01_TOKENS=PASS
C02_TOKENS=PASS
E03_CATALOGUE_INTEGRATION=PASS
SERVICES_STITCH_PARITY=PASS
DOCTORS_STITCH_PARITY=PASS
FOCUSED_TESTS=11/11
NEW_APPLICATION_CANDIDATE_SHA=7dbe945d6c9315cbe6c6a45c7a64ee354a2fe22b
FINAL=V2_04_HOSTED_TIP_RECONCILED
```

```
SERVICES_MANAGE=PASS
DOCTORS_MANAGE=PASS
CONTACT_R07_PARITY=PASS
PRICING_EDIT_MODE_LINKS=PASS
SERVICES_RBAC=PASS
DOCTORS_RBAC=PASS
PUBLIC_FIELD_PRIVACY=PASS
FOCUSED_TESTS=65/65
FINAL=V2_04_AC_PUBLIC_SITE_MANAGEMENT_FIX_PACK_COMPLETE
```
