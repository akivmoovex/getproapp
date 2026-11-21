# V2.13.1 G15 — next release plan

Release stays no. Do not commit this tree until the items below are reviewed. The current HEAD of `origin/V13` does not include the local G01–G15 files.

## Order

1. Keep port `5432` untouched. Use only the isolated instance if a later prompt authorizes a write.
2. Run the already written D04 and D05 HTTP suites and the ActiveClinic and BlessBoard Playwright specs. Do not treat the  safe-test count as a workflow pass.
3. Fix only the assertions that fail. Do not enable public booking, coupons, clinical decision support, or media uploads while doing that.
4. Decide whether a prescription form may select a catalogue item. Until then the pharmacy queue will not receive a manual prescription.
5. Authorize one fixture write for the missing BlessBoard public page, with the church id required.
6. Apply `043_record_migration_inventory.sql` only after that authorization, and only on the isolated database. It has no down script.
7. Leave backup, restore, and offline mode unverified until a separate demonstration is authorized.

## Do not do next

- Do not mount `openMigrationBatch` without a permission check.
- Do not add an idempotency column unless a product key is specified.
- Do not insert `consultation_note_amendments`. The current contract forbids that table.
- Do not set `BLESSBOARD_MEDIA_UPLOADS_ENABLED` in this tree.

```
RELEASE_READY=NO
```
