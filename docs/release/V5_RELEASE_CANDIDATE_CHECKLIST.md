# BlessBoard V5 — Release-candidate branch checklist

**Date:** 2026-07-19  
**Mode:** Operator checklist only — **this document does not create branches or tags**  
**Companion:** [`V5_RELEASE_VERSIONING.md`](./V5_RELEASE_VERSIONING.md) · [`CHANGELOG_V5.md`](../../CHANGELOG_V5.md) · [`V5_RELEASE_BLOCKERS.md`](./V5_RELEASE_BLOCKERS.md) · [`THREE_PACKAGE_REGRESSION_REPORT.md`](./THREE_PACKAGE_REGRESSION_REPORT.md)

**Creating this file does not authorize** Hostinger flips, hosted migrate apply, or GitHub Releases.

---

## Naming conventions (aligned to this repo)

Existing branches use short product lines: `main`, `V4`, `V5`, `v2`, `v3` — **not** a `release/` prefix.

| Artifact | Convention | Example |
|----------|------------|---------|
| Release identifier (docs / tickets) | `blessboard-v5.0.0-rc.N` | `blessboard-v5.0.0-rc.1` ([versioning](./V5_RELEASE_VERSIONING.md)) |
| RC git branch (when Leadership asks) | `V5-rc.N` (same capital-`V` family as `V5`) | `V5-rc.1` |
| Annotated tag (later, approved only) | Same as identifier | `blessboard-v5.0.0-rc.1` |
| Avoid as primary | `release/v5-rc.1`, bare `V5-rc.1` as a **tag** | Not used in current remotes; optional only if policy changes |

Always record the **git SHA** alongside the RC name.

---

## Gate table (fill at RC cut)

Mark each row **Pass** / **Fail** / **Waived** (waiver needs signature + ticket ID). **All required rows must Pass or Waived before creating `V5-rc.N`.**

| # | Check | Required for RC branch? | How to verify | Evidence | Status | Owner | ☐ |
|---|-------|-------------------------|---------------|----------|--------|-------|---|
| 1 | Working tree clean | **Yes** | `git status` — no modified/untracked that belong in the RC | Status paste (no secrets) | | | ☐ |
| 2 | Latest `V5` pushed | **Yes** | Local `V5` not behind/ahead of `origin/V5` unexpectedly; RC cut from agreed SHA | `git status -sb`; `git fetch` + rev-list | | | ☐ |
| 3 | Regression green | **Yes** | `npm run test:blessboard:v5:regression` (or then-current suite) exit 0 | Suite summary counts | | | ☐ |
| 4 | Security audits reviewed | **Yes** | Session/CSRF/authz/media/logging docs reviewed; open CRITICAL items waived or closed | Audit doc IDs + reviewer | | | ☐ |
| 5 | Accessibility reviewed | **Yes** | Structure/a11y audits reviewed; manual browser gaps accepted or filed | Audit + M05 note | | | ☐ |
| 6 | Package entitlements verified | **Yes** | Foundation/Growth/Network matrix + `test:platform:entitlements` green | Suite + readiness docs | | | ☐ |
| 7 | Demo tenant ready | **Yes for demo RC**; Waive only with product signature | Personas + published Home/About + samples — blockers **B02–B04** | Demo readiness | | | ☐ |
| 8 | Migration tools rehearsed | **Yes** | Local `migrate:v4-to-v5:rehearsal` PASS (or documented date) | Rehearsal report path | | | ☐ |
| 9 | Hosted dry run approved | **Yes for production-bound RC**; may Waive for **code-only** `rc.1` with Leadership note | Hosted plan/dry-run checklist signed — **B06** | Dry-run ticket | | | ☐ |
| 10 | Shadow mode evidence approved | **Yes for routing-facing RC**; Waive for code-only freeze if mode stays `off` | Shadow runbook evidence pack + optional `verify:v5:shadow-log` — **B01** | Evidence pack ID | | | ☐ |
| 11 | Rollback ready | **Yes** | Rollback rehearsal / cutover §5 owners named; mode rollback = `off`/`shadow` + clear allow-list | Named Rollback owner | | | ☐ |
| 12 | Environment reference approved | **Yes** | [`V5_ENVIRONMENT_VARIABLE_REFERENCE.md`](../deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md) reviewed for this SHA | Reviewer sign-off | | | ☐ |
| 13 | Secrets excluded | **Yes** | No `.env`, URLs with credentials, cookies, or PII in commits / changelog / evidence in git | Review `git diff` / staged paths | | | ☐ |
| 14 | Changelog complete | **Yes** | [`CHANGELOG_V5.md`](../../CHANGELOG_V5.md) matches claimed RC ID | Changelog section | | | ☐ |
| 15 | Release blockers accepted | **Yes** | [`V5_RELEASE_BLOCKERS.md`](./V5_RELEASE_BLOCKERS.md) — each CRITICAL for this milestone Pass/Waived | Blocker table snapshot | | | ☐ |
| 16 | Manual approvals recorded | **Yes** | Cutover lead + App ops (+ Leadership if routing/prod) signed below | Signatures | | | ☐ |

### Approval signatures

| Role | Name | Decision | UTC | Ticket |
|------|------|----------|-----|--------|
| Cutover lead | | ☐ go · ☐ no-go | | |
| App / deploy operator | | ☐ go · ☐ no-go | | |
| QA | | ☐ go · ☐ no-go | | |
| Leadership (if routing or prod) | | ☐ go · ☐ n/a | | |

---

## Command templates (do **not** run from this doc alone)

Placeholders only. No secrets.

### Check branch

```bash
git fetch origin
git branch --show-current
# expect: V5   (or already on V5-rc.N after cut)
git rev-parse --short HEAD
git log -1 --oneline
```

### Check remote divergence

```bash
git fetch origin
git status -sb
# healthy before RC cut from V5:
#   ## V5...origin/V5
git rev-list --left-right --count origin/V5...HEAD
# 0  0  → in sync with origin/V5
```

### Working tree clean

```bash
git status
git diff --stat
git diff --cached --stat
# Must be empty of intentional RC content, or commit first on V5 then cut RC
```

### Run regression

```bash
npm run test:blessboard:v5:regression
# optional fast gate while iterating:
npm run test:blessboard:v5:regression:fast
# package entitlements (if not already inside regression):
npm run test:platform:entitlements
```

### Create an RC branch (only after gates Pass)

```bash
git fetch origin
git checkout V5
git pull --ff-only origin V5
# confirm clean + SHA recorded in ticket
git checkout -b V5-rc.1
git push -u origin V5-rc.1
# Do NOT set Hostinger env from this step
```

### Create an annotated tag later (Leadership-approved only)

```bash
# On the exact RC SHA (V5-rc.1 tip or merge commit)
git tag -a blessboard-v5.0.0-rc.1 -m "BlessBoard V5 release candidate 1 (SHA …)"
git push origin blessboard-v5.0.0-rc.1
# Still not a GitHub Release unless separately approved
```

### Revert an RC commit (prefer revert over history rewrite)

```bash
git checkout V5-rc.1
git pull --ff-only origin V5-rc.1
git revert <SHA> --no-edit
# or revert a merge with -m 1 when applicable
git push origin V5-rc.1
# Never force-push shared RC without explicit Leadership order
```

### Rollback routing / allow-list (deploy ops — not git)

```bash
# Hostinger — all workers — after approved incident:
# BLESSBOARD_TENANT_ROUTING_MODE=off
# BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=
# restart all workers
```

---

## Mapping to known blockers

| Checklist # | Typical blocker IDs | Notes |
|-------------|---------------------|-------|
| 7 Demo | B02–B04, H07 | Blocks demo-facing RC claims |
| 9 Hosted dry-run | B06, H01–H06 | Required before production-bound RC |
| 10 Shadow evidence | B01, M03 | Required before any routing-facing RC |
| 11 Rollback | B10, cutover §5 | Named owner |
| 15 Blockers | B01–B12, C01–C04 | Accept = Pass or signed Waive for **this** milestone only |

A **code-freeze RC** (`blessboard-v5.0.0-rc.1` as documentation/code pointer) may Waive 7/9/10 **only** if Leadership records that Hostinger stays `routing=off` and no customer pilot is claimed.

---

## Snapshot readiness (documentation assessment)

Assessed when this checklist was authored (working tree / gates — **not** an authorization to cut):

| Question | Answer |
|----------|--------|
| Is the repository **ready to create** `V5-rc.1` right now? | **No** |
| Why | Working tree not clean (ongoing V5 changes); CRITICAL release blockers open (shadow evidence B01, demo data B02–B04, authoritative smoke B05, hosted migrate B06, approvals B09–B10, plan-key B12); hosted dry-run and shadow evidence not approved as Pass |
| What exists | Changelog + versioning for `blessboard-v5.0.0-rc.1`; local regression historically strong; allow-list implemented but unused in Hostinger |
| Next | Clean/commit on `V5`, push, re-run regression, close or explicitly Waive blockers for a **code-only** RC, then cut `V5-rc.1` under signed § approvals |

---

## Suggested documentation commit message

```
docs(release): add V5 release-candidate branch checklist

Define V5-rc.N naming, sixteen RC gates, and command templates
without creating branches or tags; snapshot not ready to cut.
```
