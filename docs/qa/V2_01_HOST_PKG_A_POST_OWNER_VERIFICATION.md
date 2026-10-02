# V2.01 HOST-PKG-A Post-Owner Verification

**Task:** `V2_01_HOST_PKG_A_POST_OWNER_VERIFICATION`  
**Date:** 2026-09-26 (status update same day)  
**Branch:** `V8`  
**Mode:** Read-only probes historically; **status reclassification** — no app code, no production mutation  

**Baseline / living status:** `V2_01_HOST_PKG_A_CLOSURE.md`

---

## Verdict

**`HOST_PKG_A_BLOCKED_HOSTINGER_BACKEND`**

Supersedes earlier `HOST_PKG_A_BLOCKED` wording that implied the owner could still **unbind www in hPanel**.

### Hostinger customer-surface evidence (owner-reported)

| Evidence | Implication |
| --- | --- |
| www **not** exposed separately in hPanel or DNS | No customer unbind control for www→Node |
| Hostname→runtime/vhost mapping **not customer-visible** | Panel cannot confirm binding |
| Per-www worker ownership **UNKNOWN** | Sticky PIDs are not proof |
| PID observations alone do **not** prove separate workers | No NPROC claim from probes |
| **No hPanel unbind action available** | Do not instruct owner to unbind www |
| Hostinger **backend/engineering** inspection required | Escalation ticket only |

---

## Historical probe snapshot (correlation only)

From the post-owner verification probe session (not proof of separate www workers):

| Host | `/__platform/runtime` | Example sticky PID | Notes |
| --- | ---: | ---: | --- |
| `www.neuniversity.org` | 200 JSON | 3464039 | ≠ apex PID; same release tree path |
| `neuniversity.org` | 200 | 3471492 | Apex KEEP |
| `www.pronline.org` | 200 JSON | 215891 | ≠ apex PID |
| `pronline.org` | 200 | 1553960 | Apex KEEP |
| Unique testing Node PIDs | — | **10** | Count only |
| www `/` | 301 → apex | — | App-layer; insufficient alone |
| Production | `03a89106e2fe` | — | Untouched |

**Do not infer process savings from redirects or PID inequality.**

---

## What remains open

1. Hostinger backend confirmation of www vs apex Node/lsnode binding.  
2. If a www-only binding exists: Hostinger removes **only** that binding; apex apps stay active.  
3. Prefer platform-layer www→apex redirect that does not invoke Node (if supported).  
4. Hostinger-stated before/after worker or NPROC effect.

Owner path: submit/follow `V2_01_HOST_PKG_A_HOSTINGER_ESCALATION.md`.  
**Not** an owner path: hPanel “unbind www.”

---

## Application / production

| Check | Result |
| --- | --- |
| App regression from Package A | None (no Package A host change applied via customer panel) |
| Production SHA | `03a89106e2fe` · `moovex-platform-production` (read-only) |
| This status update | Docs only |

---

## FINAL VERDICT (repeat)

**`HOST_PKG_A_BLOCKED_HOSTINGER_BACKEND`**
