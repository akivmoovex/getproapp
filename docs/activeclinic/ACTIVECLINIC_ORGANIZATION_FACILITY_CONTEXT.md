# ActiveClinic Organization & Facility Context

**Stage:** AC-V6-10

## Organization context

Displayed throughout the shell from the authenticated eligibility result.

Multi-org identities use `GET/POST /app/select-organization`:

1. List eligible organizations (active staff + product + roles + access)
2. Revalidate client-supplied organization ID server-side
3. Revoke current ActiveClinic session
4. Issue a new platform-identity session for the chosen organization
5. Redirect to `/app`

Cross-product / ineligible organizations are excluded.

## Facility context

Stored in `platform.deployment_sessions.context_json.selectedFacilityId` (additive column from migration `025`).

Validation on select:

- Organization ownership
- Active facility status
- Staff facility assignment (unless network admin)
- Role scope remains enforced by permission resolution

Rules:

- Network admin may operate without a selected facility
- One assigned facility may auto-select for facility-scoped staff
- Multiple facilities → `/app/select-facility`
- Zero facilities → honest empty state; facility-dependent flows redirect to select

Query parameters are **not** the persistence model.
