# HOST-PKG-A — Hostinger internal escalation (ready to send)

**Date:** 2026-09-26  
**Ticket:** Package A — www Node vhost / runtime binding review  
**Account home (from app runtime cwd):** `/home/u549637099`  
**Plan:** Cloud Startup  
**Scope:** Testing hostnames only — **not** production app code or DB  

**How to send:** Hostinger hPanel → **Support** → New request. Paste the block under “Ticket body” below. Attach optional PID matrix notes if useful.

**Cursor / engineering agent cannot open this ticket** (no Hostinger support or hPanel credentials in this environment). Owner must submit.

---

## Ticket subject

```text
Cloud Startup — confirm Node.js vhost/runtime binding for www vs apex (neuniversity.org / pronline.org); remove www-only Node binding if separate
```

---

## Ticket body (paste)

```text
Please escalate this to the team that can inspect Node.js virtual-host and
runtime bindings on my Cloud Startup account.

Account home (observed from Node app cwd): /home/u549637099
Plan: Cloud Startup (Max Processes / NPROC ceiling 200)

I need an INTERNAL RUNTIME MAPPING review for these hostnames only:

  - neuniversity.org
  - www.neuniversity.org
  - pronline.org
  - www.pronline.org

Please confirm:

1. Whether www.neuniversity.org has its own Node.js vhost/runtime binding
   or merely aliases the apex application (neuniversity.org).

2. Whether www.pronline.org has its own Node.js vhost/runtime binding
   or merely aliases the apex application (pronline.org).

3. Whether either www hostname causes a separate Node.js worker, lsnode
   process, PID, or NPROC allocation on this plan.

4. If a separate www runtime binding exists, please remove ONLY that www
   Node.js binding while keeping the apex Node.js application ACTIVE:
     - Keep: neuniversity.org Node app
     - Keep: pronline.org Node app
     - Remove only: www → Node binding (if present)

5. If possible, configure the www → apex redirect at the web-server /
   platform layer (LiteSpeed / hPanel Redirects / equivalent) so the
   redirect does NOT invoke Node.js.

6. Please provide the before/after expected Node worker or NPROC effect
   (even if approximate).

Important constraints:
- Do NOT remove or modify the apex Node.js applications.
- Do NOT change production application code or database settings.
- Do NOT touch production TLDs (e.g. blessboard.com / activeclinic.org)
  as part of this request.
- I need confirmation of the INTERNAL runtime mapping, not only DNS or
  HTTP redirect behavior. Application-layer 301s already exist for hub
  paths; that alone is not sufficient evidence that www has no Node worker.

Observed application diagnostics baseline (external; for correlation only —
  we understand PIDs alone do not prove separate www workers):
- Total distinct testing Node PIDs recently observed: 10
- www.neuniversity.org previously observed sticky app PID: 3464039
- www.pronline.org previously observed sticky app PID: 215891
- Both www hosts returned HTTP 200 JSON from /__platform/runtime (Node app
  diagnostics) in addition to apex, which is why we suspect separate
  per-hostname lsnode/vhost workers.

Please reply with:
A) Runtime/vhost mapping for the four hostnames above
B) Whether www was unbound from Node (yes/no each)
C) Where www→apex redirect is now handled (edge vs Node)
D) Expected worker/NPROC effect before vs after
E) Any screenshot or process snapshot you can share for Max Processes
```

---

## Optional attachments for the ticket

1. `docs/qa/V2_01_HOST_PKG_A_CLOSURE.md` — target state + owner steps  
2. `docs/qa/V2_01_HOST_PKG_A_POST_OWNER_VERIFICATION.md` — latest probe: www still sticky Node  

---

## After Hostinger replies — engineering re-verify

Re-run probes from Package A verification:

```bash
curl -sSI https://www.neuniversity.org/ | head -20
curl -sSI https://www.pronline.org/ | head -20
# Expect: no sticky Node JSON PID on www runtime (or non-app response)
curl -sS https://www.neuniversity.org/__platform/runtime || echo NO_APP_RUNTIME
curl -sS https://www.pronline.org/__platform/runtime || echo NO_APP_RUNTIME
curl -sS https://blessboard.neuniversity.org/healthz
curl -sS https://activeclinic.neuniversity.org/healthz
curl -sS https://blessboard.com/healthz   # must stay 03a89106e2fe / production
```

Then reopen task `V2_01_HOST_PKG_A_POST_OWNER_VERIFICATION` targeting verdict **`HOST_PKG_A_CLOSED`**.

---

## Explicit non-actions for Hostinger (repeat)

| Do not | Why |
| --- | --- |
| Stop / delete apex Node apps | Breaks V8/V7 testing hubs |
| Change production Node apps / DB env | Out of scope |
| Unbind `blessboard.*` / `activeclinic.*` | Product QA hosts |
| Rely on Express-only redirect as the fix | Does not retire www workers |
