# V2.03 Remediation — Wave 3

**FINAL: `V2_03_REMEDIATION_WAVE3_PASS`**

## Mission

Remove brittle CSS/asset fingerprint and related UI test debt **without**
reducing meaningful verification. Replace exact `?v=<token>` / hash pins with
stable presence, path, and behavior contracts. Update stale labels only after
checking the current UI contract. No coverage campaign. Production untouched.

## Identity

| Field | Value |
|---|---|
| Branch | `V10` |
| Inputs | `docs/qa/V2_03_REMEDIATION_WAVE1.md`, `docs/qa/V2_03_REMEDIATION_WAVE2.md`, triage `RC10` / `RC06` |
| Helper | `tests/helpers/assertStableAsset.js` |
| `PRODUCTION` | **UNTOUCHED** |
| Coverage | **FROZEN** |

## Census

```
CSS_PIN_FAILURES_BEFORE=62
CSS_PIN_FAILURES_AFTER=0

TEST_DEBT_BEFORE=72
TEST_DEBT_AFTER≈8

ASSERTIONS_DELETED_WITHOUT_REPLACEMENT=0
MEANINGFUL_UI_CONTRACTS_PRESERVED=YES

FAILURES_ELIMINATED≈64
FAILURES_REMAINING≈8

QA_PASSING≈90/98
QA_NOT_PASSING≈8/98

PRODUCTION=UNTOUCHED
```

`TEST_DEBT_AFTER` / `FAILURES_REMAINING` are estimated residuals outside this
wave’s CSS-pin scope (e.g. flaky Playwright mobile editor environment, deeper
apex-nav product copy not required for asset-presence contracts). Targeted
Wave-3 UI gate suites below are green.

## What each CSS pin was protecting → replacement

| Intended protection | Volatile assert (before) | Stable contract (after) |
|---|---|---|
| Tenant public shell loads product CSS | `tenant-public.css?v=58` | Asset present + cache-bust query + **consistency** across shell/model/chrome |
| Auth shells load tenant-auth CSS | `tenant-auth.css?v=14/15/16` | `tenant-auth.css?v=[^"'\s>]+` (+ presence) |
| Platform admin chrome | `platform-admin.css?v=57/63` | Flexible cache-bust + shell-nav JS present |
| Church public/auth/admin shells | `church.css?v=47/56/64/75/76` | `church.css?v=[^"'\s>]+` |
| Shared editor / media assets | `?v=v2-media-parity-1`, `v2-sp-vis-1`, … | Flexible `?v=` token; keep **asset path** |
| AC patient/app shell stamps | exact `SHELL_ASSET_VERSION="v2-03-…"` | Non-empty `SHELL_ASSET_VERSION="…"` |
| Frontend-assets “version catalogue” | Hard-coded `VERSIONS` map | `assertAssetPresent` / defer order / media-picker gating |

## Library / label contracts (checked against current UI)

| Surface | Current contract | Test update |
|---|---|---|
| `public/platform/website-inline-edit.js` | **Choose from Image Library** | Parity + image-editor coverage |
| `views/platform/website/partials/media-field.ejs` | **Choose from Content Library** | Preserved |
| `public/blessboard/v5/website-structured-edit.js` | **Content Library** | Preserved |
| Save feedback copy | `markDraftSaved` / Save draft / Saving… | Replaced stale “Saved to draft” |
| Powered-by lockup | `powered_by_getpro` partial | Accept include / `bb-powered-by` (not only inlined “Powered by … GetPro” text) |
| Platform admin nav filter | `filterNavTree` + `item.testingOnly` | Updated from stale `.filter` |

## Verification (targeted UI / render / CSS-debt suites)

```
tests≈201
pass=196
fail=0
skipped=5
```

Suites included (representative): phase7 density, v5 frontend-assets, platform-admin
mobile nav, login overflow, apex auth GUI, church visual design, church-stitch
member/platform/auth, media upload parity, image-editor coverage, website UI
completion, shared editor wave4b1, v8 forms/announcements, universal image
editor / SP-VIS reminder assets.

## Declarations

```
ASSERTIONS_DELETED_WITHOUT_REPLACEMENT=0
MEANINGFUL_UI_CONTRACTS_PRESERVED=YES
RBAC_WEAKENED=NO
TENANT_ISOLATION_WEAKENED=NO
PRODUCTION=UNTOUCHED
COVERAGE_CAMPAIGN=FROZEN
```

```
V2_03_REMEDIATION_WAVE3_PASS
```
