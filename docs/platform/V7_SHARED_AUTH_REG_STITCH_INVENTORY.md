# V7 Shared Auth & Registration — Stitch Inventory

**Stitch project:** `9585058196210789597`  
**URL:** https://stitch.withgoogle.com/projects/9585058196210789597

## Scope split

| Category | Count | Action |
|----------|------:|--------|
| Website Editor (WE01-*) | 40 | **Do not modify** — existing V7 implementation |
| Auth / Registration (new) | 22 canonical + 2 component states | **Implement** |
| **Total project screens** | 64 | |

---

## Auth & Registration frames (canonical routes)

| Stitch ID | Stitch frame | Product | Surface | Step/state | Viewport | V7 route | Status |
|-----------|--------------|---------|---------|------------|----------|----------|--------|
| `6a20746a448843b2a42adc97b0d09bb6` | Clinic Details (Step 1) | ActiveClinic | Registration | clinic | Desktop 2560 | `/register-clinic?step=clinic` | IN_PROGRESS |
| `f49c0c5e7f234b94a884530ba09e4445` | Clinic Details (Step 1 - Mobile) | ActiveClinic | Registration | clinic | Mobile 780 | `/register-clinic?step=clinic` | IN_PROGRESS |
| `76b1af161e364ca2beeaef5f83a3a5c5` | Administrator (Step 2) | ActiveClinic | Registration | administrator | Desktop | `/register-clinic?step=administrator` | IN_PROGRESS |
| `2065a91b2ec842818ace97932ee5490a` | Administrator (Step 2 - Mobile) | ActiveClinic | Registration | administrator | Mobile | `/register-clinic?step=administrator` | IN_PROGRESS |
| `ee1f464929504a14860250b574cb72cc` | Review (Step 3) | ActiveClinic | Registration | review | Desktop | `/register-clinic?step=review` | IN_PROGRESS |
| `08fb53a647d04b81b1fcf0914e5c56ab` | Review (Step 3 - Mobile) | ActiveClinic | Registration | review | Mobile | `/register-clinic?step=review` | IN_PROGRESS |
| `a621bbc13d2542789cb76cb0c905b248` | Login (Email) | ActiveClinic | Login | email | Desktop | `/login?mode=email` | IN_PROGRESS |
| `32ba00f78ae7452e92efdd1caf83ed95` | Login (Phone) | ActiveClinic | Login | phone | Desktop | `/login?mode=phone` | IN_PROGRESS |
| `66be13050fbc4d6e8cac85317efa1b81` | Login (Mobile) | ActiveClinic | Login | email default | Mobile | `/login` | IN_PROGRESS |
| `7ad4c4f273244555a7e2e38f242ce70e` | Login (Phone - Mobile) | ActiveClinic | Login | phone | Mobile | `/login?mode=phone` | IN_PROGRESS |
| `5291ef1984704ab784f4412f3fd3cdd4` | Church Details (Step 1) | BlessBoard | Registration | church | Desktop | `/register-church?step=church` | IN_PROGRESS |
| `556349a39ca14d84843812e6a3b3c4cb` | Church Details (Step 1 - Mobile) | BlessBoard | Registration | church | Mobile | `/register-church?step=church` | IN_PROGRESS |
| `ed81db2e3ea24836a8ac1f4105ee65a1` | Administrator (Step 2) | BlessBoard | Registration | administrator | Desktop | `/register-church?step=administrator` | IN_PROGRESS |
| `97905780e8dd4cc8909dd6346c7801d7` | Administrator (Step 2 - Mobile) | BlessBoard | Registration | administrator | Mobile | `/register-church?step=administrator` | IN_PROGRESS |
| `62b47e4c10ff48038f6214be63e27f6f` | Review (Step 3) | BlessBoard | Registration | review | Desktop | `/register-church?step=review` | IN_PROGRESS |
| `f87691d9445a4d40b2b0aa76a9087f30` | Review (Step 3 - Mobile) | BlessBoard | Registration | review | Mobile | `/register-church?step=review` | IN_PROGRESS |
| `fe47583c9b704d13b073533ccbf2138e` | Login (Email) | BlessBoard | Login | email | Desktop | `/login?mode=email` | IN_PROGRESS |
| `c44921a29bec49de88cbdfefd8bf18ca` | Login (Phone) | BlessBoard | Login | phone | Desktop | `/login?mode=phone` | IN_PROGRESS |
| `7322dce6c60c41ba941ddd73c62b57a9` | Login (Mobile) | BlessBoard | Login | email default | Mobile | `/login` | IN_PROGRESS |
| `d5329645fde14b33ad68fd5394c17174` | Login (Phone - Mobile) | BlessBoard | Login | phone | Mobile | `/login?mode=phone` | IN_PROGRESS |
| `5401decf668b42c8b84c6f2e3873d702` | Auth Component States | Platform | Components | states | Desktop | N/A (reference) | IN_PROGRESS |
| `42e989036aa347a9aa871c83f2eff575` | Auth Component States | Platform | Components | states | Mobile | N/A (reference) | IN_PROGRESS |

## Stitch layout tokens (measured from frames)

| Token | Desktop | Mobile |
|-------|---------|--------|
| Reference viewport | 2560×2048 (design) / 1280 live QA | 780×1768 |
| Content max width | ~1200px centered | full width − 32px gutter |
| Registration columns | ~38% feature / ~62% form | stacked per frame |
| Stepper | numbered 1–3 with labels | compact progress |
| Login layout | split: feature panel + form card | header + form; feature collapsed |
| Identifier selector | Email \| Phone pill tabs | same |
| Input height | ~48px | ~48px touch |
| Primary CTA | full width in form column | full width |

## Product themes (from Stitch)

| Token | ActiveClinic | BlessBoard |
|-------|--------------|------------|
| Primary | `#006068` teal | `#6C5CE7` violet |
| Primary strong | `#004f56` | `#5a4bd4` |
| Background | `#f8f9ff` | warm neutral |
| Surface | `#ffffff` | `#ffffff` |
