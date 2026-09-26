# HOST-PKG-A — Hostinger backend escalation (ready to send)

**Date:** 2026-09-26  
**Status:** `HOST_PKG_A_BLOCKED_HOSTINGER_BACKEND`  
**Account home (from app runtime cwd):** `/home/u549637099`  
**Plan:** Cloud Startup  
**Scope:** Testing hostnames — **not** production app code or DB  

**How to send:** Hostinger hPanel → **Support** → New request. Paste “Ticket body” below.

**Note:** Customer hPanel/DNS do **not** expose www separately; hostname→runtime mapping is **not customer-visible**. This ticket requests **internal backend/engineering** inspection. There is **no** owner “unbind www in hPanel” step.

---

## Ticket subject

```text
Cloud Startup — internal Node.js vhost/runtime mapping for www vs apex (neuniversity.org / pronline.org)
```

---

## Ticket body (paste)

```text
Please escalate to the team that can inspect Node.js virtual-host and
runtime bindings on my Cloud Startup account (customer panel cannot see this).

Account home (observed from Node app cwd): /home/u549637099
Plan: Cloud Startup

Customer-surface facts already confirmed on our side:
- www is not exposed separately in hPanel or DNS for these sites.
- Hostname-to-runtime/vhost mapping is not customer-visible.
- Therefore we cannot perform a customer “unbind www from Node” action.
- We need Hostinger backend/engineering confirmation of the runtime map.

Please review INTERNAL bindings for:

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
   Node.js binding while keeping the apex Node.js applications ACTIVE:
     - Keep: neuniversity.org Node app
     - Keep: pronline.org Node app
     - Remove only: www-only Node binding (if present)

5. If possible, configure www → apex redirect at the web-server/platform
   layer so the redirect does not invoke Node.js.

6. Please provide the before/after expected Node worker or NPROC effect.

Constraints:
- Do NOT remove or modify the apex Node.js applications.
- Do NOT change production application code or database settings.
- Do NOT touch production TLDs (blessboard.com / activeclinic.org) for this.
- We need INTERNAL runtime mapping, not only DNS or HTTP redirect behavior.
  Application-layer 301s already exist for some hub paths; that is not proof
  that www has (or lacks) a Node worker.

External app diagnostics (correlation ONLY — we understand PIDs alone do
not prove separate www workers):
- Distinct testing Node PIDs recently observed: 10
- www.neuniversity.org example sticky app diagnostic PID: 3464039
- www.pronline.org example sticky app diagnostic PID: 215891
- Both www hosts returned HTTP 200 JSON from app /__platform/runtime in
  past probes; please confirm whether that implies a www vhost worker.

Please reply with:
A) Runtime/vhost mapping for the four hostnames
B) Whether any www-only Node binding was removed (yes/no each)
C) Where www→apex redirect is handled after any change (edge vs Node)
D) Expected worker/NPROC effect before vs after
E) Any process/NPROC snapshot you can share
```

---

## After Hostinger replies

Engineering re-probes public health/runtime for correlation and updates verification docs.  
Do **not** claim NPROC savings unless Hostinger states the effect.

Production check (read-only): `blessboard.com` `/healthz` must remain `moovex-platform-production`.

---

## Explicit non-actions

| Do not | Why |
| --- | --- |
| Ask owner to unbind www in hPanel | Not available / not exposed |
| Stop apex Node apps | Breaks testing hubs |
| Change production Node apps / DB | Out of scope |
| Treat Express 301 as Package A closure | Insufficient / not worker proof |
