# Field agent stabilization & duplicate cleanup — PR / merge summary

**Use:** Paste into the GitHub/GitLab PR description or attach for audit trail. **Not** a customer changelog.

---

## Summary

This branch hardens the **field-agent console** (auth/session revalidation, callback email validation, **IP-based** authed POST rate limiting), improves **operational visibility** (structured CRM failure logging for provider / website-listing / callback paths), aligns **dashboard copy** with tests, and removes **stale Finder-style duplicate files** (`* 2.*`) across tests, routes, views, public assets, env examples, docs, and SQL — without changing the intentional **“DB commit can succeed if CRM task creation fails”** behavior.

---

## Why

- Reduce security and abuse risk on authenticated field-agent **POST** surfaces while keeping login limits separate.
- Ensure disabled or removed agents cannot keep a stale session on protected pages.
- Give operators **grep-friendly JSON** when CRM inbound task creation fails or returns a null id.
- Eliminate **high-risk duplicate paths** that invited edits to the wrong file and merge noise.

---

## Risk / non-goals

- **Rate limits** are **per client IP** (not per agent). Shared NAT / office egress may need a higher **`GETPRO_FIELD_AGENT_AUTHED_POST_RATE_MAX`**; see **`docs/CONFIG_AND_DEPLOYMENT.md`**.
- **No** CRM retry queue, **no** schema changes for this tranche, **no** broad refactors — stabilization and cleanup only.
- **Duplicate removal** targeted files **proven unreferenced** and **strictly superseded** by canonical siblings per diff; remaining **`src/**`** `* 2.*` files are **out of scope** for this PR (listed in triage).

---

## Test & smoke coverage (what was exercised)

- **Automated:** Field-agent and admin FA tests exist (e.g. `tests/field-agent-console-routes.test.js`, `field-agent-add-contact-submit.test.js`, `field-agent-authed-post-rate-limit.test.js`, admin analytics / pay-run suites). **`npm test`** requires a **reachable Postgres** for PG-backed cases; a failing **`DATABASE_URL`** (e.g. `EHOSTUNREACH`) indicates **environment**, not necessarily a regression from this branch.
- **Manual:** **`docs/FIELD_AGENT_POST_FIX_SMOKE.md`** — short pre-merge/deploy checklist (login, disabled agent, add-contact, optional limiter burst, callback valid/invalid, dashboard wording, optional CRM log observation).
- This document **does not** claim full E2E or production verification unless your CI/staging ran it.

---

## Follow-up (not blocking this PR)

| Item | Pointer |
|------|---------|
| **10 remaining `src/**` space-`2` duplicates** | **`docs/DUPLICATE_FILES_TRIAGE.md`** — `auth/`, `fieldAgent/`, `lib/`, `db/pg/*`, `admin/fieldAgentPayRunExportCsv 2.js`, `companies/companyFieldAgentLinkage 2.js`; diff vs canonical, then delete when redundant. |
| **Ops** | Monitor **`field_agent_authed_post_rate_limit`** if 429s cluster by IP; tune env per config doc. |

---

## Related docs

| Doc | Role |
|-----|------|
| [FIELD_AGENT_STABILIZATION_RELEASE_NOTES.md](./FIELD_AGENT_STABILIZATION_RELEASE_NOTES.md) | Maintainer-facing feature index. |
| [FIELD_AGENT_POST_FIX_SMOKE.md](./FIELD_AGENT_POST_FIX_SMOKE.md) | Manual smoke matrix. |
| [DUPLICATE_FILES_TRIAGE.md](./DUPLICATE_FILES_TRIAGE.md) | Duplicate status & next steps. |
| [CONFIG_AND_DEPLOYMENT.md](./CONFIG_AND_DEPLOYMENT.md) | Rate limits, `TRUST_PROXY`, NAT note. |
| [field-agent-moderation.md](./field-agent-moderation.md) | Data model & CRM linkage. |

---

## Reviewer checklist

- [ ] Confirm **no** `require` / `render` / `include` references paths containing **` 2.`** for removed files (spot-check or rely on CI grep).
- [ ] **Staging or CI:** Run **`npm test`** with **working `DATABASE_URL`** (or your standard **`test:pg:isolated`** flow) before production merge.
- [ ] Optional: run **`docs/FIELD_AGENT_POST_FIX_SMOKE.md`** on staging.
- [ ] Skim **`docs/DUPLICATE_FILES_TRIAGE.md`** — acknowledge **10** remaining **`src/**`** dupes as **follow-up**, not regressions introduced here.
