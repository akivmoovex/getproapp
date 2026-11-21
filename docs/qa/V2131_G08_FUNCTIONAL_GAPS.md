# V2.13.1 G08 — functional gaps

No row in the G08 matrix is a finished user workflow. The gaps below are the ones that still block that.

## Blocked by a missing decision or artifact

- The healthcare developer brief is not on disk, so its extra requirements were not scored.
- Enabled public booking and coupons stay deferred. The disabled booking path was not turned on.
- Clinical decision support, drug-interaction checks, and structured diagnosis codes stay deferred.
- Clinical file bytes stay deferred. There is no approved media-type list or maximum size.
- Paper destruction stays refused. Legal approval is required.
- A non-critical laboratory review status is not in the stored result check.
- Pharmacy stock expansion was not widened.
- BlessBoard media uploads stay off until a deployment sets `BLESSBOARD_MEDIA_UPLOADS_ENABLED`.
- A manual prescription does not enter the pharmacy queue unless it names a catalogue item and a whole-number quantity.

## Blocked by execution that this phase did not authorize

- HTTP suites for D04, D05, G03, G04, and G05 were not run.
- Playwright for ActiveClinic and BlessBoard was not run.
- Migration `043_record_migration_inventory.sql` was not applied, so migration batches, file inventory, retention categories, and holds are not in the database.
- BlessBoard public-page and structured-draft fixture rows are still absent.

## Left unchanged on purpose

- CSRF still fails closed.
- The OTP test provider still refuses production.
- Appointment updates still return `stale_version`.
- Uncertain patient matches are not merged.
- Audit metadata still drops passwords and OTP values.
- The offline route still returns 503 and does not write.
- No restore tool was added.
