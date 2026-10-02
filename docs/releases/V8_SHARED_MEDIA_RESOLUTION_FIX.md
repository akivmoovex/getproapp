# V8 Shared Media Resolution Fix

**Recorded:** 2026-09-20  
**Branch:** `V8`  
**Priority:** P1  
**Final status:** `V8_SHARED_MEDIA_HOSTED_PASS`

Code landed in **`f52ee5003609b34a20631ec4af4f3fa5ceacde0b`**. Hosted V8 now serves a tip that includes that fix (`0c873840debe` at verification). Homepages emit `testing/platform/...` on the V8 CDN host and images return `image/*` **200/206**.

---

## Confirmed root cause

Two presentation bugs (not `MEDIA_STORAGE_ROOT`):

1. **Wrong storage-key namespace for shared platform marketing soft-fill**  
   On V8, `storageKeyForPublicPath()` used the **write** namespace `testing-v8/`, producing keys like  
   `testing-v8/platform/blessboard/...`  
   Physical shared marketing files live under **`testing/platform/...`** (synced by V7).  
   Direct proof: V8 `/media/testing/...` → **200 image**; `/media/testing-v8/platform/...` → **404**.

2. **Wrong CDN absolute host fallback**  
   Hostinger sets `MEDIA_PUBLIC_BASE_URL=/media` (relative). Presentation refused relative bases and fell back to  
   `https://blessboard.pronline.org/media` for **both** V7 and V8.  
   V8 HTML therefore pointed at the V7 host with non-existent `testing-v8/` keys → **404**.

**Not the cause:** `MEDIA_STORAGE_ROOT=/home/u549637099/moovex-media` — V8 already serves existing `testing/` objects from that root on `*.neuniversity.org/media/...`.

**`data/uploads` under hbuilds/versions:** application/ephemeral upload path inside the release tree. Website media uses `MEDIA_STORAGE_ROOT` (`moovex-media`) via `mountHostingerMediaStatic` / Hostinger media adapter — **unrelated** to the missing homepage images.

---

## Failing image URLs and HTTP statuses (pre-fix hosted)

| Page | Example `img src` | Status | Content-Type |
|------|-------------------|--------|--------------|
| `https://blessboard.neuniversity.org/` | `https://blessboard.pronline.org/media/testing-v8/platform/blessboard/brand/blessboard-small-church-logo.png` | **404** | `text/plain` |
| same | `.../testing-v8/platform/blessboard/homepage/desktop-hero-auditorium.jpg` | **404** | `text/plain` |
| `https://activeclinic.neuniversity.org/` | `.../testing-v8/platform/activeclinic/stitch/ACW01-01-...jpg` | **404** | `text/plain` |
| `https://activeclinic.neuniversity.org/clinics/julflona-clinic` | `.../testing-v8/platform/activeclinic/clinic/julflona-hero.jpg` | **404** | `text/plain` |

Classification: **existing Hostinger platform marketing files**, wrong **key namespace** + wrong **CDN host** in HTML. Not external URLs; not DB payload blobs for these soft-fill assets.

### Working counterparts

| URL | Status |
|-----|--------|
| `https://blessboard.neuniversity.org/media/testing/platform/blessboard/brand/blessboard-small-church-logo.png` | **200** `image/png` |
| `https://activeclinic.neuniversity.org/media/testing/platform/activeclinic/stitch/ACW01-01-...jpg` | **200** `image/jpeg` |
| V7 `https://blessboard.pronline.org/media/testing/platform/...` (homepage) | **200** |

---

## Effective media storage root

| Setting | Value |
|---------|-------|
| `MEDIA_STORAGE_ROOT` | `/home/u549637099/moovex-media` (unchanged; correct) |
| `MEDIA_PUBLIC_BASE_URL` | `/media` (relative; unchanged) |
| `MEDIA_PUBLIC_MOUNT_PATH` | `/media` (unchanged) |
| V8 write namespace | `testing-v8/` (unchanged for **new** tenant uploads) |
| Shared marketing **read** key | `testing/platform/...` |

---

## Evidence of existing-file readability

No Hostinger SSH from this agent. Readability proven via **HTTP** against the live V8 media mount on both product hosts and the hub:

- `GET /media/testing/platform/...` → **200** image on `blessboard.neuniversity.org`, `activeclinic.neuniversity.org`, and `neuniversity.org`.
- Same keys under `testing-v8/platform/...` → **404**.

Filesystem credentials were not exposed. No media was copied, migrated, or deleted.

---

## Difference between V7 and V8 media resolution (before fix)

| Aspect | V7 | V8 (broken) |
|--------|----|-------------|
| Marketing key | `testing/platform/...` | `testing-v8/platform/...` |
| CDN host in HTML | `blessboard.pronline.org` | same (fallback) |
| File on disk | present under `testing/` | same files; V8 asked for wrong key |
| Mount | `/media` → `MEDIA_STORAGE_ROOT` | same; mount healthy |

After fix (code):

| Aspect | V8 (fixed) |
|--------|------------|
| Marketing key | `testing/platform/...` (read namespace) |
| CDN host fallback | `https://blessboard.neuniversity.org/media` |
| New uploads | still `testing-v8/{product}/{org}/{id}.*` |
| Stale `testing-v8/platform/...` URLs | coerced to `testing/platform/...` on present |

---

## Changed files

| File | Change |
|------|--------|
| `src/platform/media/platformMarketingAssets.js` | Presentation uses read namespace; `{ forWrite: true }` for sync |
| `src/platform/media/cdnMediaPresentation.js` | Line-aware CDN fallback; coerce mistaken `testing-v8/platform/` keys |
| `scripts/sync-platform-marketing-media-to-hostinger.js` | Write keys use `forWrite: true` |
| `src/platform/http/moovexPlatformRuntimeServer.js` | QA sync endpoint write keys |
| `tests/v8-shared-media-resolution.test.js` | New 14-case regression |
| `tests/v8-shared-website-lifecycle.test.js` | Expect V8 CDN base |
| `scripts/v8/suite-manifest.js` / `run-coverage.js` | Wire tests + coverage targets |

**Not changed:** V7 profiles, production, DB schema, `MEDIA_STORAGE_ROOT` value.

---

## Automated test results

| Gate | Passed | Failed | Skipped |
|------|--------|--------|---------|
| `tests/v8-shared-media-resolution.test.js` | **14** | **0** | **0** |
| Media cluster (CDN + lifecycle + hostinger storage + legacy cleanup) | **52** | **0** | **0** |
| shared-platform | **357** | **0** | **0** |
| compatibility | **272** | **0** | **0** |
| blessboard | **241** | **0** | **0** |
| activeclinic | **104** | **0** | **0** |
| **Full `test:v8:regression`** | **974** | **0** | **0** |

---

## Coverage

`npm run test:v8:coverage` → **PASS** (aggregate lines **91.09%**).

| Module | Lines |
|--------|-------|
| `platformMarketingAssets.js` | **92.39%** |
| `cdnMediaPresentation.js` | **74.29%** (included in gate; aggregate still ≥90%) |

---

## Hosted SHA

| Ref | SHA |
|-----|-----|
| Fix commit | `f52ee5003609b34a20631ec4af4f3fa5ceacde0b` |
| Hosted BB/AC `/healthz` (2026-09-20 re-verify) | `0c873840debe` — includes media fix · `mediaWriteNamespace=testing-v8` · `platformLine=v8` |

---

## Browser / HTTP image verification

| Surface | Result |
|---------|--------|
| Hosted BB homepage logos/heroes/features | **200/206** `image/*`; browser `naturalWidth>0` |
| Hosted AC homepage stitch heroes | **200/206** `image/*` (CDN host `blessboard.neuniversity.org`) |
| Hosted Julflona hero + doctors | **200/206**; hero `naturalWidth=1376`; doctor photos load |
| Julflona services icons | **200/206** `image/svg+xml` |
| Direct V8 `/media/testing/platform/...` on BB + AC hosts | **200** |
| Mistaken `/media/testing-v8/platform/...` | still **404** (expected — files live under `testing/`) |
| HTML `testing-v8` soft-fill leaks on V8 pages | **0** |
| V7 BB/AC homepage images | unchanged **200/206** under `testing/platform/` |
| New V8 write namespace | preserved `testing-v8/` (unit coverage) |

---

## V7 compatibility

| Check | Result |
|-------|--------|
| `https://blessboard.pronline.org/` hero | **200** `image/jpeg` under `testing/platform/` |
| V7 hub / media tests | Included in regression **PASS** |
| V7 Hostinger env | **Not modified** |

---

## Production untouched

| Check | Result |
|-------|--------|
| `https://blessboard.com/healthz` | **200** — `moovex-platform-production` / `gitSha=d4f5b190074d` |
| Production deploy / DB migrate | **Not performed** |

---

## Remaining blockers

None for shared website media delivery on hosted V8.

Optional follow-up (not required for PASS): disposable authenticated V8 CMS upload → confirm write key under `testing-v8/` and public URL 200 after publish (covered by unit suite today).

No change to `MEDIA_STORAGE_ROOT` is recommended.

---

## Final status

**`V8_SHARED_MEDIA_HOSTED_PASS`**

Reason: shared presentation reads `testing/platform/` marketing keys and uses the V8 CDN host; Hostinger mount serves existing files; browser + HTTP verification green on BB and AC V8; V7 unchanged; write namespace remains `testing-v8/` for new uploads.
