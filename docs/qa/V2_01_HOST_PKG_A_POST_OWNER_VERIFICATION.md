# V2.01 HOST-PKG-A Post-Owner Verification

**Task:** `V2_01_HOST_PKG_A_POST_OWNER_VERIFICATION`  
**Date:** 2026-09-26  
**Branch:** `V8` tip `7754496c3844`  
**Mode:** Read-only probes — **no** hPanel/DNS/`.htaccess`/unbind/restart; **no** production mutation  
**Baseline:** `docs/qa/V2_01_HOST_PKG_A_CLOSURE.md` (`HOST_PKG_A_READY_FOR_OWNER_ACTION`)  
**Production:** **READ-ONLY** · `03a89106e2fe` · `moovex-platform-production`

---

## Verdict

**`HOST_PKG_A_BLOCKED`**

Observable evidence shows Package A **has not been completed**. Both Package A www hosts still expose **dedicated sticky Node PIDs** via `/__platform/runtime`, same pattern as the pre-change baseline. Hub `/` 301s alone are **not** Package A success (Express redirect already existed).

| Criterion | Required | Observed | Pass? |
| --- | --- | --- | --- |
| www unbind (no dedicated Node PID) | No sticky app runtime on www | www still **200** runtime + sticky PID ≠ apex | **FAIL** |
| www `/` → apex | 301/edge | **301** (unchanged vs baseline) | UX OK; **insufficient alone** |
| V8 BB+AC+apex healthy | 200 v8-testing | **PASS** | **PASS** |
| V7 BB+AC healthy | 200 testing | **PASS** | **PASS** |
| Production unchanged | `03a89106e2fe` | **PASS** | **PASS** |
| NPROC savings | hPanel graph | **NOT AVAILABLE** to Cursor | Owner-only |

---

## 1. www binding / unbind state (inferred from runtime)

Cursor cannot read hPanel domain lists. Unbind is inferred from whether www still serves Node app runtime.

| Host | `/healthz` | `/__platform/runtime` | Sticky PID (3/3) | Same tree as apex? | Interpretation |
| --- | ---: | ---: | ---: | --- | --- |
| **`www.neuniversity.org`** | 200 · v8-testing `7754496c` | **200** | **3464039** | Yes (`…/neuniversity.org/hbuilds/…`) | **Still bound to Node** |
| `neuniversity.org` | 200 · same | 200 | **3471492** | — | KEEP (expected) |
| **`www.pronline.org`** | 200 · V7 testing | **200** | **215891** | Yes (`…/pronline.org/hbuilds/…`) | **Still bound** (PID **unchanged** vs baseline) |
| `pronline.org` | 200 · same | 200 | **1553960** | — | KEEP (expected) |

**Baseline (closure §2.2):** www PIDs `1841608` / `215891`.  
**After claim:** www V8 PID rotated (redeploy — expected); www V7 PID **215891 still present**.  
**www PID ≠ apex PID** on both lines → dedicated workers remain.

**UNIQUE testing Node PIDs observed now = 10** (same count as pre-Package-A audits).

---

## 2. Apex / www HTTP behavior (BB + AC lines)

### Redirects (no follow)

| URL | Status | Location |
| --- | ---: | --- |
| `https://www.neuniversity.org/` | **301** | `https://neuniversity.org/` |
| `https://www.pronline.org/` | **301** | `https://pronline.org/` |
| `https://www.neuniversity.org/healthz` | **200** JSON | (no redirect — still Node) |
| `https://www.pronline.org/healthz` | **200** JSON | (no redirect — still Node) |
| `https://www.neuniversity.org/__platform/runtime` | **200** | Node PID above |
| `https://www.pronline.org/__platform/runtime` | **200** | Node PID above |

**Do not infer process savings from `/` 301.** That path was already app-layer redirect before Package A.

### Product hosts

| Host | deploymentCode | gitSha | schema |
| --- | --- | --- | --- |
| `blessboard.neuniversity.org` | `moovex-platform-v8-testing` | `7754496c3844` | true |
| `activeclinic.neuniversity.org` | same | same | true |
| `blessboard.pronline.org` | `moovex-platform-testing` | `03a89106e2fe` | true |
| `activeclinic.pronline.org` | same | same | true |

Login smoke: BB + AC V8 `/login` → **200**.

---

## 3. Node worker / PID / NPROC

### Observable from Cursor (PASS/FAIL for Package A process goal)

| Metric | Before (closure) | After (this probe) |
| --- | --- | --- |
| www.neuniversity.org sticky PID | 1841608 | **3464039** (still present) |
| www.pronline.org sticky PID | 215891 | **215891** (still present) |
| www PID == apex PID? | No | **No** |
| Testing unique Node PIDs | 10 | **10** |
| Est. PID savings realized | — | **0** |

### Not observable from Cursor (owner-only)

| Evidence | Status |
| --- | --- |
| hPanel Web Apps → domain bind list | **Owner-only** |
| Resource Usage Max Processes before/after screenshots | **Owner-only** |
| Account-wide `ps` / `lsnode` count | **Owner SSH or Hostinger support** |
| Claimed NPROC drop | **Forbidden** without graphs — **none claimed** |

No Hostinger SSH keys in this environment (`~/.ssh` has no account keys).

---

## 4. Before vs after

| Expectation if Package A applied | Actual |
| --- | --- |
| www `/__platform/runtime` → no sticky Node JSON (404/edge/non-app) | **Still 200 Node JSON** |
| Up to ~2 fewer testing Node PIDs | **Still 10** |
| www `/` 301 preserved | Yes (pre-existing / still OK) |
| BB/AC unchanged | Yes |

**Conclusion:** Either owner hPanel unbind was **not applied**, applied only partially in a way that still attaches www as a Node vhost, or workers were re-bound. From public probes, state matches **pre-Package-A**.

---

## 5. Application regression

| Check | Result |
| --- | --- |
| V8 BB/AC `/healthz` | **PASS** |
| V8 BB/AC `/login` | **PASS** |
| V7 BB/AC `/healthz` | **PASS** |
| Schema compatible | **true** |
| Package B hosts still warm | Expected (out of Package A scope) |

No application regression attributed to Package A (no Package A change evidenced).

---

## 6. Production identity (read-only)

| Surface | Result |
| --- | --- |
| `blessboard.com` `/healthz` | `03a89106e2fe` · `moovex-platform-production` · schemaCompatible **true** |
| `www.blessboard.com` `/healthz` | same · production |
| `activeclinic.org` `/healthz` | same · production |
| Production `/__platform/runtime` | **404** gated (unchanged) |
| This task mutations | **None** |

**Production app code SHA and deployment identity unchanged.** DB not touched by this verification.

---

## Required owner follow-up (unchanged from closure §5)

1. Confirm in hPanel whether `www.neuniversity.org` / `www.pronline.org` are still listed on the Node Web Apps.  
2. If still listed: **unbind www only** + keep/confirm panel **301** www→apex.  
3. Wait ≥60 minutes quiet on www; re-run verification §7 from closure.  
4. File Max Processes screenshots before claiming NPROC relief.  
5. Re-open this ticket aiming for **`HOST_PKG_A_CLOSED`**.

---

## FINAL VERDICT (repeat)

**`HOST_PKG_A_BLOCKED`**

Post-owner verification **failed Package A success criteria**: www hosts still run dedicated sticky Node workers (10 testing PIDs). Hub 301 alone does not close Package A. NPROC graphs remain owner-only. Production untouched at `03a89106e2fe`.
