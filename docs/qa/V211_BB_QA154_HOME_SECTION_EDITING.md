# V211-BB-QA154 Home Section Editing

## Reproduction

Using the QA153 V5 administrator session and the authorized disposable
database:

- `GET /hq/content/pages/home`: `200`
- Add-section form submission: `303`, new section editor opened
- New section editor: `200`, original text was present
- Edit/save submission with changed text and image: `400`
- Direct anonymous edit submission: `401`
- Invalid-CSRF structured mutations remain denied by the existing editor
  contract

The attempted publish request returned the existing publish-success redirect,
but the preceding section edit had not saved; public Home did not contain the
edited synthetic text or image. No false publication PASS is claimed.

## Classification

`SAVE_REJECTED`: the new section can be created and reopened, but the
section-form edit request returned `400` before text/image persistence. The
exact validation response needs to be surfaced by a focused test assertion
before changing product code. This run did not establish a confirmed product
root cause, so no runtime fix was made.

No product source, reset, migration, protected database mutation, commit,
push, or deployment was performed.
