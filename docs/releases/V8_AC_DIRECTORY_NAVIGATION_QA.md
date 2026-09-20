# V8 ActiveClinic directory navigation QA

**Recorded:** 2026-09-20  
**Branch:** `V8`  
**Priority:** P1  
**Final status:** `V8_AC_DIRECTORY_NAVIGATION_PASS`

## Root cause (BUG-006)

Directory cards previously linked only the title and CTA. Logo/body clicks stayed on
`/clinics`. Fixed earlier by wrapping each card in one `/clinics/:clinicKey` anchor.

## V8 hardening in this pass

| Layer | Change |
|-------|--------|
| Query → href | `presentDirectoryClinic` forces canonical `detailHref` via shared URL helpers |
| Card markup | Rejects mismatched `publicBasePath`; emits `data-ac-clinic-key` |
| CSS | Full-card link remains the hit target (mobile tap friendly) |
| Tests | All cards → matching detail; unpublished excluded; invalid keys fail closed |

## Automated results

| Suite | Result |
|-------|--------|
| `tests/activeclinic-clinic-directory.test.js` | **13/13 PASS** |

## Hosted verification (`activeclinic.neuniversity.org/clinics`)

| Hosted SHA | `9197741a6c36` |

| Check | Result |
|-------|--------|
| Card markup | Full-card `data-ac-clinic-card-link="1"` on every clinic |
| Follow each href | **7/7 → 200** matching clinic detail |
| Browser click (Julflona) | Opens Julflona clinic home |
| Invalid key | **404** |
| Direct published URL | Unchanged |

Evidence: `/tmp/v8-ac-directory/`

## Production

Untouched.
