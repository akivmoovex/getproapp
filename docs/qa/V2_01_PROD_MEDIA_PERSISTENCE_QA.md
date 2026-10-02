# V2.01 Production Media Persistence QA

**Task:** `V2_01_PROD_MEDIA_PERSISTENCE_QA`  
**Date:** 2026-09-26  
**Mode:** Fresh production write QA on disposable tenants only — **no infra or schema changes**  
**Release candidate:** `gitSha=03a89106e2fe` · `moovex-platform-production` · `environment=production`  
**Accounts:** Approved disposable personas from `docs/qa/V2_01_PROD_QA_ACCOUNTS.md`  
**Evidence:** `/tmp/v2_01_prod_media_persistence_qa_4303f4.json` (local ops artifact; not committed)

**Do not reuse old QA as proof:** New stamped upload `4303f4` for BB and AC; CDN objects and `home.hero.image` published values created in this run.

---

## Verdict

### **FAIL**

Media **upload → draft → refresh → preview → publish → public reload → CDN resolve** and **cross-tenant media denial** **PASS** on both BlessBoard and ActiveClinic disposable production tenants.

**Image placement does not persist** on this release candidate: production tip `03a89106e2fe` has **no** `imagePlacement.js`, and IMAGE normalization keeps only `{ mediaId, src, alt }`. Placement sent on draft save was **stripped** from stored draft/published JSON for both products.

| Check | BB | AC |
| --- | --- | --- |
| 1 Upload image | **PASS** | **PASS** |
| 2 Save draft | **PASS** | **PASS** |
| 3 Refresh (edit draft) | **PASS** | **PASS** |
| 4 Preview | **PASS** | **PASS** |
| 5 Publish | **PASS** | **PASS** |
| 6 Reload public page | **PASS** | **PASS** |
| 7 CDN/media URL resolves | **PASS** | **PASS** |
| 8 Image placement persists | **FAIL** | **FAIL** |
| 9 Foreign/cross-tenant media denied | **PASS** | **PASS** |

---

## 1. Environment gate

| Surface | Result |
| --- | --- |
| `https://blessboard.com/healthz` | `ok` · `03a89106e2fe` · `moovex-platform-production` · `schemaCompatible=true` |
| `https://activeclinic.org/healthz` | same |
| Infra / schema / Hostinger env | **Untouched** |
| Personas | BB admin `prod.qa.bb.5e15ca@getproapp.org` · AC admin `prod.qa.ac.bd9d83@getproapp.org` |
| Tenants | `blessboard-disposable-qa-5e15ca` · `activeclinic-disposable-qa-bd9d83` |

---

## 2. Media URL pattern (fresh objects)

Pattern observed on production public delivery:

```text
https://{product-host}/media/production/{product}/{organizationId}/{mediaId}.png
```

| Product | Host | Fresh object (this run) |
| --- | --- | --- |
| BlessBoard | `blessboard.com` | `/media/production/blessboard/02bda31d-e826-4e82-8d47-8b87d8048cec/83235648-4676-4a29-9add-d2113ed28217.png` |
| ActiveClinic | `activeclinic.org` | `/media/production/activeclinic/93205207-3562-4f5c-89de-0f681644c087/d7bcf64b-f458-448d-89c1-6a563f5db1e7.png` |

| Property | Observation |
| --- | --- |
| Namespace | `production/` (not `testing/` / `testing-v8/`) |
| Product segment | `blessboard` / `activeclinic` |
| Tenant segment | Organization UUID |
| Object id | Media UUID + `.png` |
| HTTP GET | **200** `image/png` (anonymous) |
| Bytes | Re-encoded 64×64 PNG (~427 B) from uploaded 64×64 fixture (server-side encode; not byte-identical to upload) |

Platform marketing soft-fill paths (`/media/production/platform/...`) also resolve **200** but were **not** used as lifecycle proof.

---

## 3. BlessBoard lifecycle (fresh)

| Step | Result | Evidence |
| --- | --- | --- |
| Login | **PASS** | Admin → `/hq` |
| Upload `POST /c/{org}/website/media` | **PASS** | `200` · `mediaId=83235648-…` · `published=false` |
| CDN after upload | **PASS** | Absolute `/media/production/blessboard/{orgId}/{mediaId}.png` **200** |
| Draft save `home.hero.image` | **PASS** | `200` · `ok` · content version written |
| Refresh edit draft | **PASS** | Draft HTML contains new `mediaId` / src tail |
| Preview | **PASS** | Draft preview **200** with new media |
| Publish | **PASS** | Publish POST **200** |
| Public reload `/c/…/hq-campus-qa` | **PASS** | Published page embeds fresh CDN URL |
| Placement | **FAIL** | DB published value = `{ mediaId, src, alt }` only — **no** `placement` |

Stored published value (redacted structure):

```json
{
  "v": {
    "alt": "V2_01 prod media 4303f4",
    "src": "https://blessboard.com/media/production/blessboard/02bda31d-…/83235648-….png",
    "mediaId": "83235648-4676-4a29-9add-d2113ed28217"
  }
}
```

---

## 4. ActiveClinic lifecycle (fresh)

| Step | Result | Evidence |
| --- | --- | --- |
| Login | **PASS** | Admin → `/app` |
| Upload `POST /clinics/{org}/website/media` | **PASS** | `200` · `mediaId=d7bcf64b-…` |
| CDN after upload | **PASS** | Absolute `/media/production/activeclinic/{orgId}/{mediaId}.png` **200** |
| Draft save `home.hero.image` | **PASS** | `200` / saved |
| Refresh edit draft | **PASS** | Draft shows new media |
| Preview | **PASS** | **200** with new media |
| Publish | **PASS** | Publish POST succeeds |
| Public reload `/clinics/{org}` | **PASS** | Public HTML embeds fresh CDN URL |
| Placement | **FAIL** | Same strip — published JSON has no `placement` |

---

## 5. Auth negative tests (fresh)

| Test | Result | Detail |
| --- | --- | --- |
| Anonymous BB media upload | **PASS** (denied) | HTTP **403** |
| AC session draft using BB `mediaId`/`src` | **PASS** (denied) | `404` · `ok:false` · `code=media_not_found` |
| BB session draft using AC `mediaId`/`src` | **PASS** (denied) | `404` · `ok:false` · `code=media_not_found` |

Ownership is enforced at draft save via media lookup in the actor’s tenant — foreign media cannot be attached.

---

## 6. Placement root cause (release candidate)

| Fact | Evidence |
| --- | --- |
| RC SHA | `03a89106e2fe` |
| `src/platform/website/imagePlacement.js` on that SHA | **Absent** |
| IMAGE normalize on that SHA | Keeps `mediaId` / `src` / `alt` only |
| Draft payload sent | Included `placement: { v:1, fit, x:28, y:62, zoom:1.35, mobile… }` |
| Persisted draft/published | Placement **removed** for BB and AC |

Shared WE01 placement (V2.01 / V8 testing line) is **not** on this production release candidate. Media file persistence still works.

---

## 7. What was not claimed

- Not a V8 testing / neuniversity proof reuse  
- Not platform marketing CDN soft-fill as tenant lifecycle proof  
- No Hostinger filesystem, env, or migration changes  
- No passwords or vault secrets in this document  

---

## 8. Owner actions

| Priority | Action |
| --- | --- |
| P0 | Treat **media upload + CDN delivery** on disposable tenants as verified on `03a89106e2fe` |
| P0 | Do **not** claim crop/position placement on this RC until a build that includes V2.01 placement ships |
| P1 | When promoting V8 placement to production, re-run this checklist and require `placement` in draft + published JSON + public CSS/attrs |
| P2 | Optional: restore disposable hero images from version history if the stamped QA heroes should not remain live |

---

## 9. Return token

```
V2_01_PROD_MEDIA_PERSISTENCE_QA = FAIL
```

**Why not PASS:** checklist item 8 (placement persistence) fails on the release candidate.  
**Why not BLOCKED:** accounts, hosts, upload, publish, CDN, and auth negatives were executable and produced clear evidence.
