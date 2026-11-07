# Overnight QA automation

This directory contains portable, source-controlled QA orchestration and safety
guards. Runtime contracts, credentials, reports, package caches, browser
binaries, and database state remain outside the repository.

The default posture is non-mutating: no database creation, migrations,
provisioning, credential lookup, scheduler activation, or production access.
Docker startup helpers require an explicit contract and run-owned identifiers.
Use `tests/qa/overnight/config/qa.env.example` as a template; never commit a
real environment file or secret.

The master runner supports dependency injection for unit tests. A real offline
runner must be supplied explicitly with `QA_OFFLINE_RUNNER`; otherwise that
stage is reported blocked. Browser and database stages require separately
approved runtime contracts and are not implied by the unit tests.

Run the nonmutating guard tests with:

```sh
node --test tests/qa/overnight/security/*.test.js
```

Do not copy QA_ROOT wholesale into this repository. Keep synthetic credentials,
runtime manifests containing secrets, logs, TAP output, downloaded packages,
node_modules, database dumps, and Docker volumes in the protected QA area.
