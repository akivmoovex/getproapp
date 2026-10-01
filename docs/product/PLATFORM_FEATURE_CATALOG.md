# Shared Platform Feature Catalog

**Mode:** READ-ONLY catalog synthesis (no application code changes).  
**Date:** 2026-10-02  
**Product:** Shared Platform  
**Authority:** Existing Cursor-generated audits/specs first; deferred ideas are IMPLEMENTED=NO (not claimed as shipped).  
**Comparison:** Not compared to other products in this document.

## Sources
- `docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md`
- `docs/releases/V2_03_RELEASE_NOTES.md`
- `docs/releases/V2_04_RELEASE_NOTES.md`
- `docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md`
- `docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md`

## Record schema

Each feature: FEATURE_ID · FEATURE_NAME · MODULE · PRODUCT · USER_BEHAVIOR · IMPLEMENTED · PRIMARY_ROUTE_OR_AREA · AUTOMATED_TEST · SOURCE_DOC · NOTES

**Totals:** FEATURES=45 · FULL(YES)=41 · PARTIAL=4 · NOT_IMPLEMENTED=0 · AUTOMATED_TESTED(YES)=45

## Identity

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-ID-01 | Platform identity sessions | Shared identity session issuance for product deployments | YES | createPlatformIdentitySession | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-ID-02 | Person foundation | Platform Person records foundation | PARTIAL | src/platform/person | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | FOUNDATION |
| PLAT-ID-03 | Person duplicate detection engine | Shared duplicate detection for staff person workflows | PARTIAL | duplicate engine | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | FOUNDATION |
| PLAT-ID-04 | Staff-managed person workflow | Shared staff person create/match workflow | PARTIAL | staff person workflow | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | FOUNDATION |

## Registration

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-REG-01 | Shared registration geography | Country + city fields + autocomplete | YES | geography services | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | PLAT-REG-GEOGRAPHY |
| PLAT-REG-02 | City catalogue | DB-backed country-aware city catalogue | YES | 044_city_catalogue | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-REG-03 | Registration country availability | Disabled countries reject forged POSTs | YES | 045_registration_country_availability | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-REG-04 | Self-registration provisioning kill switch | Operational enable/disable of auto-provisioning | YES | killSwitch / SELF_REGISTRATION_PROVISIONING_ENABLED | YES | docs/releases/V2_04_RELEASE_NOTES.md |  |

## Password / Recovery

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-PW-01 | Shared registration password rules UI | Live min/max length indicators (.is-met) | YES | GpRegistrationPasswordRules | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | Length-only canonical policy |
| PLAT-PW-02 | Shared password policy validation | Server-side registration password pair validation | YES | sharedPasswordPolicy / registrationPasswordPolicy | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | Do not weaken |
| PLAT-PW-03 | CSRF token issuance for public forms | CSRF cookie+field for registration/mutations | YES | v5Csrf | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |

## Form Drafts

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-DRAFT-01 | Multi-step form draft persistence | Signed draft hydrate across steps/refresh/validation | YES | multiStepDraftMerge / resolveRegistrationDraftForGet | YES | docs/releases/V2_04_RELEASE_NOTES.md | REG-STATE-01 |
| PLAT-DRAFT-02 | Sessionless registration drafts | Continue registration without login session | YES | registration draft cookies | YES | docs/releases/V2_04_RELEASE_NOTES.md |  |
| PLAT-DRAFT-03 | Cross-draft product isolation | BB and AC drafts do not cross-contaminate | YES | product adapters | YES | docs/releases/V2_04_RELEASE_NOTES.md |  |

## Media

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-MEDIA-01 | Shared media upload engine | Singular upload/image infrastructure | YES | shared media services | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | SHARED_UPLOAD_ENGINE_COUNT=1 |
| PLAT-MEDIA-02 | Media ownership rules | Tenant-scoped media ownership enforcement | YES | media ownership | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |

## Website Studio Infrastructure

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-WE-01 | Shared WE01 editor engine | Single inline editor engine for products | YES | website-inline-edit.js | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | SHARED_EDITOR_ENGINE_COUNT=1 |
| PLAT-WE-02 | Shared website presentation model | Shared presentation model + adapters | YES | website/presentation | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-WE-03 | Shared website component library | Reusable website components | YES | shared website components | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-WE-04 | Shared editor chrome shell | editor-chrome + overlays consumed by products | YES | platform/website-engine/editor-chrome | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| PLAT-WE-05 | Mini-website concurrency / stale rejection | True stale rejection on repeat edit | YES | draft revision conflict | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-WE-06 | Website management presentation UX | Shared hub status/actions presentation | YES | websiteManagementPresentation.js | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-WE-07 | Public website URL helpers | Canonical edit/preview/history/publish path builders | YES | publicWebsiteUrl.js | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md |  |

## Publishing

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-PUB-01 | Draft engine | Canonical draft save engine | YES | draft services | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-PUB-02 | Preview engine | Canonical draft preview | YES | preview paths | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-PUB-03 | Publish engine | Promote draft → live | YES | publicationService | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-PUB-04 | Unpublish engine | Take site offline preserving content | YES | unpublish | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-PUB-05 | Change Manager unpublished diffs | Count/diff draft vs published keys | YES | websiteChangeManager | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md | Baseline align |
| PLAT-PUB-06 | Provisional published baseline alignment | Seed drafts aligned so initial unpublished=0 | YES | provisionService / repair helper | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md |  |

## Version History

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-VER-01 | Version history engine | List/store website versions | YES | versionService | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-VER-02 | Restore-as-new-draft | Restore creates new draft only | YES | restore | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-VER-03 | Field history restore | Per-field history restore into draft | YES | field-history | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |

## Theme / UI Components

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-UI-01 | Semantic color / theme architecture | Shared colors.css; product identities via [data-product] | YES | src/platform/ui/theme/colors.css | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-UI-02 | Static asset versioning | Cache-bust asset version helpers | YES | applicationBuildInfo / asset version | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |
| PLAT-UI-03 | Product version 2.04 catalog | About/catalog shows 2.04 | YES | releaseNotesCatalog / About | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |

## Authorization

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-AUTHZ-01 | RBAC permissions catalogue | Shared permission keys for products | YES | permissions catalogue | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |
| PLAT-AUTHZ-02 | Website permission gates | view/edit/publish/restore website permissions | YES | website/permissions.js | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| PLAT-AUTHZ-03 | Approval-request foundation | Shared pending→approve/reject foundation | PARTIAL | requestApproval | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md | FOUNDATION |
| PLAT-AUTHZ-04 | Platform Admin website governance console | PA website console separate from product hubs | YES | platform admin website console | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |

## Audit / Logging

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-AUD-01 | Audit event logging | Standard app/DB audit events | YES | auditEventRepository | YES | docs/qa/ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX.md | AC-PD-01 |
| PLAT-AUD-02 | Website publish/edit audit actions | Audited website publish and sensitive edits | YES | publication/version audit keys | YES | docs/qa/V2_04_FEATURE_INVENTORY_AUDIT.md |  |

## Tenant Isolation

| FEATURE_ID | FEATURE_NAME | USER_BEHAVIOR | IMPLEMENTED | PRIMARY_ROUTE_OR_AREA | AUTOMATED_TEST | SOURCE_DOC | NOTES |
|------------|--------------|---------------|-------------|-------------|---------------|------------|-------|
| PLAT-TEN-01 | Deployment profile isolation | Deployment codes isolate product runtimes | YES | deploymentProfiles | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |
| PLAT-TEN-02 | Organization-scoped data access | Org/tenant scoping on shared services | YES | shared services authz | YES | docs/releases/V2_03_RELEASE_NOTES.md |  |
| PLAT-TEN-03 | Reject client tenant override | Block forged org/tenant in mutation bodies | YES | clientTenantOverride checks | YES | docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md |  |
| PLAT-TEN-04 | Cross-tenant website edit deny | Foreign tenant editor access denied without leak | YES | website attach/authz | YES | docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md |  |

## Footer

PRODUCT=Shared Platform
FEATURE_COUNT=45
FULL=41
PARTIAL=4
NOT_IMPLEMENTED=0
AUTOMATED_TESTED=45
