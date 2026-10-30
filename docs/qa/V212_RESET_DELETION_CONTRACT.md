# V2.12 Reset Deletion Contract

## Approval status

`BLOCKED — proposed contract only; no destructive endpoint or operation is approved`.

## Classification

### PROTECTED

`platform.database_identity`, `platform.schema_migrations`, deployments, products, plans, plan features, required catalogue records, active platform administrator identities, administrator roles, and preserving administrator organizations.

### TENANT_SCOPED

BlessBoard churches, branches, members, memberships, invitations, announcements, events, sermons, service settings, website content, media references, and tenant audit records. ActiveClinic healthcare organizations, facilities, staff, patients, appointments, clinical, pharmacy, diagnostics, billing, booking, and portal records require explicit organization ownership validation.

### PRODUCT_SCOPED

Product enrollments, product-specific tenant records, BlessBoard website and church records, and ActiveClinic clinical/product records.

### SHARED

Platform organizations, identities, credentials, action tokens, sessions, auth transfers, domains, subscriptions, entitlements, audit events, jobs, deployments, and shared website structures.

### AMBIGUOUS

Platform audit rows without a tenant key, cross-product identities, shared domains, deployment sessions, auth transfers, external media objects, provider-side messages, background jobs, and any ActiveClinic record whose organization key is indirect.

Any AMBIGUOUS classification blocks destructive reset approval until ownership is proven.

## Proposed future plan

1. Verify explicit testing deployment and database identity.
2. Acquire and verify a restorable snapshot.
3. Lock the database against concurrent reset.
4. Revalidate scope, identity, authorization, backup, and protected administrator set.
5. Build a tenant-specific child-to-parent deletion plan from normalized foreign keys.
6. Delete only allowlisted tenant-owned rows inside transactional safeguards.
7. Preserve schema, migrations, catalogue, database identity, and essential administrators.
8. Invalidate affected sessions and tokens.
9. Leave external media untouched unless a separate storage contract is approved.
10. Verify no orphan identities, cross-tenant references, or invalid application references.
11. Record an append-only protected audit event.

## Current blockers

- ActiveClinic organization, facility, staff, patient, and appointment ownership is now proven through supported provisioning services.
- The normalized inventory contains 232 tables and 1,556 foreign-key relationships.
- BlessBoard Super Admin authentication and administrator survival are now verified using the supported deployment/role contract.
- ActiveClinic login and restored administrator recovery are verified; broad patient portal-link lifecycle coverage remains outside the proven contract.
- Shared identity/product-profile links, sessions, audit records, media metadata and external objects remain protected.
- Background-job reconciliation and external media cleanup contracts are not approved.
- No deletion execution is implemented or exposed.

## Phase 3E contract closure status

The five former ambiguous manifest entries have evidence-backed row ownership, but this is not deletion authorization. `blessboard.media_assets` is product-scoped; `platform.identity_product_profiles` is shared and protected; platform media metadata is shared and organization-scoped. All referenced external objects remain protected. Every reset scope therefore remains BLOCKED pending storage, queue/session, audit, reseeding, and fail-closed execution contracts.
