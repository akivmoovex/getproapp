# V8 Shared Media Delivery Fix (PROMPT 02)

**Verdict:** `V8_MEDIA_CODE_PASS`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21  
**Prompt 01 input:** [`V8_QA_BASELINE_AND_MEDIA_AUDIT.md`](./V8_QA_BASELINE_AND_MEDIA_AUDIT.md) (media classified **ALREADY_FIXED**)  
**Prior fix commit:** `f52ee5003609b34a20631ec4af4f3fa5ceacde0b`  
**This prompt tip (pre-commit):** see overnight report after push  
**Production / V7:** untouched  
**Hosted deploy/restart:** **not performed** (overnight rule 10)

---

## Summary

Confirmed shared-media defects (wrong `testing-v8/platform/` soft-fill keys + V7 CDN host fallback on V8) were already corrected in shared presentation/storage code. Prompt 02 verified requirements against that implementation, strengthened automated coverage, and re-confirmed hosted image delivery with **read-only** probes.

No unsafe Hostinger workaround was required. `MEDIA_STORAGE_ROOT=/home/u549637099/moovex-media` remains the durable root; temporary release trees are rejected.

---

## Requirements checklist

| Requirement | Status | Mechanism |
|-------------|--------|-----------|
| Read existing V7 media from shared storage | **PASS** | V8 `assertStorageKeyReadable` allows `testing/`; marketing soft-fill uses `resolveMediaReadEnvironment` → `testing/platform/…` |
| Preserve existing CDN URLs and DB references | **PASS** | `presentRuntimeImageSrc` keeps `testing/{product}/{org}/…` keys; custom absolute `MEDIA_PUBLIC_BASE_URL` honored |
| `testing-v8` for new V8 writes | **PASS** | `resolveMediaEnvironment` → `testing-v8`; `storageKeyForPublicPath(…, { forWrite: true })`; `createHostingerMediaStorage.storeMedia` |
| Never use temporary release dirs for persistent media | **PASS** | `classifyMediaStorageRootPersistence` rejects `hbuilds/versions` / release `media` |
| Preserve tenant ownership + private-media authorization | **PASS** | Namespace write/read gates; product media suites deny cross-tenant/private public routes |
| Do not delete, migrate, or overwrite existing media | **PASS** | No migration/delete in this prompt; presentation coerces keys without rewriting DB rows |

---

## Root cause (confirmed, already fixed)

1. Soft-fill used V8 **write** namespace `testing-v8/platform/…` while shared marketing files live under **`testing/platform/…`**.
2. Relative `MEDIA_PUBLIC_BASE_URL=/media` fell back to **`blessboard.pronline.org`** for V8 HTML.

**Not the cause:** durable `MEDIA_STORAGE_ROOT` (mount already served `testing/` objects).

---

## Code under inspection (no further runtime change required)

| Module | Role |
|--------|------|
| `src/platform/media/platformMarketingAssets.js` | Read vs `{ forWrite: true }` key selection |
| `src/platform/media/cdnMediaPresentation.js` | Line-aware CDN fallback; coerce mistaken `testing-v8/platform/` |
| `src/platform/media/hostingerMediaConfig.js` | Namespaces, persistence probe, read/write assertions |
| `src/platform/media/hostingerMediaStorage.js` | Namespace-strict writes |
| `src/platform/http/mountHostingerMediaStatic.js` | Public `/media` from `MEDIA_STORAGE_ROOT` |
| `src/platform/website/mediaService.js` | Tenant-scoped website media persistence |

---

## Tests added / extended (this prompt)

`tests/v8-shared-media-resolution.test.js` expanded **14 → 18**:

| # | Coverage |
|---|----------|
| 15 | Reject ephemeral `hbuilds/versions` `MEDIA_STORAGE_ROOT` on V8 |
| 16 | Preserve existing `testing/` CDN DB references on V8 present |
| 17 | BB + AC marketing soft-fill render without `testing-v8/platform` |
| 18 | Refuse production write/read + path-escape keys from V8 |

Existing cases 1–14 already covered legacy reads, V8 writes, public mount delivery, BB/AC mapping, invalid paths, and tenant write isolation.

---

## Automated results

| Gate | Result |
|------|--------|
| `tests/v8-shared-media-resolution.test.js` | **18/18 PASS** |
| Media cluster (resolution + website lifecycle + hostinger storage + content library) | **78/78 PASS** |
| `npm run test:v8:regression` | **PASS** in 173.7s — shared-platform **361**, compatibility **276**, blessboard **241**, activeclinic **105** (**983** total, **0** fail) |

Evidence: `/tmp/v8-media-p02/`.

---

## Hosted read-only verification (no deploy)

| Check | Result |
|-------|--------|
| V8 BB homepage media URLs | 6/6 **200** `image/*`; keys `testing/platform/…`; host `neuniversity.org` |
| V8 AC homepage media URLs | 4/4 **200** `image/*`; same pattern |
| Mistaken `testing-v8/platform/…` | still **404** (expected) |
| healthz | `mediaWriteNamespace=testing-v8` · `platformLine=v8` |

**Note:** Hosted `/healthz` SHA may lag `origin/V8` until an authorized deploy. Overnight rules forbid deploy/restart; image delivery already works on the currently hosted build that includes `f52ee500`.

---

## External Hostinger action

**None required for code PASS.**  
Optional (operator, not overnight): authorize a V8 Hostinger pull/restart so `/healthz` `gitSha` matches the latest `origin/V8` tip after this commit. Not a media-delivery blocker.

---

## Final result

| Field | Value |
|-------|-------|
| Runtime defect remaining | **none** identified |
| Unsafe workaround | **not created** |
| Verdict | **`V8_MEDIA_CODE_PASS`** |
