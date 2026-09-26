# V2.03 ACN18 — Isolation / Not-Found Response Hang Fix

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_ACN18_ISOLATION_HANG_FIX` |
| **Date** | 2026-09-27 |
| **Blocked gate SHA** | `d5bb82045e6858b628257a81f54d5d7d8dc4e1ab` |
| **Prior verdict** | `V2_03_V10_FINAL_HOSTED_GATE_BLOCKED` |
| **This fix verdict** | `V2_03_ACN18_ISOLATION_HANG_FIX_PASS` |

---

## Original symptom

On hosted V10 (`d5bb82045e68`):

| Request | Observed |
|---------|----------|
| Valid own document detail | HTTP **200** (~0.5s) |
| ACN18 list | HTTP **200** (~0.7s) |
| Forged / nonexistent document detail | **No response bytes**; timeout ~12–40s (CDN 307 self-`Location` / 504) |
| Cross-patient document detail | Same hang |

Everything else in the V2.03 final hosted gate passed. This was the **single release blocker**.

---

## Exact root cause

`renderSimpleState(title, message, extras)` in `activeClinicPermissionMiddleware.js` **returns an HTML string**. It does **not** call `res.send` / `res.end` / `res.render`.

ACN18 routes incorrectly did:

```js
return renderSimpleState(res, {
  status: 404,
  title: "Document not found",
  message: "...",
  linkHref: listBase,
  linkLabel: "Back to documents",
});
```

Effects:

1. `res` was treated as the `title` argument (object).
2. The options object was treated as `message`.
3. An HTML string was returned to Express but **never written to the response**.
4. The HTTP request stayed open until client/CDN timeout.

Working call sites elsewhere (e.g. diagnostics, clinical encounter) correctly do:

```js
return res.status(404).type("html").send(renderSimpleState("Not found", "...", { ... }));
```

---

## Affected routes

All ACN18 handlers that used the broken pattern:

| Method | Path | Failure mode |
|--------|------|----------------|
| GET | `/app/clinical/patients/:patientId/documents` | invalid patient UUID / list gate miss |
| GET | `/app/clinical/patients/:patientId/documents/new` | invalid / missing patient |
| GET | `/app/clinical/patients/:patientId/documents/:documentId` | missing / cross-patient / invalid id |
| GET | `/app/clinical/patients/:patientId/documents/:documentId/edit` | same |

Also hardened (terminate with non-enumerating 404):

| Method | Path | Change |
|--------|------|--------|
| POST | `.../documents/:documentId` (update) | `NOT_FOUND` / `PATIENT_NOT_FOUND` → 404 via `sendDocumentNotFound` |
| POST | `.../documents/:documentId/finalize` | check service result; scoped miss → 404 (no silent redirect-as-success) |

---

## Response helper contract

| Item | Contract |
|------|----------|
| `renderSimpleState(title, message, extras?)` | Returns **HTML string** only |
| Caller must | `res.status(n).type("html").send(...)` |
| ACN18 helper | `sendSimpleState(res, { status, title, message, linkHref, linkLabel })` |
| Document miss helper | `sendDocumentNotFound(res, listBase)` → always **404** with generic “Document was not found.” |

---

## Fix

Smallest correct change in `activeClinicClinicalDocumentRoutes.js`:

1. Add `sendSimpleState` / `sendDocumentNotFound`.
2. Replace every broken `return renderSimpleState(res, …)` with `return sendSimpleState(...)` / `sendDocumentNotFound(...)`.
3. Update + finalize: scoped misses return **404** (non-enumerating), not an open response or false success redirect.

No migration. No domain/RBAC/schema change. ACN27 / AC-P05 untouched.

---

## Security behavior

| Case | Status | Completes | PHI in body/location |
|------|--------|-----------|----------------------|
| Valid own detail | 200 | YES | N/A (authorized) |
| Nonexistent ID | 404 | YES | NO |
| Cross-patient | 404 | YES | NO |
| Cross-tenant | 404 (or 403 if authz denies earlier) | YES | NO |
| Unauthorized role | 403 | YES | NO |
| Cross-patient POST update | 404 | YES | NO (document unchanged) |
| Cross-patient POST finalize | 404 | YES | NO (document unchanged) |

Isolation semantics preserved: scoped misses stay **404**, not 403 that would distinguish existence.

---

## Regression test

`tests/activeclinic-batch3-acn18-clinical-documents.test.js`

`HTTP document detail/edit/update/finalize complete for own, missing, cross-patient, cross-tenant, unauthorized`

- Uses `Promise.race` with **4s** timeout — **fails if the HTTP request remains open**.
- Asserts statuses and **absence of secret title/body** on denied/not-found responses.
- Covers edit GET, update POST, finalize POST for cross-patient.

---

## Test results (local)

| Suite | Pass | Fail |
|-------|------|------|
| ACN18 clinical documents | 6 | 0 |
| Batch 2 RBAC / tenant / facility isolation | 4 | 0 |
| Batch 1 (`activeclinic-batch1a-*`) | 28 | 0 |
| Batch 2 (incl. RBAC suite) | 27 | 0 |
| Batch 3 (incl. ACN18/27/AC-P05) | 29 | 0 |
| **Combined Batch 1+2+3** | **84** | **0** |

Database / migrations: **unchanged** (still through `042` on testing).

---

## Follow-up outside this fix

Redeploy expected tip to pronline and re-run the V10 final hosted gate. Attempt 1 (SHA lag) and Attempt 2 (this hang) remain historically blocked in `docs/qa/V2_03_V10_POST_DEPLOY_GATE.md`.
