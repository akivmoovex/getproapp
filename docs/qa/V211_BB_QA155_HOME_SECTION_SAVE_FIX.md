# V211-BB-QA155 Home Section Save Fix

## Exact failure

The section edit route is:

`POST /hq/content/pages/home/sections/:sectionKey`

The QA154 failing request used a valid V5 session and CSRF pair, but supplied
an arbitrary image URL in `media_url` while editing the section. That
submission returned `400`. The same canonical form submission with the image
field empty returned `303` and saved the text draft successfully.

The section editor's supported media contract is the website media
picker/upload contract; an arbitrary public image URL is not a valid media
selection. The failed QA154 request therefore had an invalid media payload,
not a rejected valid text-save contract.

## Verification

- Home editor GET: `200`
- Add section: `303`
- New section editor: `200`
- Canonical text save with issued CSRF: `303`
- Text persisted on reopen: verified by editor response
- Invalid arbitrary image URL: `400`
- Anonymous mutation: `401`
- Invalid CSRF: denied by the existing editor middleware
- Publish request: existing publish-success redirect
- Public Home edited text/image: not claimed because the image payload was
  invalid and the text-only draft was not published in this run

Classification: `TEST_PAYLOAD_INVALID`. No product fix was justified or
made. Image verification remains blocked on selecting an approved media asset
through the actual media-library/upload contract rather than submitting an
arbitrary URL.

No product source, reset, migration, protected database mutation, commit,
push, or deployment was performed.
