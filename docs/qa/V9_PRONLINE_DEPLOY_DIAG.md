# V9 Ancestry + Pronline Deploy Diagnosis

**Task:** `V9_ANCESTRY_AND_PRONLINE_DEPLOY_DIAG`  
**Date:** 2026-09-26T12:30:22Z  
**Repo:** `getproapp`  
**Production:** **DO NOT TOUCH** (read-only HTTP + git)

---

## Verdict summary

| Key | Value |
| --- | --- |
| **V9_DESCENDS_FROM_V8** | **YES** |
| **PRONLINE_V9_DEPLOYED** | **NO** (not as Version 2.02 / freeze tag) |
| **ROOT_CAUSE** | Pronline Hostinger app `moovex-platform-testing` is running **V9 tip code** (`2ff400a2`) under **V7 deployment profile** (`platformLine=v7`) → About **Release 1.3**. Frozen RC is tag **`v2.02` → `3b94485c`**, which is **not** what About/healthz advertise as the release line, and is **one commit behind** the running SHA. |
| **NEXT_SAFE_ACTION** | Do **not** treat pronline as the V2.02 verify host. Confirm hPanel Git branch for `moovex-platform-testing` (historically **V7**). Restore/redeploy that app to intended **V7** tip **or** explicitly decide an operator change. Deploy **V9 / `v2.02`** only to the **neuniversity** V8/V9 testing app (`moovex-platform-v8-testing`) when owner approves — then verify About **2.02** + SHA. |

---

## 1. Git rev-parse

| Ref | SHA |
| --- | --- |
| `origin/V8` | `b186991d7db5334bfaa235f8a0ecf37428ea4a5a` |
| `origin/V9` | `2ff400a24a677dcfdfb81434cce84f31974dd54c` |
| `v2.02` (tag object) | `f2d1778d0466d42d43ff75cf2de1d8740bdd50d5` |
| `v2.02^{}` (peel / freeze commit) | `3b94485ce72bdb8c7f4d6d692033ab080ae51bf3` |

---

## 2. Ancestry proof

```text
git merge-base --is-ancestor origin/V8 v2.02
echo $?
→ 0
```

Also `origin/V8` is an ancestor of `v2.02^{}` (exit **0**).

**V9_DESCENDS_FROM_V8 = YES** — `v2.02` is a **strict descendant** of `origin/V8`.

---

## 3. Commits `origin/V8..v2.02`

```text
3b94485c (tag: v2.02) Document V2.02 V9 final release freeze and v2.02 tag.
03844c12 Align V2.02 final push report with origin tip SHA.
be9ef6ff Document V2.02 V9 final commit and push verification.
c86c0ea2 Finalize V2.02 shared RBAC and release candidate.
fd2d6f8a Document V2.02 shared RBAC completion and Phase A backfill.
5140acc4 Add V2.02 Phase A backfill from legacy user_roles to catalogue assignments.
```

**6 commits** on the freeze tag beyond V8.

`origin/V9` is **one commit further**:

```text
2ff400a2 Correct V2.02 freeze report to match tag v2.02 peel.
```

(`2ff400a2` has freeze as ancestor — exit 0.)

---

## 4. Baseline / tag confirmation

| Expectation | Result |
| --- | --- |
| V8 baseline = `b186991d…` | **YES** |
| `v2.02` tag peel = `3b94485c…` | **YES** |
| Strict descendant of V8 | **YES** |

---

## 5. Pronline live evidence

| Probe | Result |
| --- | --- |
| `https://blessboard.pronline.org/about` | **Release 1.3** / Version 1.03.x · **Build `2ff400a24a67`** |
| `https://activeclinic.pronline.org/about` | Same pattern · Build `2ff400a24a67` |
| BB/AC `/healthz` | `deploymentCode=moovex-platform-testing` · **`platformLine=v7`** · `environment=testing` · **`gitSha=2ff400a24a67`** · cookie `moovex_platform_testing_*` |

| Expected frozen RC | Observed on pronline |
| --- | --- |
| SHA `3b94485ce72b…` | SHA **`2ff400a24a67`** (V9 tip, **not** tag peel) |
| Product **2.02** | Product **1.3** (V7 scheme) |

### Control — neuniversity (V8 testing)

| Probe | Result |
| --- | --- |
| `blessboard.neuniversity.org/about` | **Version / Release 2.02** · Build `b186991d7db5` |
| `/healthz` | `moovex-platform-v8-testing` · `platformLine=v8` · `gitSha=b186991d7db5` |

V8 testing still on **V8 baseline**, not V9 tip / `v2.02` tag.

---

## 6. Hostinger / deploy config (from repo + live signals)

No SSH into Hostinger from this task. Evidence from docs + live `/healthz`:

| Item | Pronline (observed / documented) | Notes |
| --- | --- | --- |
| **Configured deployment** | `PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing` | Live healthz |
| **Platform line** | **`v7`** | Forces About **1.3** via `applicationBuildInfo` / `isV8Deployment` |
| **Documented Git branch** | **`V7`** (`docs/platform/V7_HOSTINGER_TESTING_ENV.md`) | Historical operator contract |
| **Deployed commit SHA** | **`2ff400a24a67`** = current **`origin/V9` tip** | Implies hPanel Git ref was switched to **V9** (or equivalent checkout), contrary to documented V7 branch |
| **Startup path / cwd** | Documented under `…/domains/pronline.org/hbuilds/versions/…/nodejs` | HOST-PKG-A / process audits; exact version UUID not re-probed via SSH |
| **`current` symlink** | Not observable without Hostinger FS access | Deduce only from running `gitSha` |
| **Cached/stale dirs** | Possible under `hbuilds/versions/*` | Running process clearly serves `2ff400a2` (not stale older SHA) |
| **Restart/redeploy required?** | **Yes**, after any intentional branch/SHA correction in hPanel | GitHub push alone does not update workers until Hostinger deploy/restart |

### Why About shows 1.3 with a V9 SHA

`getApplicationBuildInfo` selects product version from **deployment profile**, not branch name:

- V7 / non-V8 deploy → `productVersion=1.3`, `versionBase=1.03`, version string `1.03.<sha>`
- V8 deploy (`moovex-platform-v8-testing` / neuniversity) → `productVersion=2.02`

So pulling V9 **source** onto the **V7 testing** Hostinger app yields: **new SHA + old product label**.

---

## 7. Classification

| Question | Answer |
| --- | --- |
| Is pronline on frozen `v2.02`? | **NO** |
| Is pronline on V9 tip code? | **YES** (`2ff400a2`) |
| Is that a valid V2.02 **product** deploy? | **NO** — wrong profile (`platformLine=v7`) |
| Did this task change production? | **NO** |

---

## 8. NEXT_SAFE_ACTION (ordered)

1. **Operator (hPanel):** Open Node app for `pronline.org` / `moovex-platform-testing`. Record configured **Git branch** and last deploy.  
2. If unintended: set Git branch back to **`V7`**, Deploy/Restart, confirm `/healthz` `gitSha` matches `origin/V7` (not V9).  
3. For **V2.02 RC verify**: Deploy **`v2.02`** (or `V9` @ `3b94485c`) only to **`moovex-platform-v8-testing`** on **neuniversity.org**, restart, confirm About **2.02** + matching `gitSha`.  
4. Do **not** promote production. Do **not** merge V9→V8 in this diag.

---

## Return tokens

```
V9_DESCENDS_FROM_V8 = YES
PRONLINE_V9_DEPLOYED = NO
ROOT_CAUSE = Pronline moovex-platform-testing runs origin/V9 tip 2ff400a2 under platformLine=v7 (About 1.3); frozen v2.02 peel 3b94485c not selected; wrong host/profile for 2.02
NEXT_SAFE_ACTION = Restore pronline Git to V7 if unintended; deploy v2.02/V9 only to neuniversity moovex-platform-v8-testing for 2.02 verify; no production change
```
