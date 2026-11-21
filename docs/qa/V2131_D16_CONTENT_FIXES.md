# V2.13.1 D16 — BlessBoard content management

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. D04–D15 files were left in place. No database, media object, role, migration, browser, or production OTP was used.

Safe contract and unit tests: 421 passed, 0 failed. The D04 and D05 HTTP suites and the Playwright specs were not executed. None of these fixes is verified by an authorized regression pass.

## BB-WEB-09

Add sermon now starts a new sermon on every click. The control is reset to `new-sermon` after a key is minted, so it does not stay bound to the seeded sermon or the previous draft. The HQ create form still posts `action=create` with title, speaker, preached date, and a confirmed publish status. The public sermons page prints a title only when that row is published. A published sermon that is not in the website snapshot stays in the public list beside the seeded sermon. A draft does not.

## BB-WEB-10

The new-event summary is a textarea named `summary`. Start, end, timezone, and location stay on the same form. A draft is stored as `draft`. The public events page prints a title only when that row is published. Church scope is still taken from the signed-in site, not from the form body.

## BB-ANN-01

The create form posts both a visibility select and a submit button named `status`. A publish click now wins, so the row is stored as `published` when confirmation is present. A draft click stays `draft`. The public list still requires a public audience and a published window. Drafts and another church’s rows are not selected.

## BB-ANN-02

The announcement editor has a file input that posts to the existing `/hq/announcements/media/upload` route. HTML and oversized images are still rejected by the media validator. A saved PNG is written into `media_asset_id` and shown by filename on the draft. After publish, the public list and detail print that filename and asset id, including when the image is the hero. Public delivery still requires the asset to belong to a published public announcement of the viewing church.

## Still blocked

Authorized HTTP and browser runs are not done. No announcement, sermon, event, or media row was written, and the disposable database and least-privilege role from D12 were not created.

FINAL=V2131_D16
BUGS_TARGETED=4
FIXED_IN_SOURCE=BB-WEB-09, BB-WEB-10, BB-ANN-01, BB-ANN-02
PARTIAL=
BLOCKED=
SAFE_TESTS_PASSED=421
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
DATABASE_MUTATION=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
BLOCKERS=Authorized HTTP and browser regression was not run. No sermon, event, announcement, or media row was written.
