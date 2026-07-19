# V4 → V5 migration rollback rehearsal plan

**Date:** 2026-07-19  
**Mode:** Tabletop / planning only — **do not execute** hosted apply, DNS changes, or destructive cleanup from this document  
**Purpose:** Rehearse rollback decisions **before** any hosted `migrate:v4-to-v5:apply`  
**Does not authorize:** apply, shadow, authoritative routing, DB restores, or DROP/TRUNCATE  

**Companions**

| Doc | Role |
|-----|------|
| [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) §5 | Production rollback procedure |
| [`V5_FINAL_MIGRATION_READINESS.md`](../database/V5_FINAL_MIGRATION_READINESS.md) | Rollback documented; no V5→V4 reverse-write; M22 tabletop |
| [`V5_SHADOW_MODE_RUNBOOK.md`](../deployment/V5_SHADOW_MODE_RUNBOOK.md) | Shadow rollback = routing `off` (env-only) |
| [`V4_TO_V5_HOSTED_DRY_RUN_CHECKLIST.md`](./V4_TO_V5_HOSTED_DRY_RUN_CHECKLIST.md) | Dry-run (no target business writes) |
| [`V4_TO_V5_RECONCILIATION_TEMPLATE.md`](./V4_TO_V5_RECONCILIATION_TEMPLATE.md) | Post-apply evidence / UUID checks |

**Standing rules**

- Prefer **routing / traffic rollback** before **data rollback**.  
- **Never** reverse-write V5 rows into V4.  
- **Never** invent destructive cleanup SQL in this plan (no DELETE/TRUNCATE/DROP scripts here).  
- Preserve V5 as a forensic artifact when aborting after apply.  
- Documented **default max window** after authoritative enable: **4 hours** (cutover runbook) — not a guarantee of clean recovery.

---

## Verdict (planning sufficiency)

| Question | Answer |
|----------|--------|
| Is rollback planning sufficient for a **supervised hosted dry-run**? | **YES** — dry-run writes no business rows; rollback rehearsal for dry-run is env/artifact cleanup + confirm source unchanged |
| Is this enough to authorize hosted **apply**? | **NO** — complete tabletop checklist (§ tabletop) + backups + named Rollback owner first |
| Were any rollback commands executed creating this file? | **NO** |

---

## Roles (fill before tabletop)

| Role | Name | ☐ |
|------|------|---|
| Cutover lead | `________________` | ☐ |
| Rollback owner | `________________` | ☐ |
| DB operator | `________________` | ☐ |
| App / Hostinger operator | `________________` | ☐ |
| DNS owner | `________________` | ☐ |
| Comms owner | `________________` | ☐ |

**Rehearsal ID:** `rollback-rehearsal-<UTC>-________________`  
**Change ticket:** `________________`

---

## 1. What rollback means before cutover

**Stage:** Hosted **plan / dry-run** only; routing still `off` (or V5 not customer-facing); apply **not** run.

| Aspect | Meaning |
|--------|---------|
| Data | No migration business writes expected (`written: 0`). Nothing to “un-migrate.” |
| Source (V4) | Must remain unchanged; re-check source counts vs pre-dry-run snapshot. |
| Target (V5) | Spot-check that dry-run did not persist unexpected rows; if it did → **incident**, not routine rollback. |
| App / DNS | No cutover changes assumed; no DNS reverse. |
| Success | Shell secrets unset; artifacts archived; ticket notes “dry-run only; apply not run.” |

**Rehearsal focus:** Confirm operators can distinguish dry-run abort from apply abort; practice evidence capture without touching production traffic.

---

## 2. What rollback means after apply but before routing change

**Stage:** `migrate:v4-to-v5:apply -- --confirm` completed (or partially); `BLESSBOARD_TENANT_ROUTING_MODE` still `off`; customers still on V4.

| Aspect | Meaning |
|--------|---------|
| Customer impact | Usually **low** if V4 remains SoR and V5 is not serving tenant content. |
| Preferred action | **Stop further apply**; leave V4 live; **do not** sync V5→V4. |
| Target data | Migrated rows remain on V5 unless DB operator restores V5 from a **pre-apply** backup/PITR under separate approval. This plan does **not** prescribe row-level DELETE scripts. |
| Source | Confirm V4 unchanged (read-only migrate contract). |
| Success | V4 continues as SoR; V5 preserved or restored per approved DB procedure; incident filed with apply batch IDs. |

**Rehearsal focus:** Decision tree — “leave V5 dirty as artifact” vs “restore V5 from checkpoint/backup” — without inventing ad-hoc DELETE SQL.

---

## 3. What rollback means after shadow mode

**Stage:** V5 has catalogue (from apply and/or prior seed); `BLESSBOARD_TENANT_ROUTING_MODE=shadow`.

| Aspect | Meaning |
|--------|---------|
| Traffic | Shadow does not serve tenant CMS as authoritative; rollback is primarily **env**: set mode to `off` + restart all workers. |
| Databases | Shadow flip itself does not require DB restore (per shadow runbook). Apply-era data on V5 is a separate concern. |
| DNS | Usually unchanged for shadow; DNS reverse only if apex itself was broken. |
| Success | Apex/tenant Hosts behave as foundation / non-tenant; no `blessboard_tenant_route` authoritative events as primary signal. |

**Rehearsal focus:** Timed env flip `shadow` → `off`; verify health; confirm V4 still SoR.

---

## 4. What rollback means after authoritative pilot

**Stage:** `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` enabled for pilot (or broader); **rollback clock** starts at authoritative-enable timestamp (cutover runbook).

| Aspect | Meaning |
|--------|---------|
| Immediate | Set V5 routing to `off`; disable jobs (`BLESSBOARD_JOBS_ENABLED=0`); restart workers. |
| SoR | Restore **V4** deployment as customer-facing system; reverse DNS only where changed; wait for TTL. |
| Data | **No** V5→V4 merge. New V5-only rows / sessions after cutover are **not** automatically recovered onto V4. |
| Window | Default documented window **≤ 4 hours** after authoritative enable; beyond that = **new incident** (divergence risk). Extension only with Cutover lead + Rollback owner written approval. |
| Success | Customers use V4 again; V5 DB preserved as forensic artifact; do not DROP. |

**Rehearsal focus:** Tabletop the first 15 minutes (routing off → V4 app → DNS → comms); explicitly discuss what **cannot** be recovered (V5-only writes).

---

## Stage matrix (summary)

| Stage | Primary rollback lever | DB restore needed? | DNS reverse? | Reverse-write V5→V4? |
|-------|------------------------|--------------------|--------------|----------------------|
| Before cutover (dry-run) | Abort session; cleanup secrets | No (if dry-run clean) | No | No |
| After apply, routing `off` | Stop apply; keep V4 live | Optional V5 PITR only | No | No |
| After shadow | Routing → `off` | No for mode flip | Rare | No |
| After authoritative | Routing → `off` + V4 app + DNS | V4 must be intact; V5 preserve | Yes if flipped | **Never** |

---

## 5. Source database protection

| Rule | ☐ |
|------|---|
| Migrator opens source **read-only**; never grant migrate role write on V4 for this procedure | ☐ |
| Pre-apply source count snapshot stored | ☐ |
| Post-apply / post-dry-run source counts match snapshot | ☐ |
| V4 remains writable for **application** traffic until freeze policy says otherwise (freeze is separate from migrate) | ☐ |
| No “cleanup” of V4 to “match” V5 | ☐ |

**Stop if** source counts change during migrate → treat as incident; do not continue apply.

---

## 6. Target backup requirements

| Requirement | Notes | ☐ |
|-------------|-------|---|
| Pre-apply V5 snapshot / PITR point recorded | Project ID matches intended target | ☐ |
| Post-apply optional snapshot | Useful before shadow/authoritative | ☐ |
| Backup age | Aim for verified backup **within 24h** of window (cutover preconditions) | ☐ |
| Restore drill | Tabletop: who clicks restore, RPO assumptions, who approves | ☐ |
| No DROP of V5 after abort | Preserve forensic DB | ☐ |

This plan does **not** claim a specific RPO/RTO number for Supabase/Hostinger beyond “use provider restore procedures under DB operator.”

---

## 7. Checkpoint usage

Migration tooling uses **local JSON checkpoints** under the output `state/` directory (group/entity progress, `batchId`, resume skips).

| Practice | Guidance |
|----------|----------|
| On **batch_rolled_back** | Loader reports transactional rollback for that batch; checkpoint may record failure — **do not** assume whole estate rolled back |
| `--resume` | Skips groups marked done; use only when continuing a **same** approved apply window with understanding of partial progress |
| After abort | Archive checkpoint + summary JSON with ticket; do not silently delete evidence |
| Dry-run | Checkpoints may exist; still expect `written: 0` for business rows |

**Rehearsal:** Walk a fictional “group N failed, batch rolled back” path: stop, preserve artifacts, decide resume vs abandon vs V5 restore — without writing DELETE SQL.

---

## 8. Migration-created record identification

Without destructive SQL, operators identify migrate-era rows via **evidence**, not ad-hoc mass deletes:

| Signal | Use |
|--------|-----|
| Apply `batchId` in tooling summaries / checkpoints | Correlate run |
| Apply summary `written` counts + reconciliation report | Scope of change |
| Pre-apply vs post-apply target counts | Delta detection |
| UUID sample maps from reconciliation template | Prove mapping, not cleanup |
| Pre-apply V5 PITR | Only approved way to remove large unintended apply sets wholesale |

**Do not** invent `DELETE FROM … WHERE migrated_at` scripts in this document — schema may not expose a uniform migrate stamp for all tables.

---

## 9. Partial-batch failure

| Observation | Action |
|-------------|--------|
| Tooling `batch_rolled_back` / non-zero exit mid-apply | **Stop**; do not start shadow/authoritative |
| Some groups `done`, later group failed | Treat estate as **partially migrated**; reconciliation required |
| Resume (`--resume`) | Only with DB operator + Cutover lead approval; same ticket |
| Prefer forward-fix | If partial state is reconcilable and V4 still SoR, completing apply may be safer than V5 PITR — see §17 |

Record failed `groupId`, `entity`, error message (no secrets) in the evidence template.

---

## 10. Idempotent rerun versus rollback

| Situation | Prefer |
|-----------|--------|
| Apply succeeded; second apply `written≈0`, skips explain rows | **Idempotent proof** — not rollback |
| Dry-run only | Rerun plan/dry-run after fixing conflicts — not data rollback |
| Apply failed mid-flight; batches rolled back; few/no durable writes | Fix cause; **rerun apply** under approval |
| Apply wrote large wrong set on wrong target | **Rollback** via V5 backup/PITR (approved), not mapper weakening |
| Authoritative live with divergence | Routing rollback to V4; **not** “rerun migrate to fix production” without incident process |

**Rule of thumb:** Idempotent rerun fixes **incomplete successful mapping**; rollback fixes **wrong target, wrong window, or customer-facing failure**.

---

## 11. Domain / routing rollback

| Lever | When | Notes |
|-------|------|-------|
| `BLESSBOARD_TENANT_ROUTING_MODE=off` | Always first for shadow/authoritative abort | Restart **all** workers |
| Keep `GETPRO_DATABASE_URL` unset on V5 | Always | Prevent wrong-DB attach |
| DNS reverse | Only hosts changed in inventory | Wait TTL; owner from cutover DNS table |
| Custom domains | Entitlement-gated; may lag | Document separately |
| V4 Hostinger | Redeploy last known-good V4 release | V4 DB remains SoR |

Placeholder verify (do not run from this doc alone):

```bash
# After routing off — expect foundation / non-tenant behavior
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <tenant-host>' https://<apex-host>/
```

---

## 12. Session impact

| Stage | Impact |
|-------|--------|
| Dry-run / apply, routing `off` | V5 sessions (if any) are non-customer; V4 sessions unaffected |
| Shadow | Users still on V4 app paths for real CMS; V5 shadow logging only |
| Authoritative → rollback to V4 | Users may need to **re-authenticate** on V4; V5 cookies (`SESSION_COOKIE_NAME` e.g. `blessboard_org_v5_sid`) do not transfer to V4 |
| Apex transfer cookies | Do not assume cross-stack session continuity after rollback |

**Comms:** Warn pilot users that abort may force re-login; do not promise seamless session restore.

---

## 13. Media impact

| Fact | Rollback implication |
|------|----------------------|
| Metadata-only migrate; blobs often **deferred** | Rolling back routing does not “restore” missing blobs on V4 (V4 still has originals) |
| If blobs were copied into V5 storage | Abort leaves objects in V5 storage; do not bulk-delete without separate media runbook |
| Post-cutover V5 uploads | **Not** copied back to V4 on rollback — **ACCEPTED loss** unless manual export under incident |

Disposition for rehearsal: treat media as **forward-fix or accept loss**, not reverse sync.

---

## 14. Audit evidence

Retain (ticket store, not git):

| Artifact | Required |
|----------|----------|
| Rehearsal ID, roles, UTC times | Yes |
| Stage at abort decision (pre-cutover / post-apply / shadow / authoritative) | Yes |
| Apply `batchId`(s), git SHA | Yes |
| Fingerprints (sanitized) + identity check notes | Yes |
| Source count before/after | Yes |
| Routing mode before/after | Yes |
| DNS changes (if any) + TTL | Yes |
| Decision: leave V5 / restore V5 / idempotent resume | Yes |
| Comms sent | Yes |
| Explicit: no V5→V4 reverse-write performed | Yes |

---

## 15. Approval authority

| Decision | Minimum authority |
|----------|-------------------|
| Abort dry-run | Dry-run lead |
| Abort apply (routing still `off`) | DB operator + Cutover lead |
| Routing `shadow` → `off` | App operator + Cutover lead (Rollback owner informed) |
| Authoritative abort (full rollback) | **Rollback owner** executes; Cutover lead approves |
| V5 PITR / backup restore | DB operator + Cutover lead (+ provider change ticket) |
| Extend >4h post-authoritative window | Cutover lead **and** Rollback owner (written) |
| Invent destructive cleanup SQL | **Not authorized** by this document |

---

## 16. Recovery-time expectations (no invented guarantees)

Speak in **order-of-operations**, not SLA promises:

| Action | Planning expectation (qualitative) |
|--------|--------------------------------------|
| Env routing `off` + restart | Usually **minutes** if panel access is ready |
| Confirm apex/health | Minutes after restart |
| Redeploy last-known V4 app | Depends on Hostinger package restore — rehearse who owns it; **do not** invent a fixed minute count here |
| DNS reverse | Dominated by **TTL** (inventory); can exceed the 4h decision window if TTL was not lowered |
| V5 PITR restore | Provider-dependent; tabletop only — record actual measured time in a future supervised drill |
| Full data reunify V5→V4 | **Out of scope** — not a recovery path |

Operators must pre-stage: panel access, V4 package id, DNS inventory, comms templates — so time is not lost on “who has the password.”

---

## 17. Conditions where rollback is unsafe and forward-fix is preferable

Prefer **forward-fix** (complete migrate, fix forward, keep V4 offline only if already cut over carefully) when:

| Condition | Why rollback is unsafe / worse |
|-----------|--------------------------------|
| Authoritative live **beyond** agreed window with new V5-only members, giving, attendance, forms | V4 missing those writes; routing back loses work |
| DNS TTL long and partial propagation already mixed V4/V5 | Oscillating DNS increases split-brain |
| V4 backup/freeze incomplete or V4 app package unknown | Cannot restore SoR confidently |
| Partial apply is small, conflicts understood, V4 still SoR | Finishing apply + reconcile beats thrashing V5 restores |
| Media blobs already cut over to V5-only storage with V4 copies deleted | Rolling traffic to V4 yields 404s — fix forward or restore blobs first |
| Identity / wrong-DB scare already ruled out; only product bugs remain | App hotfix forward may be safer than cutover abort |

Prefer **rollback** when:

| Condition | Why |
|-----------|-----|
| Wrong target project / identity mismatch discovered | Stop immediately; preserve evidence |
| Authoritative pilot failing auth/routing with V4 healthy | Traffic back to V4 |
| Inside 4h window, little V5-only write volume, V4 intact | Classic abort |
| Security incident on V5 stack | Isolate V5; restore V4 |

---

## Tabletop rehearsal checklist

**Goal:** Walk the decision tree aloud; no production changes.

| # | Step | ☐ |
|---|------|---|
| T01 | Fill roles and rehearsal ID | ☐ |
| T02 | State current real stage today (expect: pre-apply / dry-run only) | ☐ |
| T03 | Role-play: dry-run abort — list actions in order | ☐ |
| T04 | Role-play: apply success, routing `off`, discover wrong mapping — choose leave-V5 vs PITR | ☐ |
| T05 | Role-play: partial-batch failure — resume vs stop vs restore | ☐ |
| T06 | Role-play: shadow problem — env `off`, verify, no DB restore | ☐ |
| T07 | Role-play: authoritative abort inside 4h — routing, V4 app, DNS, comms | ☐ |
| T08 | Role-play: authoritative abort **after** 4h with V5-only writes — incident + forward-fix vs unsafe rollback | ☐ |
| T09 | Confirm source protection rules and “no reverse-write” | ☐ |
| T10 | Confirm no one proposed destructive cleanup SQL | ☐ |
| T11 | Name recovery-time bottlenecks (TTL, panel access, V4 package) without inventing SLAs | ☐ |
| T12 | Capture evidence template below; get signatures | ☐ |

**Pass criteria for tabletop:** Rollback owner can narrate §§1–4 without prompting; Cutover lead confirms authority matrix §15; DB operator confirms backup/PITR ownership §6.

---

## Evidence template (fill during tabletop or real abort)

```text
Rehearsal / abort ID: ________________
Ticket: ________________
UTC decision: ________________
Stage: [ ] pre-cutover dry-run  [ ] post-apply routing off  [ ] shadow  [ ] authoritative
Git SHA: ________________
Apply batchId(s): ________________

Source fingerprint (sanitized): ________________
Target fingerprint (sanitized): ________________
Identity check: [ ] PASS  [ ] FAIL

Source counts unchanged: [ ] yes  [ ] no
Routing before → after: ________________ → ________________
DNS reversed?: [ ] yes  [ ] no  [ ] n/a
V5 disposition: [ ] preserve artifact  [ ] PITR restore (ticket ____)  [ ] n/a
V4 SoR confirmed: [ ] yes  [ ] no
Sessions: users warned re-login?: [ ] yes  [ ] n/a
Media: blob risk acknowledged?: [ ] yes  [ ] n/a
V5→V4 reverse-write performed?: [ ] NO (required)

Decision rationale (no secrets):
________________

Forward-fix instead?: [ ] yes  [ ] no — why: ________________

Approvals:
  Rollback owner: ____________  UTC: ________
  Cutover lead:   ____________  UTC: ________
  DB operator:    ____________  UTC: ________
```

---

## Relation to supervised hosted dry-run

| Item | Status |
|------|--------|
| Dry-run needs this plan? | **Yes** — operators should know abort means “no un-migrate,” only evidence + source verify |
| Dry-run blocked on full authoritative rollback drill? | **No** |
| Apply blocked until tabletop T01–T12 signed? | **Yes** (aligns with readiness M22) |

---

## Conclusion

Rollback planning is **sufficient for a supervised hosted dry-run**: at that stage rollback is non-destructive (session cleanup, source verification, artifact archive).  

It is **not** a substitute for a signed tabletop before apply, nor for the cutover runbook’s live authoritative abort procedure. No destructive cleanup SQL is provided or authorized here.
