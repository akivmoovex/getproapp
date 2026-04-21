# Recommendations (documentation, QA, product)

Priorities are **High**, **Medium**, or **Low** based on operational risk if unaddressed.

---

## Documentation gaps

| Priority | Recommendation |
|----------|----------------|
| **High** | Keep **`docs/route-to-screen-audit.md`** in sync when adding any `router.get/post` — drift is a security risk for RBAC reviews. |
| **Medium** | Add **sequence diagrams** only where disputes arise (intake publish → assignment → portal action); code is the source of truth today. |
| **Low** | Cross-link Android/API docs (`docs/android-*.md`) explicitly to **public** routes they call — currently separate silos. |

---

## QA gaps

| Priority | Recommendation |
|----------|----------------|
| **High** | Automate **role matrix smoke** (403/redirect expectations) — manual testing is error-prone for finance_viewer and CSR scope. |
| **Medium** | Add **data fixtures** documented per test env so `qa-standard-test-script.md` rows are not “Blocked” for every release. |
| **Low** | Playwright coverage for **join + API** happy paths (`/api/leads`, `/api/professional-signups`). |

---

## Permission / RBAC clarity gaps

| Priority | Recommendation |
|----------|----------------|
| **High** | **`end_user`** vs **`tenant_viewer`** — document business intent in admin user onboarding (both are read-only for mutations; neither gets CRM in current `canAccessCrm`). |
| **Medium** | **Field-agent analytics bulk actions** — confirm with product which roles may run bulk operations (code uses `requireCrmMutate`). |
| **Low** | Consider renaming finance role labels in UI to match internal slugs for support staff. |

---

## Data model clarity gaps

| Priority | Recommendation |
|----------|----------------|
| **Medium** | Publish a **single enum table** for `intake_client_projects.status` and `intake_project_assignments.status` straight from code constants/repos (avoid duplicating in markdown by hand). |
| **Medium** | **Pay-run state machine** — finance stakeholders need a one-page diagram of `field_agent_pay_runs.status` transitions (derive from `fieldAgentPayRunRepo` / routes). |
| **Low** | Archive **`000_full_schema.sql`** commentary if incremental migrations are now authoritative — reduce dual sources. |

---

## Product gaps

| Priority | Recommendation |
|----------|----------------|
| **High** | **End-client accounts** — if roadmap requires history/login, plan auth + session model (currently none in `clientPortal.js`). |
| **Medium** | **Company subdomain** only serves `/` — decide whether to expand or document as permanent limitation. |
| **Low** | **Israel launch** — environment flag behavior should be in runbooks for support. |

---

## Support / ops readiness gaps

| Priority | Recommendation |
|----------|----------------|
| **High** | Runbook for **session table growth** and PostgreSQL vacuum/monitoring. |
| **Medium** | Runbook for **finance soft-close / period lock** escalation (who can unlock). |
| **Low** | Centralize **Hostinger / LiteSpeed** bootstrap hints — already in `bootstrap.js` comments; link from ops onboarding. |

---

## Release readiness gaps

| Priority | Recommendation |
|----------|----------------|
| **High** | CI step: **`npm test`** (or subset) + **`npm run build`** before deploy; align with `RELEASE_NOTES.md` checklist. |
| **Medium** | Staging **DB refresh** policy — pay-run and finance tests mutate data. |
| **Low** | Tag releases in git matching `package.json` version when shipping. |

---

## Best next docs to maintain continuously

1. `docs/roles-and-permissions.md` — whenever `src/auth/roles.js` changes.  
2. `docs/route-to-screen-audit.md` — whenever routes or middleware change.  
3. `docs/qa-standard-test-script.md` — after user-facing workflow changes.  
4. `RELEASE_NOTES.md` — every production deploy (even doc-only if operators rely on checklists).

---

## Best next technical audits

1. **Pay-run and finance override** paths — trace all POSTs in `adminFieldAgentPayRuns.js` for idempotency.  
2. **Intake allocation** — formal invariants (`intakeProjectAllocation.js`) vs CRM expectations.  
3. **Phone normalization** — cross-region consistency tests for duplicate detection.  
4. **Session fixation / cookie flags** — already `httpOnly`, `sameSite=lax`, `secure` in production — periodic security review.

---

## Best next product hardening tasks

1. **Client review flow** abuse scenarios (project code + phone) — rate limits or OTP if risk accepted.  
2. **Field agent upload** antivirus or file-type deeper validation (beyond size/count).  
3. **Company portal** audit log visible to tenant managers for disputes.
