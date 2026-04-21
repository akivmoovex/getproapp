# Field agent stabilization — internal release notes

**Audience:** Maintainers. **Type:** Internal summary of a stabilization tranche (auth, callback, limits, CRM logs, duplicates). Not customer-facing release copy.

## What changed (high level)

| Area | Behavior |
|------|-----------|
| **Auth / session** | Protected routes re-load the field agent from DB; missing row, `enabled = false`, or tenant mismatch clears the session and sends the user to login (`src/auth/fieldAgentAuth.js`). |
| **Callback** | Server-side email validation (reject invalid/empty; trim / sensible edge cases). `src/routes/fieldAgent.js`. Tests: `tests/field-agent-console-routes.test.js`. |
| **Authed POST limiter** | Separate IP-based bucket from login for `POST` check-phone, add-contact submit, and call-me-back (`src/middleware/authRateLimit.js`, `src/routes/fieldAgent.js`). Defaults and NAT/shared-IP tuning: see config doc below. |
| **Dashboard copy** | KPI wording aligned (e.g. lead-fee SP commission 30d) with tests updated where assertions pinned old strings. |
| **CRM failure logging** | Structured JSON on CRM task create failure / null id for provider submission, website-listing review, and callback (`op`, `severity`, `sourceType`, entity id, `reason` or `error`). DB submission success can still occur if CRM fails — by design. `src/fieldAgent/fieldAgentCrm.js` + call sites in `src/routes/fieldAgent.js`. |
| **Duplicate files** | Removed stale `* 2.*` tests, `fieldAgent 2.js`, admin FA route stubs, views/public strays, env/doc/SQL dupes; **10** non-route `src/**` dupes remain (see triage). |

## Where to read more

| Doc | Use |
|-----|-----|
| [FIELD_AGENT_POST_FIX_SMOKE.md](./FIELD_AGENT_POST_FIX_SMOKE.md) | Short **manual smoke** before merge/deploy. |
| [CONFIG_AND_DEPLOYMENT.md](./CONFIG_AND_DEPLOYMENT.md) | **Field agent POST rate limits** (env vars, 429 shapes, NAT / shared IP, logging `field_agent_authed_post_rate_limit`). |
| [DUPLICATE_FILES_TRIAGE.md](./DUPLICATE_FILES_TRIAGE.md) | Remaining space-`2` duplicates and recommended cleanup order. |
| [field-agent-moderation.md](./field-agent-moderation.md) | Tables, CRM linkage, moderation truth boundaries. |
| [FIELD_AGENT_STABILIZATION_MERGE_PR.md](./FIELD_AGENT_STABILIZATION_MERGE_PR.md) | **PR / merge summary** (paste-ready, reviewer checklist). |

## Remaining risks (short)

- **Duplicates:** See [DUPLICATE_FILES_TRIAGE.md](./DUPLICATE_FILES_TRIAGE.md) — **10** `src/**` `* 2.*` files still need deliberate diff/delete (admin route dupes already removed).
- **Rate limits:** Cap is **per client IP** (not per agent). Offices / NAT may need a higher `GETPRO_FIELD_AGENT_AUTHED_POST_RATE_MAX` — see config doc.
- **CRM vs DB:** No retry queue; failures are visibility + manual follow-up.

## Tests (pointers only)

Examples: `tests/field-agent-console-routes.test.js`, `tests/field-agent-add-contact-submit.test.js`, `tests/field-agent-authed-post-rate-limit.test.js`, dashboard-related `tests/field-agent-*.test.js`. Full suite: `npm test` (PG-dependent tests need DB).
