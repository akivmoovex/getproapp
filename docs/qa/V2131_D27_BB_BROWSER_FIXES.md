# V2.13.1 D27 — BlessBoard browser fixes

Parent `90d63f600134efa3f74709520a51aea7e17dae81`. No database writes and no browser execution.

## BB-MEM-01 required fields

The membership contract requires residential address, marital status, emergency contact name, relationship, and emergency phone. The HQ form only asked for name, phone, email, and branch, and the parser had stopped requiring the rest.

Those controls are on the add form and the review summary. The parser rejects a missing value and keeps the entered values. Email stays optional. Portal activation stays separate.

## BB-MEM-02 CSRF

The add form still posts the single shell token. A missing token stays 403. This phase did not add a bypass.

## BB-ANN-01 public visibility

A published announcement is public only when its audience includes `public` and its window is open. The success link now opens that announcement’s public path, not only the list. Drafts and other churches stay out of the query. HTTP confirmation was not run.

## BB-ANN-02 upload

A rejected upload now says whether the deployment switch is off, the file is too large, the session token failed, or the type is unsupported. A valid PNG still follows the existing media contract. `BLESSBOARD_MEDIA_UPLOADS_ENABLED` stays off unless the deployment turns it on. This phase did not call a production storage provider.

## BB-WEB-09 and BB-WEB-10

Add sermon and Add event open a create dialog with a new entity key. The form now stores `preachedAt` and `startsAt`, which the public pages read. Saving no longer drops the date into an unused `date` field. Add event is a button, not a non-clickable label.

## BB-WEB-08 fixture

The fixture builder still refuses a BlessBoard section without its church id. The isolated database was not written. Public page rows remain absent until a later authorized fixture write.

```
FINAL=V2131_D27
BRANCH=V13
HEAD_SHA=90d63f600134efa3f74709520a51aea7e17dae81
BB_MEMBER_FIELDS=REQUIRED_CONTROLS_ADDED
BB_MEMBER_CSRF=SINGLE_TOKEN_PRESERVED
BB_ANNOUNCEMENT_PUBLIC=DETAIL_LINK_CORRECTED
BB_MEDIA_UPLOAD=REASON_REPORTED_FLAG_UNCHANGED
BB_ADD_SERMON=CREATE_PAYLOAD_MAPPED
BB_ADD_EVENT=CREATE_BUTTON_ADDED
BB_THEME_FIXTURE=SOURCE_VALIDATED_ROWS_NOT_INSERTED
SAFE_TESTS_PASSED=447
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
DATABASE_MUTATION=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
BLOCKERS=HTTP and browser assertions were not run; media uploads stay fail-closed until the deployment flag is enabled
```
