# Field agent console — post-fix manual smoke matrix

**Purpose:** Quick manual checks after recent stabilizations (auth revalidation, callback email validation, authed POST rate limit, dashboard copy, CRM structured logging, duplicate cleanup). **Not** a full regression suite.

**Environment:** Use a non-production or staging tenant host (e.g. regional subdomain) with a real field-agent account unless noted.

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Open `/field-agent/login` while logged out | Login form loads |
| 2 | Sign in with valid field-agent credentials | Redirect to `/field-agent/dashboard` (or equivalent success) |
| 3 | While logged in, open `/field-agent/dashboard` | Dashboard loads (200); session persists |
| 4 | **Auth hardening:** In DB (or admin), set `field_agents.enabled = false` for this user **or** delete the row; reload `/field-agent/dashboard` (or any protected FA page) | Redirect to `/field-agent/login` (session cleared for bad row) |
| 5 | Re-enable / recreate agent and log in again | Dashboard accessible again |
| 6 | **Add-contact happy path:** `/field-agent/add-contact` → fill required fields, 1 profile + 2+ work JPEGs → submit | Redirect to dashboard with success (`submitted=1` or equivalent); new row visible in pipeline / DB |
| 7 | **Authed POST limiter (optional):** On a **staging** host, temporarily set a **low** `GETPRO_FIELD_AGENT_AUTHED_POST_RATE_MAX` (see `docs/CONFIG_AND_DEPLOYMENT.md`), restart, then exceed that many combined `POST`s to check-phone / add-contact submit / call-me-back from **one** IP | **429**; API calls return JSON `{ ok: false, error: "…" }`; form posts return plain text; server log includes `field_agent_authed_post_rate_limit` warning JSON |
| 8 | **Callback — valid email:** `/field-agent/call-me-back` → submit with valid email + other required fields | Redirect to dashboard with `callback=1`; no inline error |
| 9 | **Callback — invalid email:** same form with e.g. `not-an-email` | **400**; page shows **Enter a valid email address.** (or equivalent error banner) |
| 10 | **Callback — trim:** submit with spaces around a valid email | Success path; stored email trimmed (optional DB spot-check) |
| 11 | **Dashboard wording:** On dashboard, locate the SP lead-fee KPI tile | Label reads **Lead-fee SP commission (30d)** (not `SP_Commission`); metrics grid `aria-label` mentions **commission** (view source if needed) |
| 12 | **CRM logging (optional):** During add-contact submit, watch app logs | On CRM failure, lines include JSON with `op` **`field_agent_provider_submission`** and `severity` **`error`** or **`warning`** (`null_task_id`); **UI still succeeds** if DB commit already done (no user-visible rollback) |

**Notes**

- Step 4 requires DB or ops access; skip on pure front-end QA if unavailable.
- Step 7 is **optional** — default cap (30 / 15 min) is tedious to hit by hand; use staging + low env or scripted burst.
- Step 12 depends on CRM/DB behavior; absence of errors is normal when CRM succeeds.
