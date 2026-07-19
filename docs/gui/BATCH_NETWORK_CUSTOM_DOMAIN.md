# BATCH_NETWORK_CUSTOM_DOMAIN — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — entry gate failed  
**Prompt:** 39. IMPLEMENT MANUAL CUSTOM DOMAIN WORKFLOW

## Gate

Source: [`docs/product/NETWORK_CUSTOM_DOMAIN_READINESS.md`](../product/NETWORK_CUSTOM_DOMAIN_READINESS.md)

| Check | Result |
|-------|--------|
| Prompt requires | `READY FOR MANUAL CUSTOM DOMAIN WORKFLOW` |
| Audit verdict | **BACKEND CHANGES REQUIRED** |
| Checklist row | READY FOR MANUAL… = **No** |

## Why this batch did not run

Instruction: *Run only if NETWORK_CUSTOM_DOMAIN_READINESS.md says READY FOR MANUAL CUSTOM DOMAIN WORKFLOW.*

The audit explicitly selected **BACKEND CHANGES REQUIRED** and rejected READY because:

1. **CD1** — No first-class add-custom-domain-beside-canonical service  
2. **CD2** — No audit on domain status / org assignment  
3. **CD3** — No ops runbook for Model A  
4. **CD6** — Live tenant HTML on a custom host needs authoritative routing + Hostinger TLS (ops/release; not inventable here)  
5. Optional **CD4/CD5** — `verified_at` unused; PA cannot create custom rows  

Implementing the full prompt (PA assignment GUI, HQ read-only status, schema, DNS instruction state, audit, tests) under a failed READY gate would contradict the audit stop rule.

## Unchanged

- No schema, routes, services, views, nav, or Hostinger/DNS changes  
- Host-only cookies and login-transfer architecture untouched  
- No DNS/SSL automation  

## Resume when

1. Product/ops re-open the readiness audit and change the verdict to **READY FOR MANUAL CUSTOM DOMAIN WORKFLOW**, **or**  
2. A follow-up prompt explicitly authorizes **NW-CD-01** under the existing **BACKEND CHANGES REQUIRED** verdict (service + CLI + audit + runbook first; GUI only as approved).  

Until then: do not re-run this implementation prompt as written.

## Suggested follow-up

Either update `NETWORK_CUSTOM_DOMAIN_READINESS.md` after CD1–CD3 are designed/accepted as the READY bar, then re-issue prompt 39; or issue a narrower prompt: *Implement NW-CD-01 only (backend + audit + runbook; no authoritative flip).*
