# V2.11 Refactoring Roadmap

This roadmap is based on the V11 read-only architecture audit. It proposes independently testable work; it does not authorize or include implementation.

## Inventory-derived estimates

- Estimated removable lines currently proven safe: **0**.
- Estimated conditional legacy-runtime removal: **~620 lines** (`index.js` plus approximately `server.legacy.js`), after all prerequisites pass.
- Estimated consolidatable lines: **NOT VERIFIED**. Static duplication is substantial, but exact duplicates include compatibility files, fixtures, generated snapshots, and product-specific UI. A measured total requires runtime coverage and ownership review.
- Exact duplicate evidence includes 9 ActiveClinic public JS files, 22 Platform JS files, 67 legacy church views, 43 `src/church` modules, and 717 test files. These are investigation inputs, not deletion approvals.

## Priority batches

### P1 — Evidence and guardrails (low-risk, high-value)

**Dependencies:** none beyond current branch and test tooling.
**Files affected:** audit manifests, dependency-direction allowlists/tests, route/import inventory tooling.
**Benefit:** makes reachability and ownership measurable before deletion.
**Risk:** low; false positives can misdirect cleanup.
**Regression tests:** dependency direction, architecture guardrails, static inventory fixture tests.
**Rollback:** revert the audit/tooling commit.

Capture a machine-readable route/view/asset manifest, distinguish dynamic consumers, record deployment profile usage, and attach ownership to the 29 current platform/product allowlist entries. Do not delete based on filename or duplicate hashes.

### P2 — Security mechanism contracts (P0 priority)

**Dependencies:** tenant-context contract and product adapter interfaces.
**Files affected:** `src/platform/session/*`, `src/platform/http/v5Csrf.js`, auth observability, rate-limit middleware, product auth/session adapters.
**Benefit:** one hardened implementation for cookies, CSRF, redaction, expiry, replay protection, and throttling.
**Risk:** critical; identity or tenant leakage can affect both products.
**Regression tests:** session, CSRF, auth/password, rate-limit, sensitive logging, BB/AC identity isolation.
**Rollback:** feature-flag adapter selection and retain prior product path until parity is proven.

Never merge BlessBoard and ActiveClinic identities or role vocabularies. Platform supplies mechanisms; products supply identity semantics and policy.

### P3 — Tenant and RBAC contracts (P0 priority)

**Dependencies:** security kernel.
**Files affected:** `src/platform/rbac/*`, `loadPlatformHostContext.js`, `tenantHostRouting.js`, BB authorization/branch/HQ adapters, AC staff/patient-role adapters.
**Benefit:** consistent fail-closed host and tenant resolution.
**Risk:** critical authorization regression.
**Regression tests:** host/context, shared RBAC/tenant isolation, full BB authorization/routing, AC RBAC/isolation.
**Rollback:** preserve product guards behind adapter contract and revert registry wiring.

### P4 — Website lifecycle extraction (P0 priority)

**Dependencies:** tenant/RBAC contracts and schema registry.
**Files affected:** `src/platform/website/*`, `src/platform/website-engine/*`, BB website services/routes, AC website/CMS services.
**Benefit:** consistent draft/live, preview, version history, restore, publish, and audit mechanisms.
**Risk:** critical data-integrity and publication risk.
**Regression tests:** draft/live integrity, unified website management, BB publish/history, AC CMS/website tests, tenant scope tests.
**Rollback:** dual-read/controlled adapter rollout; retain existing publication path until reconciliation passes.

### P5 — Registration and provisioning orchestration (P1 priority)

**Dependencies:** tenant/RBAC and audit contracts.
**Files affected:** `src/platform/registration/*`, `src/platform/onboarding/*`, provisioning transaction, BB and AC registration adapters.
**Benefit:** shared idempotency, review lifecycle, consent evidence, recovery, and transaction behavior.
**Risk:** high; onboarding and tenant creation can strand accounts.
**Regression tests:** all BB registration/approval suites, AC registration/terms/onboarding suites, provisioning recovery and audit tests.
**Rollback:** retain product orchestration as fallback and reconcile duplicate/idempotency keys.

### P6 — Media lifecycle (P1 priority)

**Dependencies:** tenant context and authorization.
**Files affected:** `src/platform/media/*`, `src/platform/website/mediaService.js`, BB media/attachments, AC public media service.
**Benefit:** consistent server-side validation, tenant prefixes, URL policy, cleanup, and orphan handling.
**Risk:** high; arbitrary file access or broken public assets.
**Regression tests:** BB media/attachment suites, AC public media suites, MIME/path isolation tests.
**Rollback:** preserve storage prefixes and switch adapter routing back.

### P7 — Audit, notifications, reporting contracts (P1 priority)

**Dependencies:** security kernel and event registry.
**Files affected:** `src/platform/audit/*`, safe logging, delivery/reporting contracts, BB and AC event/report providers.
**Benefit:** redacted audit envelopes, consistent delivery/retry, and safe download interfaces.
**Risk:** high for PHI, credentials, phone numbers, and compliance evidence.
**Regression tests:** audit, sensitive logging, notification delivery, report authorization/download suites.
**Rollback:** keep product event writers and route through compatibility envelopes.

### P8 — Admin shell composition and scoped UI tokens (P2 priority)

**Dependencies:** tenant context and product navigation manifests.
**Files affected:** `views/platform/*`, `public/platform/*`, BB/AC shells and scoped CSS.
**Benefit:** reduces genuine shell duplication without crossing product branding.
**Risk:** medium/high visual and route regression; Stitch parity must remain product-specific.
**Regression tests:** shell/navigation, responsive structure, visual snapshots, product isolation, accessibility.
**Rollback:** restore product shell renderer; retain shared primitives only.

### P9 — Legacy fallback retirement (P3 priority)

**Dependencies:** every prior batch, deployment inventory, data/session migration, route retirement plan.
**Files affected:** `server.legacy.js`, `index.js`, legacy routes/auth/tenants/views and legacy-only dependencies.
**Benefit:** removes obsolete startup branch and V4 runtime surface.
**Risk:** highest; unsupported domains, APIs, sessions, and databases may still depend on it.
**Regression tests:** full route/API coverage, deployed smoke, profile matrix, session migration, database compatibility, rollback rehearsal.
**Rollback:** restore the fallback branch and deployment profile; do not delete historical migrations.

`server.legacy.js` is not safe to delete today. Missing `PLATFORM_DEPLOYMENT_CODE` can still select it, and it mounts active legacy route families and legacy database/session consumers.

### P10 — Cosmetic/duplicate cleanup (P4 priority)

**Dependencies:** runtime manifest, coverage, ownership approval.
**Files affected:** suffixed duplicate assets/views/CSS/JS and unused helpers.
**Benefit:** lower maintenance and bundle noise.
**Risk:** hidden dynamic references and compatibility breakage.
**Regression tests:** asset/view manifest, route crawl, browser smoke, visual snapshots.
**Rollback:** restore individual assets; avoid bulk deletion.

## Top risks and unknowns

- Unprofiled startup fallback is a direct legacy reachability blocker.
- Static imports do not prove absence of dynamic EJS, browser, database, job, or deployment consumers.
- Historical migrations and rehearsal scripts are rollback assets.
- Consolidating auth/RBAC/website publishing without product adapters risks cross-tenant or cross-product authorization.
- Public CSS/JS duplicates may be intentional deployment snapshots or product-specific Stitch implementations.
- No production access, credentials, migration, database mutation, route crawl, or coverage run was used in this phase.

## Completion gates

Each batch must produce: an ownership decision, adapter contract, focused tests, full relevant regression evidence, dependency-direction pass, deployment impact note, rollback procedure, and a clean diff limited to that batch. Large runtime retirement must not be mixed with feature work.

## V211-ARCH-02 selection

No production extraction satisfies all first-batch acceptance criteria. The smallest useful and reversible batch is therefore the isolated characterization batch described in `V211_FIRST_REFACTORING_BATCH.md`. It changes documentation/tests only, introduces no Platform API, and deliberately leaves product code, startup, deployment, sessions, CSRF, RBAC, URLs, and database behavior unchanged.
