# V2.01 BB / AC Release Notes Update QA

**Task:** `V2_01_BB_AC_RELEASE_NOTES_UPDATE`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Deployment:** `moovex-platform-v8-testing` only  
**Production:** **untouched** — do not promote

**Application / functional commit (hosted validation):** `2c58a9fbdec2` (`2c58a9fbdec2dac4a7604f946e7e8e9fcb2d0200`)  
**Release tip under test (includes this QA doc):** `67d17d8af5d9` (`67d17d8af5d9…`)  
**Note:** Tip is ahead of the functional RNC commit by this documentation commit only — expected, not a mismatch blocker.

---

## Verdict

**`V2_01_BB_AC_RELEASE_NOTES_UPDATE_PASS`**

Existing shared Release Notes Center updated for completed V2.01 shared website editor work. Hub + BlessBoard + ActiveClinic `/release-notes` serve product-aware sanitized notes on tip `2c58a9fbdec2`. Internal evidence remains gated (public sanitized; Evidence withheld without `platform_admin` / valid token). Production remains `03a89106e2fe` / `moovex-platform-production`.

---

## 1. Exact verified URLs

| URL | Result |
| --- | --- |
| `https://neuniversity.org/release-notes` | **200** · shared hub · `data-audience=public` |
| `https://neuniversity.org/release-notes/2.01` | **200** · includes editor final **66/66** + P2 **48/48** + facility/network limitations |
| `https://neuniversity.org/release-notes/2.01/qa` | **200** · public · Evidence column withheld |
| `https://neuniversity.org/release-notes/2.01/share` | **200** · sanitized public share |
| `https://blessboard.neuniversity.org/release-notes` | **200** · BlessBoard + Shared default context |
| `https://blessboard.neuniversity.org/release-notes/2.01` | **200** · BB inline + shared editor; infra Package A feature id filtered out |
| `https://blessboard.neuniversity.org/about` | **200** · testing link to BlessBoard Release Notes |
| `https://activeclinic.neuniversity.org/release-notes` | **200** · ActiveClinic + Shared default context (was **404** before this change) |
| `https://activeclinic.neuniversity.org/release-notes/2.01` | **200** · shared final; no BB-only inline feature id |
| `https://activeclinic.neuniversity.org/about` | **200** · testing link to ActiveClinic Release Notes |
| `https://neuniversity.org/platform/release-notes-center.css?v=v2-01-rnc-3` | **200** |
| `https://blessboard.neuniversity.org/login` | **200** |
| `https://activeclinic.neuniversity.org/login` | **200** |
| `https://blessboard.com/healthz` | **200** · `03a89106e2fe` · `moovex-platform-production` |

Hosted `/healthz` on hub + BB + AC: `gitSha=2c58a9fbdec2` · `deploymentCode=moovex-platform-v8-testing` · `environment=testing`.

---

## 2. Content and navigation changes

### Catalog / docs (same Release Notes Center — not a second system)

- Version **2.01** summary, QA verification, pending/known limitations updated from editor QA packets.
- Shared features: Change Manager (hosted), image payload/placement, Universal Image Editor, sections, theme infra/gallery, first additional themes, HQ/branch cards, final integrated QA, P2 gap closure.
- BlessBoard-specific: inline WE01 parity.
- ActiveClinic-specific: single clinic website; **no** facility websites / Change Website.
- Explicit non-claims: AC facility websites, network-wide publish, remaining Stitch theme packs, palette editor, three-column studio.
- Verified against source reports: final integrated **66/66** hosted PASS; P2 **48/48** hosted PASS.

### Routes / product context

- Mounted shared RNC middleware on ActiveClinic foundation (product host).
- Host default product filter: `blessboard.*` → BlessBoard + Shared; `activeclinic.*` → ActiveClinic + Shared; hub → all.
- `?all_products=1` or explicit `?product=` overrides.
- Header nav: Home/QA Hub, Overview, cross-product / All products links, Health.
- Testing-only About footer links on BB apex + AC public About.
- Hub launcher lists product `/release-notes` links from deployment apex hosts.

### Authorization (preserved)

| Audience | Behavior |
| --- | --- |
| Public / ordinary tenants | Sanitized notes; no Evidence column; docs paths withheld on QA panel |
| `platform_admin` session (BB apex) | Internal evidence unlock (existing) |
| Shared internal token | Preserved |
| Bad / missing token | Stays public |
| Production `DEPLOYMENT_ENV` | Center refused |

---

## 3. Files changed

| Path | Change |
| --- | --- |
| `src/platform/release-notes/releaseNotesCatalog.js` | V2.01 editor features + QA checklist + limitations |
| `src/platform/release-notes/releaseNotesService.js` | BB/AC filter includes Shared without other-product bleed |
| `src/platform/release-notes/attachReleaseNotesRoutes.js` | Host product context defaults |
| `src/activeclinic/http/activeClinicFoundationServer.js` | Mount RNC on AC |
| `src/platform/http/moovexPlatformRuntimeServer.js` | Hub product RNC links |
| `views/platform/release-notes/partials/header.ejs` | Product nav |
| `views/platform/release-notes/overview.ejs` | Product context copy |
| `views/blessboard/v5/apex/about.ejs` | Testing Release Notes link |
| `views/activeclinic/public/about.ejs` | Testing Release Notes link |
| `docs/releases/RELEASE_NOTES.md` | Canonical 2.01 index update |
| `tests/v2-01-release-notes-center.test.js` | Product host + catalog assertions |
| `docs/qa/V2_01_BB_INLINE_EDITOR_PARITY_QA.md` | Evidence packet (added) |
| `docs/qa/V2_01_SHARED_IMAGE_PAYLOAD_QA.md` | Evidence packet (added) |
| `docs/qa/V2_01_SHARED_EDITOR_P2_GAP_CLOSURE_QA.md` | Evidence packet (added) |
| `docs/qa/references/v2-01-p2-gap-closure/*` | Hosted P2 screenshots |
| `docs/qa/V2_01_BB_AC_RELEASE_NOTES_UPDATE_QA.md` | This report |

---

## 4. Tests and hosted results

### Automated

`node --test tests/v2-01-release-notes-center.test.js` → **26/26 PASS**

### Hosted validation (functional tip `2c58a9fbdec2`; current tip `67d17d8af5d9` docs-only ahead)

Scripted checks: **32/32 PASS** covering hub/BB/AC routes, product context, 66/66 + 48/48 content, limitations, public sanitization, unauthorized Evidence deny, About links, login 200, CSS, production SHA unchanged.

Desktop + ~390px: RNC CSS retains `@media (max-width: 430px)` stacking for header/nav/tabs; hosted HTML includes product nav links on all three hosts.

Login / public website homes: BB + AC `/` and `/login` **200** (no editor regression smoke beyond availability).

Internal token / live `platform_admin` browser unlock: covered by automated suite; live Hostinger token not exercised this run (no secret in agent session).

---

## 5. Final SHA

| Ref | Value |
| --- | --- |
| Functional / validated commit | `2c58a9fbdec2dac4a7604f946e7e8e9fcb2d0200` |
| Hosted tip (this QA doc) | `67d17d8af5d9` |
| Deployment | `moovex-platform-v8-testing` |
| Production | `03a89106e2fe` / `moovex-platform-production` (**untouched**) |

---

## 6. Production untouched confirmation

`https://blessboard.com/healthz` remained `gitSha=03a89106e2fe`, `deploymentCode=moovex-platform-production` after V8 deploy. No production push or restart performed.

---

## FINAL VERDICT (repeat)

**`V2_01_BB_AC_RELEASE_NOTES_UPDATE_PASS`**
