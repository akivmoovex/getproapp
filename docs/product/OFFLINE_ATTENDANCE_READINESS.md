# Offline attendance — implementation readiness

**Date:** 2026-07-19  
**Branch:** `V5`  
**Mode:** Assessment only — **no application code changed**  
**Sources:** [`FOUNDATION_GROWTH_BACKEND_PRIORITY.md`](./FOUNDATION_GROWTH_BACKEND_PRIORITY.md) · [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](../gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md) · `attendanceService` / `attendanceAdminRoutes` · V5 session + CSRF · catalogue `attendance.offline`

---

## Retain gate

| Check | Result |
|-------|--------|
| Offline attendance retained? | **No** |
| Classification | **DEFERRED** (Growth catalogue / marketing-only; BB-10) |
| Blocked-screens D4 | *No V5 offline attendance sync queue / client protocol* |
| Scheduler / outbox | *No V5 blessboard job/outbox for … offline sync* |

**Gate:** Product has not elevated offline attendance. This document still records a readiness comparison so elevation can proceed without re-discovery. **No implementation in this task.**

---

## 1. Current V5 attendance (online)

| Layer | State |
|-------|--------|
| Model | **Aggregate** event + category headcounts (not per-person check-in) |
| Admin UX | Server-rendered EJS HQ/branch admin (`attendanceAdminRoutes`) |
| Writes | Create event → upsert entries → submit / approve / archive |
| Authz | Tenant role + church/branch scope in `attendanceService` |
| CSRF | Double-submit cookie + form field on mutations |
| Session | V5 session cookie; authz re-checked per request |
| Client app | **No** SPA / service worker / installable PWA for attendance |
| Sync API | **None** — no offline queue, idempotency keys, or conflict protocol |
| Device storage | **None** for attendance drafts (only unrelated prefs elsewhere) |

---

## 2. Assessment dimensions

| Dimension | Finding |
|-----------|---------|
| Authentication / session expiry | Sessions expire; offline drafts cannot safely assume a long-lived actor. Sync must re-auth and re-authorize. |
| CSRF | Required for browser POSTs. Background sync cannot reuse a stale CSRF cookie blindly; needs a designed sync token or online re-submit flow. |
| Conflict resolution | **Undefined.** Concurrent HQ/BA edits already possible online; offline multiplies last-write-wins risk. |
| Device storage policy | No approved retention, encryption, or wipe-on-logout for attendance PII/counts on device. |
| Connectivity detection | Not part of V5 attendance chrome. |
| Sync API | Missing. |
| Privacy risk | Aggregate counts are lower risk than member lists, but church/branch identity + event metadata on shared devices still matter. |

---

## 3. Options compared

| | A. No offline | B. Local draft → manual online submit | C. Queued background sync | D. Installable PWA offline workflow |
|--|---------------|----------------------------------------|---------------------------|-------------------------------------|
| **Idea** | Online-only (today) | Save form values in browser; user submits when online | Auto-retry queue with workers | Full offline shell + sync |
| **Data conflicts** | Low (server is SoT) | Medium (stale draft vs server event) | High (needs versioning / merge rules) | Highest |
| **Duplicate submissions** | Mitigated by upsert-by-category online | Medium if user double-submits draft | High without idempotency keys | High |
| **Device sharing** | N/A | High — drafts visible to next user | High | High |
| **Lost/stolen devices** | N/A | Medium (local draft leakage) | High (queued payloads) | High |
| **Stale authentication** | Fail closed online | User re-auths then submits | Must fail closed; queue must not bypass authz | Same as C + install surface |
| **Branch scope** | Enforced server-side | Must re-bind branch on submit | Easy to violate if client-trusted | Same |
| **Auditability** | Server audit possible today | Audit on final submit only | Needs sync attempt audit | Same + install events |
| **Browser support** | All | Modern localStorage/sessionStorage | SW + Background Sync (limited) | PWA install uneven on iOS |
| **Implementation cost** | None | Low–medium | High | Very high |
| **Fits V5 architecture** | **Yes** | Partial (EJS + small script) | Poor without new API/protocol | Poor (no SPA foundation) |

---

## 4. Smallest safe model (when retained)

**Recommend B — local draft only, manually submitted when online** — *only after product elevates offline attendance from DEFERRED*.

Rationale:

1. Preserves server as source of truth and existing CSRF/session/authz.  
2. Avoids inventing a sync queue, conflict protocol, and job runner (V5 has none).  
3. Aggregate attendance is a small form payload (not a member roster).  
4. Still requires product rules: storage key scope (church/branch/user), wipe on logout, no auto-POST, clear “draft not submitted” UX.

**Do not** choose C or D until: sync API + idempotency + conflict rules + device policy + session revalidation are designed and retained.

**Default until elevation:** **A — no offline support** (current shipping behavior).

---

## 5. Conclusion

| Outcome | Selected |
|---------|----------|
| READY TO IMPLEMENT LOCAL DRAFT | No — feature **not retained** |
| READY TO IMPLEMENT SYNC | No — **MISSING_BACKEND** (no sync protocol / queue) |
| **DEFER** | **Yes** |

**Verdict: DEFER**

Offline attendance remains catalogue marketing (`attendance.offline`) until product elevates BB-10 and signs a local-draft (B) vs sync (C) decision. Prefer **B** as the first implementable slice when retained; **C/D** are not ready.

---

## Resume when

1. Product elevates offline attendance from **DEFERRED**.  
2. Product chooses **B** (local draft) or explicitly funds sync protocol design for **C**.  
3. Device storage + logout wipe + branch re-bind rules are written.  
4. Then open an implementation batch (local draft first).

## Suggested commit (docs only)

```text
Document offline attendance readiness: defer; prefer local draft if elevated.
```
