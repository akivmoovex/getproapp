# Duplicate `* 2.*` files — triage (internal)

**Status:** **10** files remain with a space-`2` suffix (e.g. `foo 2.js`), all under **`src/`**. They **differ** from the canonical `foo.ext` (not byte-identical). **No `* 3.*` files** remain. *(Count is repo-wide `find … -name '* 2.*'` excluding `node_modules`; your tree may differ slightly.)*

**Runtime:** Nothing in the repo **`require`s** or imports paths containing ` 2.` for app code. Admin field-agent routes use **`adminFieldAgentAnalytics.js`** / **`adminFieldAgentPayRuns.js`** (no ` 2`); `server.js` uses canonical **`./src/routes/fieldAgent`**. EJS **`render()`** calls use canonical view names (no ` 2` in template paths).

**DB:** `scripts/apply-test-db-schema.js` **skips** `* 2.sql` files; canonical numbered migrations apply only.

### Duplicate tests — resolved (FA-NEXT-11)

Removed four files: `tests/field-agent-dashboard-api.test 2.js`, `tests/field-agent-moderation-integration.test 2.js`, `tests/marketing-operational-urls.test 2.js`, `tests/admin-field-agent-pay-runs.test 2.js`. Each **`diff`** showed the canonical `*.test.js` as a **strict superset** (newer assertions / helpers / `ensureFieldAgentSchema` / extra scenarios); duplicates were stale Finder-style copies. **No merge** was required.

**`npm test`:** The script is `node --test tests`. Node’s default file patterns treat tests as names ending in **`.test.js`**. Filenames like **`*.test 2.js`** (space before `2`) **do not** match that suffix, so these duplicates were **not** auto-executed alongside canonical files — risk was mainly confusion and accidental manual runs.

### Field agent routes — resolved (FA-NEXT-12)

Deleted **`src/routes/fieldAgent 2.js`**. **`diff`** vs `src/routes/fieldAgent.js`: duplicate was ~400 lines vs ~1500 — an **older partial fork** (e.g. simpler dashboard metrics, fewer imports, `multer` `files: 12` vs `20`, no authed POST limiter, pre–structured CRM logging). **Canonical is a strict superset** of behavior in use at runtime (`server.js` → `require("./src/routes/fieldAgent")`). **No merge** into canonical.

### Views & public assets — resolved (FA-NEXT-13)

Removed **12** EJS duplicates under `views/**` and **2** stray JS files under `public/` (`field-agent-contact 2.js`, `field-agent-dashboard 2.js`). **Grep** found **no** `res.render(…)`, `include(…)`, `vite.config.mjs`, or `assetUrls` references to paths containing ` 2`. **`diff`** vs canonical in each case showed duplicates as **older / shorter** (e.g. `about 2.ejs` missing `htmlLang` / `hreflangAlternates`; `add_contact 2.ejs` vs longer canonical; pay run detail ~273 vs ~714 lines). **No merge** — canonical already carries current product behavior. Served field-agent scripts remain **`public/field-agent-contact.js`** and **`public/field-agent-dashboard.js`** via `asset()` / Vite entries.

### Admin field-agent routes — resolved (FA-FINAL-17)

Deleted **`src/routes/admin/adminFieldAgentAnalytics 2.js`** (~68 lines vs canonical ~962) and **`src/routes/admin/adminFieldAgentPayRuns 2.js`** (~453 lines vs ~1464). **Grep:** no `require(…/adminFieldAgentAnalytics 2)` or `PayRuns 2`. Tests and docs **`require`** the canonical modules only. **`diff`:** canonical is a **strict superset** (analytics stub vs full KPI/export/guardrails; pay runs duplicate missing reconciliation, payout flashes, workflow middleware renames, etc.). **No merge.**

**Remaining under `src/` (10):** `auth/fieldAgentAuth 2.js`, `fieldAgent/fieldAgentCrm 2.js`, `lib/marketingOperationalUrls 2.js`, `db/pg/ensureFieldAgentSchema 2.js`, `db/pg/fieldAgentAnalyticsRepo 2.js`, `db/pg/fieldAgentPayRunRepo 2.js`, `db/pg/fieldAgentSubmissionsRepo 2.js`, `db/pg/fieldAgentsRepo 2.js`, `admin/fieldAgentPayRunExportCsv 2.js`, `companies/companyFieldAgentLinkage 2.js` — treat with the same diff-then-delete playbook when ready.

### Env / docs / SQL duplicates — resolved (FA-FINAL-18)

Removed **`.env.development 2.example`**, **`.env.production 2.example`** (strict subsets of **`.env.development.example`** / **`.env.production.example`** — older comments, missing FA rate-limit / branding / DB-tools guidance). Removed **`docs/CONFIG_AND_DEPLOYMENT 2.md`** (subset of **`docs/CONFIG_AND_DEPLOYMENT.md`**). Removed **`db/postgres/002_field_agent 2.sql`**: duplicate was an **outdated schema fork** (submission `status` CHECK missing `info_needed` / `appealed`; partial unique indexes omitted those statuses). Canonical **`002_field_agent.sql`** is authoritative; `scripts/apply-test-db-schema.js` already **skips** `* 2.sql`. **Grep:** no references to these `* 2.*` paths. **No merge.**

---

## Risk by group

| Group | Files (count) | Canonical | Runtime uses canonical? | Duplicate role | Risk | Recommended action |
|-------|----------------|-----------|-------------------------|------------------|------|----------------------|
| **Routes / controllers** | *— none (admin FA routes removed FA-FINAL-17)* | `*.js` without ` 2` | Yes | — | — | Previously two admin `* 2.js` route files |
| **Other `src/**`** | **10** non-route dupes (list under FA-FINAL-17 above) | Same path without ` 2` | Yes | Stale copy | **High** — wrong-file edits | `diff` vs canonical; delete when strict subset |
| **Views** | *— none (removed FA-NEXT-13)* | `*.ejs` without ` 2` | Yes | — | — | Twelve stale `* 2.ejs` copies removed |
| **Public JS** | *— none (removed FA-NEXT-13)* | `public/field-agent-*.js` (no ` 2`) | Yes | — | — | Two stale copies removed; Vite / `assetUrls` use canonical names |
| **Tests** | *— none (removed FA-NEXT-11)* | `*.test.js` | N/A | — | — | Previously four `*.test 2.js` stale copies; deleted after diff vs canonical |
| **Config / env examples** | *— none (removed FA-FINAL-18)* | `.env.*.example` without ` 2` | No | — | — | Two stale `* 2.example` copies |
| **Docs** | *— none (removed FA-FINAL-18)* | `CONFIG_AND_DEPLOYMENT.md` | Yes | — | — | Stale `CONFIG_AND_DEPLOYMENT 2.md` |
| **DB SQL** | *— none (removed FA-FINAL-18)* | `002_field_agent.sql` | Yes | — | — | Outdated `002_field_agent 2.sql` (wrong status CHECK / partial indexes) |

---

## Recommended next steps (no automatic cleanup)

1. **`src/**` space-`2` modules** (10 remaining): batch `diff` vs canonical per file; delete when redundant (prioritize **`db/pg/*`** and **`auth/`** if touched often).

**Do not** copy from `* 2.*` into production without a deliberate merge review; assume canonical files are source of truth until proven otherwise.
