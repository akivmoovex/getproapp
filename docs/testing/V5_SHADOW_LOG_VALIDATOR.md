# V5 shadow-mode log evidence validator

**Date:** 2026-07-19  
**Purpose:** Validate **locally captured, redacted** `blessboard_tenant_route_shadow` log extracts before filing shadow evidence.  
**Companions:** [`V5_SHADOW_MODE_RUNBOOK.md`](../deployment/V5_SHADOW_MODE_RUNBOOK.md) · [`V5_SHADOW_EVIDENCE_WORKSHEET.md`](../deployment/V5_SHADOW_EVIDENCE_WORKSHEET.md) · [`V5_SHADOW_ROUTING_READINESS.md`](../deployment/V5_SHADOW_ROUTING_READINESS.md)

**Hard rules**

- Local file only (`--file <path>`)
- **No** production DB connection
- **No** remote log fetch / HTTP(S) URLs
- **Never** prints raw sensitive log lines — stdout is a JSON report of codes/fields only

---

## Command

```bash
npm run verify:v5:shadow-log -- --file /path/to/redacted-shadow.log

# Optional expectations (match mode)
npm run verify:v5:shadow-log -- --file ./shadow.log \
  --hostname diagnostic.blessboard.org \
  --organization-key diagnostic-church \
  --church-key diagnostic-church \
  --primary-branch-key hq

# Unknown-host evidence
npm run verify:v5:shadow-log -- --file ./unknown.log --mode unknown-host \
  --hostname unknown.blessboard.org
```

| Exit | Meaning |
|------|---------|
| `0` | PASS — required evidence present; no forbidden patterns |
| `1` | FAIL — missing evidence, mismatch, secrets, or malformed |
| `2` | Usage / argument error |

Implementation:

| Piece | Path |
|-------|------|
| Library | `src/blessboard/tools/shadowLogValidator.js` |
| CLI | `scripts/verify-v5-shadow-log.js` |
| npm script | `verify:v5:shadow-log` |
| Fixtures | `tests/fixtures/shadow-logs/*.log` |
| Tests | `tests/blessboard-shadow-log-validator.test.js` |

---

## Log format supported

Current emitter (`loadBlessBoardTenantRouting.js` → `logShadow`) writes **JSON** after a fixed prefix:

```text
[blessboard-tenant-routing] {"event":"blessboard_tenant_route_shadow",...}
```

Also accepted: a bare JSON object line with `"event":"blessboard_tenant_route_shadow"`.

**Plain-text key=value shadow logs are not emitted today** — the validator does **not** invent a second format.

---

## Fields checked (match mode)

Aligned with live `logShadow` payload + readiness §9:

| Evidence intent | Log field(s) | Pass rule |
|-----------------|--------------|-----------|
| Request ID | `requestId` | Non-empty |
| Hostname | `hostname` | Non-empty (+ optional `--hostname`) |
| Deployment comparison | `deploymentComparisonResult` | `match` |
| Organization comparison | `organizationKey` | Non-empty (+ optional `--organization-key`) |
| Church comparison | `churchKey` | Non-empty (+ optional `--church-key`) |
| Primary branch comparison | `primaryBranchKey` | Non-empty (+ optional `--primary-branch-key`) |
| HQ branch comparison | `primaryBranchKey` (or optional `hqBranchKey`) | Present — current code logs **primary only**; demo HQ ≡ primary |
| Shadow decision | `proposedReason` | `shadow_match` |
| Response behavior unchanged | `proposedRouteOutcome` | `foundation` |
| Platform/catalogue | `platformResultType`, `catalogueResultType` | `resolved_tenant` / `resolved` |
| Event | `event` | `blessboard_tenant_route_shadow` |

### Unknown-host mode (`--mode unknown-host`)

| Field | Pass rule |
|-------|-----------|
| `requestId`, `hostname` | Present |
| `platformResultType` | Contains `unknown` or `invalid_hostname` |
| `proposedRouteOutcome` | `foundation` |

Catalogue keys may be null.

---

## Forbidden patterns (fail closed)

If any match on a shadow candidate line, validation fails. Report includes **pattern id only** — never the matched secret text.

| Pattern id | Intent |
|------------|--------|
| `database_url_env` | `DATABASE_URL` |
| `getpro_database_url` | `GETPRO_DATABASE_URL` |
| `postgres_url` / `mysql_url` | Connection strings |
| `password_assignment` | `password=` / `password:` |
| `session_secret` | `SESSION_SECRET` |
| `session_token` | session token keys |
| `cookie_header` / `cookie_assignment` / `set_cookie` | Cookie material |
| `authorization_bearer` / `bearer_token` | Auth headers/tokens |
| `csrf_secret` | CSRF secrets |
| `transfer_query_raw` | Raw `tr=` / `code=` / `transfer=` (allows `=REDACTED`) |
| `v5_session_cookie` | `blessboard_*_sid=` |
| `aws_key` / `private_key_block` | Accidental key material |

---

## Failure codes

| Code | Meaning |
|------|---------|
| `missing_file` / `file_not_found` / `not_a_file` | Path problems |
| `remote_path_refused` | http(s) or other URL scheme |
| `missing_evidence` | No shadow events in file |
| `malformed_log` | Prefix/marker without valid JSON |
| `missing_identifier` | Required field empty/null |
| `mismatch` | Wrong key, deployment, reason, or types |
| `response_behavior` | `proposedRouteOutcome` ≠ `foundation` |
| `forbidden_pattern` | Secret / URL / cookie / token leak |
| `wrong_event` | Unexpected `event` value |

---

## Fixtures

| File | Scenario |
|------|----------|
| `valid-match.log` | Happy path resolved tenant + `shadow_match` |
| `mismatch-deployment.log` | `deploymentComparisonResult=mismatch` |
| `missing-identifiers.log` | `requestId: null` |
| `secret-leakage.log` | Intentionally dirty line (local fixture only) |
| `unknown-host.log` | `unknown_domain` + foundation outcome |
| `malformed.log` | Broken JSON / marker without object |

```bash
node --test tests/blessboard-shadow-log-validator.test.js
```

---

## Operator workflow

1. Capture Hostinger/app logs after supervised shadow enable (runbook).  
2. Redact manually if needed; save to a **local** file.  
3. Run `npm run verify:v5:shadow-log -- --file …`.  
4. Attach JSON report (not raw logs) to the evidence worksheet.  
5. Do **not** commit production log dumps with PII/secrets.

This tool does **not** enable shadow mode and does **not** authorize authoritative routing.
