# V8 Development Policy

**Status:** Active  
**Branch:** `V8`  
**V7 baseline SHA:** `03a89106e2fef8a93e31015d160acf73ab59fd40`  
**Recorded:** 2026-09-20

## Purpose

V8 is the development line for GetPro **V2.0** product work (BlessBoard + ActiveClinic). It starts from the verified V7 baseline and evolves independently of production V7 traffic.

## Rules

1. **All V2 code goes to V8.** Features, fixes, and docs for the V2.0 line land on `V8` (and PRs targeting `V8`). Do not land V2 work on `V7`, `main`, or production-only branches.
2. **V7 and production remain untouched.** Do not merge V8 into V7, force-push V7, or change production V7 release process as a side effect of V8 work.
3. **Prefer shared platform code** for cross-product functionality (auth, identity, sessions, invitations, website engine, tenancy). Product-specific UI and domain logic stay in BlessBoard / ActiveClinic scopes.
4. **All database changes must be V7-compatible.** Migrations and schema edits must not break V7 runtime or require V7 to adopt V8-only shape. Prefer additive, reversible changes; no destructive production-facing cuts without an explicit, separate V7 plan.
5. **Every new feature requires automated tests.** No V8 feature merges without tests that cover the new behavior (unit and/or integration as appropriate to the area).
6. **V8 deploys separately to neuniversity.org.** V8 hosted validation and releases use the neuniversity.org deployment path only.
7. **V7 continues on pronline.org.** Existing V7 hosted environments on pronline.org stay on the V7 line.
8. **No automatic migrations or deployments to production.** V8 work must not auto-migrate production databases or auto-deploy to production. Production changes require explicit operator approval and a documented release procedure.

## Branch model (summary)

| Line | Branch | Hosted surface | Role |
|------|--------|----------------|------|
| V7 | `V7` | pronline.org | Current production / freeze baseline |
| V8 | `V8` | neuniversity.org | V2.0 development |

## Out of scope for this policy

This document does not authorize product feature implementation, schema rollout, or environment provisioning by itself. Those require separate V8 prompts and reviews.
