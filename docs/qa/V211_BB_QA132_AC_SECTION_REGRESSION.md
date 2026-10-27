# V211-BB-QA132 ActiveClinic Add Website Section Regression

## Result

The existing ActiveClinic HTTP coverage was executed against isolated
in-process fixtures:

- `tests/activeclinic-website-hardening.test.js`: 5/5 passed
- `tests/activeclinic-website-json-error-matrix.test.js`: 1/1 passed
- `tests/activeclinic-website-json-resolve-contract.test.js`: 2/2 passed
- total: 8 passed, 0 failed

The executed flows covered editor access, draft creation and persistence,
preview/public routes, CSRF failures, unauthorized modification, forged
tenant/clinic cases, lifecycle errors, media access and controlled JSON
responses. The logs showed successful draft POSTs and public page responses.

No dedicated QA132 Playwright spec was added. The available browser harness
still fails before authentication with `ERR_TOO_MANY_REDIRECTS` because the
runtime profile does not mount the expected ActiveClinic/BlessBoard tenant
login surface. Therefore browser assertions for Add Section picker
interaction, image editor usability and publish-through-browser remain
unverified.

No product source, migration or database was changed.
