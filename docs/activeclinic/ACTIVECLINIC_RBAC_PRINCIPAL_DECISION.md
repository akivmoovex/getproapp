# ActiveClinic V6 — RBAC Principal Decision (AC-V6-06)

## Chosen model

**Option C — ActiveClinic staff-profile assignments using the shared permission/role catalogue.**

| Concept | Owner |
|---------|--------|
| Authentication principal | `platform.identities` |
| Authorization subject | `activeclinic.staff_members` |
| Product profile link | `platform.identity_product_profiles` (`activeclinic_staff` → staff id) |
| Role assignment | `activeclinic.staff_role_assignments` → `staff_member_id` + `blessboard.roles` |
| Permission catalogue | Shared `blessboard.permissions` / `blessboard.role_permissions` (ActiveClinic keys seeded) |

## Rejected alternatives

| Option | Why rejected now |
|--------|------------------|
| A — `principal_type`/`principal_id` on `user_role_assignments` | Touches every BlessBoard assignment path; high regression risk |
| B — `platform.access_principals` | Useful later; larger schema + dual-write before AC login exists |
| Naked `platform.identities` as RBAC subject | Identity ≠ employment; fails multi-org staff lifecycle |

## Compatibility

- BlessBoard `user_id` assignments unchanged.
- Sessions / auth_transfers unchanged.
- ActiveClinic permissions never inferred from BlessBoard roles or profiles.
- One identity may hold multiple ActiveClinic staff profiles (one per healthcare org); product-profile uniqueness for `activeclinic` is relaxed accordingly while BlessBoard remains one profile per identity.

## Authorization sequence

```text
platform identity (when auth exists)
→ active ActiveClinic enrolment
→ active healthcare organization
→ active staff_members row (linked identity when login exists)
→ active staff_facility_assignments (for facility-scoped roles)
→ active staff_role_assignments (unexpired)
→ permission keys via role_permissions
```

## Session dependency

Login remains unavailable until AC-V6-07 retargets session principal away from `blessboard.users`.
