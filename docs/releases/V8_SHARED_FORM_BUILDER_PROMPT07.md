# V8 PROMPT 07 — Shared form builder (SH01–SH07)

**Branch:** `V8` only  
**Verdict:** `V8_SHARED_FORM_BUILDER_CODE_PASS`  
**Date:** 2026-09-21  
**Stitch:** https://stitch.withgoogle.com/projects/5087412725796049014 (`projects/5087412725796049014`)  
**Hosts:** Code + local automated tests only (no deploy / no migration apply)

## Audit summary

Existing BlessBoard `blessboard.forms` + `formSchema` provide allowlisted member-scoped schemas, but not the shared Moovex Form Studio surfaces (public URL/QR, discovery vs access, unpublish, cross-product branding, tenant `platform` tables). ActiveClinic had no form builder.

## Implementation

| Area | Detail |
|------|--------|
| Migration (additive, not applied overnight) | `db/migrations/platform/039_shared_tenant_forms.sql` — `tenant_forms`, `tenant_form_versions`, `tenant_form_access_tokens`, `tenant_form_submissions` |
| Shared schema | `src/platform/forms/formSchema.js` — allowlisted types; rejects clinical intake + executable validation; BB re-exports |
| Service | `src/platform/forms/tenantFormService.js` — CRUD, reorder, publish/unpublish, sharing, email-token access, public submit |
| Share / QR | `src/platform/forms/formShareService.js` |
| HTTP | `src/platform/http/sharedFormBuilderRoutes.js` mounted at AC `/app/forms` + `/f/:token`; BB `/hq/form-studio` + `/branch-admin/form-studio` + `/f/:token` |
| UI | `views/platform/forms/*` + `public/platform/forms-builder.css` — desktop + mobile; separate BB violet / AC teal branding |
| Permissions | AC: `website.view` / `website.edit|publish`; BB: `requests.view` / `requests.manage` |
| Exclusions | Clinical intake categories; arbitrary executable validation rules; SAML (deferred) |

### Stitch screen map (SH01–SH07)

| Screen | Stitch ID | Route / view |
|--------|-----------|--------------|
| SH01-D/M Forms dashboard | `b35102a755d44ad293508643d4129ea2` / `b69b4fbb27654b70a76442f21821e82a` | `dashboard.ejs` |
| SH02-D/M Empty | `6b3fd5a26a1e4f0d8b34519f60ac09ec` / `26536125a943458a93b15eff1f378200` | `dashboard-empty.ejs` |
| SH03-D/M Form Studio | `1f34ea48c3b4440fb81cc9b30b911bb7` / `0f5e6cefcee04f11ab84853dbb78f062` | `studio.ejs` |
| SH04-D/M Field settings | `e25fd0c0b9bf47d59ae76f647321bc09` / `a515485001e04439b6bd365edaacc527` | studio field rows |
| SH05-D/M Preview | `1a79a739bcf8480f9ef75ea38e10ff8a` / `962e2271102f4f3b8e7cb286665f0f57` | `preview.ejs` |
| SH06-D/M Publication | `fe936b780cdc4ab3866e6873a340b6c1` / `a6a224af8e764a64930f30b81ad5f10f` | `publication.ejs` |
| SH07-D/M Sharing & access | `41b1298195a44986931739e52f91ae6b` / `94f6cf1c716d4e1d9bdc563768710bd3` | `sharing.ejs` |

## Access model (SH07)

- **Discovery** (`discoverable`) is independent of **payload access**.
- **`open_public`**: possession of the public URL/QR is sufficient to submit.
- **`email_token`**: requires matching invite email + hashed access token; unlisted forms still enforce this.

## Tests

`tests/v8-shared-form-builder.test.js` — migration presence, schema policy, CRUD/order, RBAC, publish/unpublish/QR, email-token enforcement, product isolation, mobile CSS/templates, AC HTTP studio + public form.  
Regression: `tests/blessboard-forms-requests.test.js` (V7 schema re-export path).

## Non-goals / deferred

- Applying migration `039` on hosted testing DB (overnight rule 10).
- SH08–SH15 submission review / platform cross-tenant overview.
- Migrating legacy `blessboard.forms` rows into `platform.tenant_forms`.
- SAML / network whitelist access tiers.

## Preserve V7

No V7 branch changes. BlessBoard member forms continue on `blessboard.forms`; shared builder is additive under `platform.*` with a stable `formSchema` re-export.
