# Security implementation

AC-05 was inspected and left in place. `GET /admin`, `GET /admin/settings/test-database`, and `GET /admin/settings/test-database/preview` still use `requireApex` and `requirePlatformAdmin`. The catalogue role remains `platform_administrator` with platform scope. No role was granted.

The proven authorization defect was guest-token registration. The phone-match path already required the clinic organization. The guest-token path did not, so a token issued for one clinic could create a portal identity while the visitor was on another clinic's register page. The register handler now passes `clinic.organizationId` and `clinic.healthcareOrganizationId`. The service returns `invalid_guest_token` when they do not match the booking, and it does that before `createPlatformIdentity`.

CSRF validation on registration is unchanged. Registration still redirects to login and does not call `issueAuthenticatedSessionCookie`.

No production OTP path was added. `1234` was not accepted as a production code.
