# V2.11 Platform Extraction Candidates

Audit branch: `V11` at `90eaa4d5e9ef6e62d45f058bb38b63d10dd144ff`. Findings are static, evidence-backed recommendations; no implementation was performed.

## Boundary rule

`src/platform` should own reusable technical mechanisms and contracts. BlessBoard retains church, branch, member, ministry, attendance, pastoral, giving, announcement, and subscription policy. ActiveClinic retains patient, staff, facility, appointment, clinical, diagnostics, pharmacy, billing, booking, portal, and healthcare privacy policy. Neither product's roles, terminology, content schemas, themes, or business rules should be moved into Platform.

`node scripts/architecture/dependencyDirection.js` passed. The current scan reports a 29-entry platform/product allowlist and an empty cross-product allowlist. The allowlist entries are coupling hotspots, not proof that ownership is already cleanly separated.

## Candidate matrix

| # | BB source | AC source | Current/platform target | Duplicated behavior | Adapter boundary | Priority | Security impact | Est. lines |
|---:|---|---|---|---|---|---|---|---:|
| 1 | `src/blessboard/*` auth routes/services | `src/activeclinic/*` auth/identity | `src/platform/auth/*` | Password policy and credential flow | Product identity adapter | P0 | High |  |
| 2 | BlessBoard session middleware | ActiveClinic staff/patient sessions | `src/platform/session/*` | Cookie/session hardening and expiry | Product session namespace | P0 | Critical |  |
| 3 | BlessBoard CSRF middleware | ActiveClinic form/security middleware | `src/platform/http/v5Csrf.js` | Token issuance and validation | Form/action adapter | P0 | Critical |  |
| 4 | BlessBoard auth observability | ActiveClinic auth logging | `src/platform/http/v5AuthObservability.js` | Redacted auth events | Product event labels | P0 | High |  |
| 5 | `src/blessboard/services/*` authorization | `src/activeclinic/services/*` staff access | `src/platform/rbac/*` | Scope/permission evaluation primitives | BB branch/HQ and AC role adapters | P0 | Critical |  |
| 6 | Church host/tenant context | Clinic host/tenant context | `loadPlatformHostContext.js`, `tenantHostRouting.js` | Host normalization and tenant resolution | Product tenant registry | P0 | Critical |  |
| 7 | Church registration services | `activeClinicRegistrationAdapter.js` | `src/platform/registration/*` | Lifecycle/idempotency/review orchestration | Product fields and eligibility | P1 | High |  |
| 8 | `platformChurchRegistrationRepository.js` | AC onboarding repositories | `src/platform/onboarding/*`, provisioning transaction | Provisioning transaction/recovery | Product provisioning payload | P1 | High |  |
| 9 | BB website editor routes/services | `src/activeclinic/website/*` | `src/platform/website/*` | Draft/live/version/preview lifecycle | Product section schema | P0 | Critical |  |
| 10 | `websitePublicationVersionAdminRoutes.js` | AC CMS publication flows | `src/platform/website-engine/*` | History/diff/restore/publish governance | Product publication policy | P0 | Critical |  |
| 11 | `src/blessboard/media/*` | AC public media service | `src/platform/media/*` | Upload validation/storage lifecycle | Product placement policy | P1 | High |  |
| 12 | Church attachments | Clinic website uploads | `src/platform/website/mediaService.js` | URL and orphan handling | Tenant storage prefix | P1 | High |  |
| 13 | BlessBoard validators | ActiveClinic validators | `src/platform/validation/*` | Normalization and safe input primitives | Product validation schemas | P1 | High |  |
| 14 | `recordBlessBoardAudit` | AC audit services | `src/platform/audit/*` | Audit envelope/persistence | Product event taxonomy | P1 | High |  |
| 15 | Church notifications | AC email/message services | Platform delivery abstraction | Delivery/retry/redaction | Product templates | P1 | High |  |
| 16 | Church reports/downloads | AC operational reports | Platform reporting contracts | Query/download safety | Product report providers | P1 | High |  |
| 17 | BB rate limits | AC login/booking limits | Platform HTTP/auth limiter | Keying and throttling mechanism | Product endpoint policy | P0 | High |  |
| 18 | BB HQ/branch/admin shells | AC staff/admin shells | `views/platform/*`, `public/platform/*` | Shell composition/error states | Product navigation manifests | P1 | High |  |
| 19 | BB public routing/SEO | AC public routing/SEO | Platform host/context middleware | Host and safe public resolution | Product page registry | P1 | High |  |
| 20 | BB responsive/shared tokens | AC responsive/shared tokens | Scoped platform tokens only | Repeated layout/token declarations | Product theme overrides | P2 | Medium |  |

The matrix identifies candidate contracts, not a mandate to merge product implementations. A candidate is consolidatable only after parity tests and tenant/product isolation tests pass.

## Recommended extraction contracts

1. **Security kernel:** session, CSRF, rate-limit, safe logging, and audit envelopes. Preserve independent BB and AC identities and role catalogs.
2. **Tenant context:** normalize host and establish product-scoped organization context before product routing. Unknown hosts must fail closed.
3. **Workflow orchestration:** platform owns idempotency, transaction boundaries, lifecycle states, and recovery; products supply domain policy.
4. **Website engine:** platform owns generic document/version lifecycle; products own content schemas and publication policy.
5. **Media:** platform owns storage abstraction, server-side MIME/size checks, signed/public URL rules, and cleanup; products own placement.
6. **Shell composition:** platform owns generic navigation composition and error/security middleware; products own labels, modules, terminology, and visual identity.

## Coupling and product boundaries

Dependency direction is currently healthy: product code may depend on Platform, while direct Platform-to-product dependencies are limited to documented composition/adapter roots. Every allowlist entry should be migrated toward an explicit registry or adapter only when behavior remains identical.

Do not centralize:

- Church/member/branch/HQ semantics, ministry, attendance, prayer, pastoral care, giving, or church audiences.
- Patient/clinical identity, medical permissions, vitals, clinical documentation, laboratory/radiology, pharmacy, prescriptions, or healthcare billing.
- Product-specific route vocabulary, EJS content schemas, public brand systems, Stitch layouts, or domain reports.

## Required regression evidence

- Security: `tests/platform-v5-sessions.test.js`, `tests/v8-shared-auth-password-security.test.js`, `tests/v8-shared-session-security.test.js`, CSRF/input-output/sensitive logging suites.
- Isolation: `tests/v8-shared-rbac-tenant-isolation.test.js`, host/context tests, BlessBoard authorization/routing tests, ActiveClinic RBAC/isolation tests.
- Website: unified website management, draft/live integrity, BlessBoard publish/history, and ActiveClinic CMS suites.
- Product workflows: BlessBoard registration/member/attendance/giving suites; ActiveClinic registration, booking, patient, clinical, pharmacy, diagnostics, and billing suites.
- Architecture: dependency-direction scanner and platform/product boundary tests on every extraction batch.

## Findings confidence

The duplicated behaviors and proposed ownership are supported by static source inspection and existing platform modules. Exact line consolidation totals are not claimed because the same behavior may be intentionally product-specific and duplicate files may be compatibility fixtures. Runtime coverage, database state, and deployment configuration remain required before merging any implementation.

## V211-ARCH-02 verification

All 20 candidate rows were checked against the exact source paths and existing Platform equivalents listed above. The nine P0 rows remain high-risk infrastructure changes: authentication, sessions, CSRF, observability, RBAC, tenant resolution, website lifecycle, and rate limiting. They change security or publication contracts and therefore do not satisfy the first-batch acceptance criteria without a larger characterization effort.

The current dependency-direction scanner still passes with 29 documented Platform/product allowlist entries and no cross-product allowlist entries. No candidate justifies creating a second shared implementation; the eventual work must extend the listed Platform services behind product adapters.
