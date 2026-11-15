# Security controls

The test-database routes still use `requireApex` and `requirePlatformAdmin`. The role catalogue still uses `platform_admin_scope` and does not grant `activeclinic.pharmacy.dispense`.

A live lower-privilege HTTP 403 was not run. The in-process route contract is not that denial. A redirect to `/login` remains the response for a missing session.

No break-glass policy is approved, and no break-glass control was added.
