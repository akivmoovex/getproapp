# BlessBoard V5 — Demo credentials handling plan

**Date:** 2026-07-19  
**Mode:** Process / documentation only — **does not create users or credentials**  
**Companions:** [`V5_DEMO_TENANT_REMEDIATION_PLAN.md`](../testing/V5_DEMO_TENANT_REMEDIATION_PLAN.md) · [`V5_DEMO_MINIMUM_DATASET.md`](../testing/V5_DEMO_MINIMUM_DATASET.md) · [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) · [`V5_LOGGING_DATA_EXPOSURE_AUDIT.md`](./V5_LOGGING_DATA_EXPOSURE_AUDIT.md)

**Scope personas**

| Alias | Role | Primary surfaces |
|-------|------|------------------|
| **MEM** | Active member + primary membership on `hq` | Tenant `/member*` |
| **BA** | `branch_admin` on `hq` | Tenant `/branch-admin*` |
| **HQ** | `church_hq_admin` | Tenant `/hq*` |
| **PA** | `platform_admin` | Apex `/admin*` |

**Hard rules**

- **No passwords in Git.**
- **No passwords in Markdown** (including this file — use placeholders only).
- **No shared credentials across roles** (one mailbox + one password per persona).
- **No real personal email** unless a named owner manually approves in writing.
- **PA credentials** get the strictest handling (fewer holders, shorter share window, fastest revoke).
- Do **not** disable MFA, CSRF, throttling, cookie hardening, or other controls if present.
- Do **not** change authentication code as part of following this plan.

Product constraints (informational): V5 user create requires password length **10–200**; apex login uses hashed throttle keys (`email|ip`) and returns controlled 429 — treat throttling as a feature, not a bug.

---

## 1. Credential generation

| Step | Practice |
|------|----------|
| Who generates | **Credential owner** (Ops lead or Security-designated operator) — not each tester inventing their own PA password in chat |
| How | Generate with a password manager or OS/crypto CSPRNG; paste into manager vault only |
| CLI | Prefer `printf '%s' '<PASSWORD>' \| npm run blessboard:user:create -- … --password-stdin` so the password is not in shell history as a `--password=` flag when avoidable |
| Emails | Use disposable / org-owned aliases, e.g. pattern `bb.v5.demo.<role>.<yyyyww>@<approved-domain>` — fictional local-parts on `example.test` are fine for local-only; hosted needs deliverable or known-login addresses approved by Ops |
| Display names | Neutral: `Demo Member`, `Demo Branch Admin`, `Demo HQ Admin`, `Demo Platform Admin` |
| One identity per role | MEM ≠ BA ≠ HQ ≠ PA (separate users even if the same human operates all windows) |

Never generate credentials into a ticket, PR, commit message, or Cursor chat log intended for retention.

---

## 2. Password strength

| Requirement | Minimum for demo accounts |
|-------------|---------------------------|
| Length | ≥ **16** characters preferred (product floor is 10 — do not use the floor for PA) |
| Entropy | Manager-generated random; no dictionary phrases alone for PA |
| Uniqueness | Distinct password per persona; never reuse production or personal passwords |
| Forbidden patterns | Org name + year, `Password1!`, shared “blessboard demo” strings, keyboard walks |
| PA bar | ≥ **20** characters random; treat as production-adjacent privilege |

Do not document example password strings anywhere in the repo.

---

## 3. Temporary password handling

| Phase | Rule |
|-------|------|
| At creation | Password exists only in: (1) generator → vault entry, (2) stdin to CLI momentarily |
| First login | Owner verifies login once in a private window; then stores “verified D0” note in vault metadata (no password in the note) |
| Handoff | Prefer vault share / sealed channel (see §7); temporary passwords are still full-strength secrets, not weak one-time codes unless product later adds forced change |
| Forced change | If product later supports must-change-on-first-login, enable it for demos; until then, rotate after the demo window (§6) |
| Shell history | Avoid `--password=`; prefer stdin; clear terminal scrollback after provision if password was echoed |

---

## 4. Password storage outside source control

| Allowed | Disallowed |
|---------|------------|
| Team password manager vault (1Password / Bitwarden / approved equivalent) with restricted collection “BlessBoard V5 Demo — Testing” | Git, gist, Google Doc in open Drive, Slack channel history, Markdown, `.env` committed to repo, screenshots of password fields |
| Vault item fields: email, role, org/church keys, host URLs, **password**, owner, expiry date | Spreadsheets emailed as attachments with plaintext passwords |
| Break-glass sealed envelope only if vault unavailable — two-person custody | Sticky notes / shared whiteboard |

Local `.env` must **never** hold demo user passwords. Session secrets and `DATABASE_URL` are separate secrets with their own handling.

---

## 5. Rotation

| Trigger | Action |
|---------|--------|
| Scheduled | Rotate all four demo passwords at least every **30 days** while accounts remain active |
| After shared demo day | Rotate PA same day; rotate BA/HQ/MEM within **72 hours** |
| After suspected exposure | Rotate **immediately** (chat paste, screenshot, support ticket, public gist) |
| After staff offboarding | Rotate any credential that person could access |
| How | Generate new password in vault → use product password-change if available → else create replacement user + new role assign and retire old (see §8) — **do not** invent SQL |

Document rotation date in vault metadata only.

---

## 6. Expiry

| Account class | Active window | After window |
|---------------|---------------|--------------|
| MEM / BA / HQ | Demo campaign + **14 days** | Rotate password; disable login if product supports status≠active (else retire account via approved ops) |
| PA | Demo campaign + **7 days** maximum preferred | Rotate same day as campaign end; minimize concurrent holders |
| Smoke-only disposable | Single day | Rotate or revoke before EOD |

Calendar: vault “Expiry” field + Ops calendar reminder. Expiry is an **ops process**; do not rely on undocumented auto-expiry unless product adds it.

---

## 7. Sharing with testers

| Role | Who may receive | How |
|------|-----------------|-----|
| MEM | QA / demo facilitators | Vault share to named users; or ephemeral share link with short TTL |
| BA / HQ | Same + limited Ops | Same; separate shares per role |
| PA | Ops lead + at most one backup; **not** the full QA room | Direct vault ACL; never broadcast in group chat |

Sharing checklist:

1. Confirm tester needs that role today.  
2. Share vault item (not password in message body).  
3. State hosts: Apex vs `diagnostic.blessboard.org`.  
4. State: testing only; no production; no MFA bypass.  
5. Record share time + recipients in vault notes (names, not secrets).  
6. Revoke vault share when the tester finishes (§8).

Never post credentials in GitHub issues/PRs or public Slack.

---

## 8. Revocation

| Situation | Steps |
|-----------|-------|
| End of tester access | Remove vault share; if password was copied out-of-band, **rotate** |
| Suspected compromise | Rotate password; invalidate sessions by logging out everywhere possible; for PA, also review `/admin` audit if available |
| Wrong person still has access | Rotate first, communicate second |
| Account no longer needed | Prefer mark user inactive via approved UI/CLI when available; **TOOLING GAP** today for deactivate CLI — escalate to Ops/DBA under change control; do not invent DELETE SQL |
| Role grant mistaken | No revoke CLI today — do not assign dual high roles “for convenience”; escalate mistaken `platform_admin` |

Revocation of vault access ≠ revocation of password knowledge — always rotate if the secret may have left the vault.

---

## 9. Login-attempt throttling considerations

| Topic | Guidance |
|-------|----------|
| Expect 429 | Repeated failed logins (wrong password, parallel scripts) can throttle by hashed `email|ip` |
| Demo hygiene | Use correct vault password; do not “spray” guesses; stagger persona logins if many failures occur |
| Shared NATs | Multiple testers behind one IP may amplify throttle — coordinate; wait for cool-down rather than asking to disable limiter |
| Automation | Smoke is **manual**; do not build credential-stuffing scripts against hosted login |
| Logging | Throttle keys are hashed and must not be logged as plaintext email+IP ([logging audit](./V5_LOGGING_DATA_EXPOSURE_AUDIT.md)) |

**Never** propose turning off login throttling, CSRF, or cookie flags for demos.

---

## 10. Post-demo cleanup

| Order | Action |
|-------|--------|
| 1 | Collect evidence pack; redact before storage (§11) |
| 2 | All personas logout (smoke T20) |
| 3 | Revoke vault shares for temporary testers |
| 4 | Rotate PA password (same day) |
| 5 | Rotate BA / HQ / MEM within 72 hours |
| 6 | Soft-archive disposable media; leave CMS labeled `[Demo]` or unpublish if campaign ended |
| 7 | Update readiness/remediation status notes (no secrets) |
| 8 | Confirm `BLESSBOARD_TENANT_ROUTING_MODE` remains at approved value (do not flip here) |

---

## 11. Screenshot and log redaction

| Artifact | Redact |
|----------|--------|
| Screenshots | Password fields, filled password dots if recoverable, email if policy requires, raw `tr=` transfer if treated as secret, cookies, Authorization headers |
| HAR / network | Cookie values, CSRF tokens if stored long-term, `Set-Cookie`, request bodies with passwords |
| App logs | Already should omit passwords; still scrub any accidental paste before sharing |
| Vault | Do not screenshot vault unlock or password reveal |
| Evidence pack | Prefer “login succeeded” + host + role alias over capturing the email address when possible |

Store evidence in an access-controlled folder; do not commit evidence packs with live cookies to Git.

---

## 12. Separation between testing and production accounts

| Dimension | Testing (this plan) | Production |
|-----------|---------------------|------------|
| Environment | `testing` / `blessboard-org-v5` demo tenant | Future production orgs — **different** emails and passwords |
| Identity DB | `blessboard-platform-v5` testing | Separate identity / deployment when production exists |
| Email domain | Approved demo aliases only | Real staff identities under HR/IT policy |
| PA | Demo PA ≠ production superuser | Never reuse demo PA password or email |
| Data labels | `[Demo]` content | Customer data |
| Routing | Follow shadow/authoritative runbooks | Separate approvals |

If a human must operate both, use separate browser profiles and separate vault items. Never sync demo passwords into production vault items.

---

## Morning execution checklist

Use on the day of supervised demo / smoke (after catalogue readiness). **Do not** invent credentials into this checklist.

### Pre-flight (owner)

| # | Check | ☐ |
|---|-------|---|
| M1 | Vault collection “BlessBoard V5 Demo — Testing” exists and ACL is least-privilege | ☐ |
| M2 | Four distinct vault items: MEM, BA, HQ, PA (emails + passwords stored **only** there) | ☐ |
| M3 | No demo passwords in Git status / uncommitted files / Markdown | ☐ |
| M4 | `DATABASE_IDENTITY_EXPECTED` / hosts documented in vault notes (keys only) | ☐ |
| M5 | PA item: expiry ≤ 7 days from today; owner + one backup named | ☐ |
| M6 | Password strength meets §2 (especially PA) | ☐ |
| M7 | MFA/security controls left enabled if present | ☐ |
| M8 | Testers list approved; vault shares not yet opened until needed | ☐ |

### Create / verify (only if accounts missing — under remediation confirmation)

| # | Check | ☐ |
|---|-------|---|
| M9 | Hosted-write confirmation recorded for user create / role assign | ☐ |
| M10 | Create/verify MEM, BA, HQ, PA via approved CLI/UI; passwords via stdin / vault only | ☐ |
| M11 | Private-window login proof per role (no screenshot of password) | ☐ |
| M12 | Confirm roles land on correct portals (`/member`, `/branch-admin`, `/hq`, `/admin`) | ☐ |

### Share & run

| # | Check | ☐ |
|---|-------|---|
| M13 | Open vault shares only to today’s testers; PA share minimal | ☐ |
| M14 | Brief testers: hosts, no password paste in chat, throttle cool-down, logout after | ☐ |
| M15 | Run smoke / demo; use incognito per persona | ☐ |
| M16 | Evidence redacted per §11 | ☐ |

### Close-out (same day)

| # | Check | ☐ |
|---|-------|---|
| M17 | Logout all personas | ☐ |
| M18 | Revoke temporary vault shares | ☐ |
| M19 | Rotate PA password; schedule BA/HQ/MEM rotation | ☐ |
| M20 | Note next expiry in vault + Ops calendar | ☐ |

---

## Plan readiness verdict

| Question | Answer |
|----------|--------|
| Is this plan complete enough for **supervised** demo credential handling? | **YES** |
| Does it create or store any real passwords? | **NO** |
| Does it require auth code changes? | **NO** |
| Are tooling gaps acknowledged? | **YES** — no deactivate/revoke CLI; inactive status may need escalation |
| Ready for unsupervised mass sharing? | **NO** — PA and hosted writes remain supervised |

**Bottom line:** Ready for **supervised use** with a password manager, morning checklist, and remediation confirmation gates. Not a substitute for product MFA/password-reset features if those are added later — extend this plan rather than weakening controls.
