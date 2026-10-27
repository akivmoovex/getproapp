# V211-BB-QA156 Home Media Publication

## Supported media contract

The Home section editor renders the shared media picker at
`/c/:organizationKey/website/media` and the upload form at
`POST /hq/content/media/upload`, using the issued V5 session and CSRF field.
Section persistence consumes the selected media URL/reference through the
canonical section form.

## Execution

The authorized QA75 session successfully loaded the Home section editor and
the media library endpoint returned `200`, but the authorized media library
was empty. A synthetic upload through the supported multipart route was then
attempted with the issued CSRF token and returned controlled `403
media_uploads_disabled`.

No arbitrary URL was submitted as a valid asset. Because no authorized
media asset existed and uploads are disabled in this QA runtime, image save,
image reopen, image URL resolution, and final public image verification could
not be safely executed. Text-only section persistence was established in
QA155; no new text/authentication investigation was repeated here.

Classification: `TEST_HARNESS_BLOCKED`. No product defect or product fix is
confirmed. No database reset, migration, protected database mutation,
commit, push, or deployment was performed.
