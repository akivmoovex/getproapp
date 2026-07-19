# BlessBoard V5 — Release versioning

**Date:** 2026-07-19  
**Mode:** Versioning policy documentation only — **no Git tag, no GitHub Release, no `package.json` bump**  
**Companions:** [`CHANGELOG_V5.md`](../../CHANGELOG_V5.md) · [`V5_RELEASE_BLOCKERS.md`](./V5_RELEASE_BLOCKERS.md) · [`THREE_PACKAGE_REGRESSION_REPORT.md`](./THREE_PACKAGE_REGRESSION_REPORT.md) · [`BLESSBOARD_V5_OVERNIGHT_HANDOVER.md`](../handover/BLESSBOARD_V5_OVERNIGHT_HANDOVER.md)

---

## Recommended version identifier

| Field | Value |
|-------|--------|
| **Recommended ID** | **`blessboard-v5.0.0-rc.1`** |
| **SemVer sense** | `5.0.0` major = BlessBoard V5 platform foundation; `rc.1` = release candidate (pilot/cutover gates open) |
| **Git tag** | **Do not create** until Leadership signs a tag policy + blocker close for that milestone |
| **GitHub Release** | **Do not create** from this document |
| **`package.json` `version`** | Leave **`1.0.0`** |

### Why not bump `package.json`

| Fact | Implication |
|------|-------------|
| Repo `name` is `getpro`; `version` is `1.0.0` | Shared monorepo / GetPro placeholder (see root `RELEASE_NOTES.md`) |
| No approved BlessBoard-only npm version policy found | Changing `1.0.0` would conflate GetPro marketplace versioning with BlessBoard V5 |
| Operators already key on **git SHA / branch `V5` / deployment code** | `blessboard-org-v5` + identity key are runtime SoT |

Use **`blessboard-v5.0.0-rc.1`** in changelogs, change tickets, and evidence packs. Record the **git SHA** of the build that was deployed.

### Suggested future identifiers (not created here)

| Milestone | Identifier | Gate |
|-----------|------------|------|
| After live shadow evidence + demo smoke (still non-prod) | `blessboard-v5.0.0-rc.2` | B01–B05 closing |
| Authoritative pilot signed | `blessboard-v5.0.0-rc.3` or `-pilot.1` | B09 + allow-list + smoke |
| First production estate cutover | `blessboard-v5.0.0` | B06–B12 / H01–H06 closed |
| Plan-key vocabulary cutover | `blessboard-v5.1.0` (or patch if same window) | C01–C04 |

If product later approves an npm package rename or scoped version, document it here **before** editing `package.json`.

---

## Branch / history context

| Item | Value |
|------|--------|
| Branch | `V5` |
| Approx. commits since diverge from `main` | ~141 (merge-base `f0ec66e` … HEAD) |
| Early history | 2026-04 church/V5 foundation work |
| Recent GUI wave | Multiple *New screens implementation* commits (2026-07-18–19) |
| Hardening / Network / migration docs | Substantial working-tree + later commits; treat changelog as **product state**, not only last SHA |

Always cite **exact SHA** in deploy tickets; do not rely on message text alone (“New screens implementation” is non-unique).

---

## What this RC claims vs does not claim

### Claims (`blessboard-v5.0.0-rc.1`)

- Local V5 foundation code paths for apex, tenant shells, packages, entitlements, media, authz, routing modes
- Documented ops runbooks for shadow, authoritative prerequisites, cutover, migration order
- Pilot host allow-list **implemented** (env); default remains non-authoritative
- Three-package local regression evidence (see regression report; re-run before ship)

### Does **not** claim

- Production cutover complete
- Live shadow / authoritative evidence packed
- Hosted V4→V5 apply done
- Plan-key rename shipped
- Network external services (mailboxes, API, webhooks, DNS automation) live

---

## Migration requirements (version coupling)

| Step | Required for |
|------|----------------|
| `db:migrate` / bootstrap + identity on V5 DB | Any V5 deploy |
| Identity match `DATABASE_IDENTITY_EXPECTED` | All write CLIs / migrate apply |
| V4→V5 dry-run → apply → reconcile | Production estate cutover (`v5.0.0`) |
| Plan-key insert+repoint + app same-release | Vocabulary cutover (`v5.1.0` candidate) |
| Media blob strategy | Production if media URLs must resolve |

Schema migrations are **checksum-locked**; do not hand-edit applied SQL. Rehearse on disposable DB first.

---

## Environment requirements (by milestone)

### All V5 deploys

- Node ≥ 20  
- Postgres foundation URL only  
- `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`  
- `DEPLOYMENT_ENV=testing` until promote approved  
- `SESSION_SECRET` ≥ 32 (production)  
- `GETPRO_DATABASE_URL` unset  
- `BLESSBOARD_JOBS_ENABLED=0` in foundation  

### Shadow (`rc.1` ops optional)

- `BLESSBOARD_TENANT_ROUTING_MODE=shadow`  
- Manual runbook + evidence validator on redacted logs  

### Authoritative pilot (later RC)

- Mode `authoritative`  
- `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=<exact pilot host>` (not empty; not accidental `*` without approval)  
- Shadow evidence + demo personas + signed B09  

### Production cutover (`v5.0.0`)

- Backups, freeze, hosted migrate, DNS, monitoring window per cutover runbook  
- Explicit allow-list `*` only with signed estate decision  

---

## Backward-compatibility notes

| Surface | Compatibility |
|---------|----------------|
| V4 Hostinger / legacy DB | Remains until cutover; do not dual-write |
| Public package names | Foundation/Growth/Network via aliases today |
| Platform `plan_key` | Still `free`/`growth`/`professional`/`partner` until Phase B |
| Sessions | Host-only; apex≠tenant cookie jar |
| Routing | Default `off` — safe for apex-only V5 foundation |
| Custom domains | Registry OK; live CMS needs authoritative + allow-list + TLS |

Breaking changes vs V4 church app: new schemas, new auth transfer, no `public.tenants` session model on V5.

---

## Deferred features (versioning impact)

Do not advertise as shipped in `rc.1`:

- Forgot password; waiting-verification member session  
- Dedicated prayer route; BA monthly reports; departments/duty  
- Scheduled broadcasts/reports jobs  
- PA create-organization GUI  
- DNS/SSL automation; mailbox SaaS; public API; webhooks  
- Plan-key rename; media blob migrate  

Track in blockers / Network blocked-features docs; promote version only when product marks READY.

---

## External-service dependencies

| Dependency | Role | RC note |
|------------|------|---------|
| Hostinger | App host, TLS, env | Manual flips only |
| Postgres / Supabase | V5 DB | Identity-gated |
| Object storage (e.g. Supabase storage) | Media blobs | Backup/versioning ops-owned |
| Registrar / DNS | Custom domains Model A | Assisted; not automated in app |
| Mailbox / API / webhook vendors | Network commercial | Not required for `rc.1` demo of implemented HQ Network screens |
| Payment processors | Giving checkout | Not in V5 |

---

## Release artifact checklist (when tagging is later approved)

1. [`CHANGELOG_V5.md`](../../CHANGELOG_V5.md) section for the identifier  
2. Git SHA + `npm run test:blessboard:v5:regression` (or then-current suite) green  
3. Blocker IDs closed or waived with signatures  
4. Env + migration evidence paths (no secrets in git)  
5. Explicit decision on `package.json` (still leave alone unless policy updated)  
6. Create annotated tag **only** after Leadership approval — not from this file alone  

---

## Suggested commit message

```
docs(release): add BlessBoard V5 RC changelog and versioning guide

Record blessboard-v5.0.0-rc.1 without tagging or bumping package.json;
summarize foundation through deployment tooling and known blockers.
```
