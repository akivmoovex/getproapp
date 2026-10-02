# ActiveClinic V2.03 — Release Freeze

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_RELEASE_FREEZE` |
| **Date** | 2026-09-27 |
| **Companion handoff** | [`V2_03_QA_RELEASE_HANDOFF.md`](./V2_03_QA_RELEASE_HANDOFF.md) |

---

## Frozen application candidate

| Item | Value |
|------|--------|
| Version | 2.03 |
| Branch | `V10` |
| **Application candidate SHA** | `b8c18c3ded9892aa318ae6e029600aa34ff4941b` |
| Hosted application SHA (pronline AC/BB) | `b8c18c3ded98` |
| Testing deployment | `moovex-platform-testing` |
| Environment | `testing` |
| Testing DB identity | `moovex-platform-v7` |
| Testing DB environment | `testing` |
| Migration ceiling (ActiveClinic testing) | **042** |
| Final gate verdict | `V2_03_FINAL_RELEASE_GATE_PASS` |
| Production app | **Untouched** |
| Production DB | **Untouched** |
| Production promotion | **NOT authorized** by this freeze |

---

## Freeze rule

The ActiveClinic V2.03 **application candidate is FROZEN** at:

```text
b8c18c3ded9892aa318ae6e029600aa34ff4941b
```

**Any APPLICATION change** after this SHA (routes, services, repos, RBAC, CSS, migrations, schema, seeds that alter product behavior) **invalidates** the V2.03 QA candidate and requires:

1. New application SHA  
2. Redeploy to testing/pronline  
3. Targeted regression (at minimum: ACN18 isolation, ACN27, AC-P05, B1+B2+B3 smoke)  
4. New release gate record  

**Documentation-only changes** do not change the application candidate, but must be clearly classified as docs-only and must not rewrite historical blocked gates as passes.

Do **not** implement intentional gaps during freeze. Do **not** deploy production from this freeze.

---

## Known non-blocking gaps (frozen as gaps)

| Domain | Gaps (NOT V2.03 QA blockers) |
|--------|------------------------------|
| ACN18 | private binary storage; attachment download; e-sign; DICOM/HL7; advanced versioning |
| AC-P05 | PDF/private storage; re-release/versioning; booking↔encounter FK/date-match; automatic patient instructions; patient-view audit; ACN18→patient release bridge |
| ACN27 | occupancy; IoT; equipment inventory; room scheduling; bed management |

---

## Historical gate sequence (preserved)

1. `d5bb8204` hosted gate — **BLOCKED** (ACN18 scoped-document response hang).  
2. Root cause identified (`renderSimpleState` HTML not sent).  
3. Fix committed as `b8c18c3d`.  
4. Local Batch 1/2/3 **84/0**.  
5. Hosted retest on `b8c18c3ded98` — **PASS**; blocker resolved.  
6. This freeze + QA handoff — ready for QA.

---

## Recommended tag timing

Do **not** auto-create Git tag `v2.03-qa`.

Prefer treating **exact SHA** `b8c18c3ded9892aa318ae6e029600aa34ff4941b` as authoritative until QA acceptance. Optionally create `v2.03-qa` **after** QA sign-off if ops wants a memorable pointer (still points at this SHA).

---

## APPLICATION CANDIDATE FROZEN: YES
