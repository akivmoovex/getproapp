# V2.12 Database Dependency Map

## Inventory evidence

The disposable V2.12 database contains 232 tables across the application schemas and 1,556 raw foreign-key catalog rows. The machine-readable manifest records the table/column relationships and still requires review before becoming an executable deletion plan.

## Record classes

### Protected

- `platform.database_identity`
- `platform.schema_migrations`
- Platform products, plans, plan features, deployments, and required catalogue rows
- Active platform administrator identities, roles, and their preserving organizations

### Shared

- Platform organizations and product enrollments
- Platform identities, credentials, action tokens, session/auth-transfer records
- Platform domains, subscriptions, entitlements, audit events, jobs, and shared website structures

### BlessBoard-owned

- Churches and branches
- Users, role assignments, invitations, members and memberships
- Website pages, sections, drafts, publication versions, announcements, events, sermons, service settings, media references, giving, forms, and audit records

### ActiveClinic-owned

- Healthcare organizations and facilities
- Staff, facility assignments, clinical permissions
- Patients, patient identities, registrations, appointments, encounters, pharmacy, diagnostics, billing, booking, and portal records

### External resources

- Media files and object-storage keys referenced by media rows
- Email, SMS, WhatsApp, and other provider-side artifacts
- Background jobs or queue messages outside PostgreSQL

## Deletion planning

Safe future deletion must:

1. Select only explicit testing tenants and exclude preserved platform-admin organizations.
2. Traverse child records before tenant and organization parents.
3. Handle shared identity/session/audit rows with ownership-aware rules.
4. Preserve schema, migrations, identity, catalogue, and essential administrative access.
5. Invalidate sessions for affected identities.
6. Verify no orphan identities or cross-tenant rows remain.
7. Leave external media untouched until a separately approved storage cleanup contract exists.
8. Reseed required product and administrative records where the chosen scope requires it.

## Ambiguity and blockers

- ActiveClinic's complete organization-scoped deletion inventory is not yet represented in the existing reset repository.
- Some platform audit, identity, domain, and session records are shared and cannot be assigned to one tenant by table name alone.
- The raw FK count requires normalized graph generation before any destructive plan can be approved.
- No destructive operation was implemented or executed.

## Phase 3B classification result

The relevant inventory is classified as PROTECTED, TENANT_SCOPED, PRODUCT_SCOPED, SHARED, or AMBIGUOUS in `V212_RESET_DELETION_CONTRACT.md`. AMBIGUOUS records remain unresolved and therefore block reset approval. The map is a design input and is not an executable deletion plan. The complete generated inventory is `V212_CROSS_PRODUCT_OWNERSHIP_MANIFEST.json`.
