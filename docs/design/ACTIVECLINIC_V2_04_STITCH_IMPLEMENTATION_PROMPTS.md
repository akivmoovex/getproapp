# ActiveClinic V2.04 — Stitch Implementation Prompts

Bounded Cursor prompts for implementing the Stitch redesign.

| Field | Value |
|---|---|
| **VERSION** | 2.04 |
| **AUTHORITATIVE_MAP** | `docs/design/ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_MAP.md` |
| **STITCH_PROJECT_ID** | `8888814012921999511` |
| **PRIOR_AUDIT** | `docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md` |
| **PRESENTATION_MODEL** | `docs/design/PLATFORM_WEBSITE_PRESENTATION_MODEL.md` |
| **APPLICATION_CANDIDATE** | `4d602f9c715fa6e0ad0c9b5a8999911e123d0582` |

**Rules for every batch**

1. Read the implementation map first. Do **not** re-audit the repository architecture.
2. Stitch = visual source of truth. Platform engines stay singular (draft/publish/version/editor/media).
3. Reuse shared presentation components + AC adapters. No duplicate doctor/service/editor engines.
4. Desktop + mobile = same components (responsive). No duplicate mobile templates.
5. Docs already inventoriied screens — use Stitch MCP only to fetch screenshots/HTML for the screens in-scope.
6. Focused tests only. Commit only when green. Do not deploy production/pronline.
7. Branch = V4.

---

## BATCH 1 — Shared Stitch component extensions

```
TASK=V2_04_AC_STITCH_BATCH_1_SHARED_COMPONENTS
READ: docs/design/ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_MAP.md §3–4, §6–7
STITCH: 8888814012921999511 — sample R01 desktop, R04 doctors, R06 service detail

SCOPE:
- Extend shared person_card for specialty pill + credentials line + book CTA layout
- Extend collection_card offering for icon-tile variant
- Add shared chip/badge if needed
- Chrome token hooks for emergency utility bar (prefer shared partial if BB-reusable; else AC chrome)

OUT OF SCOPE: public page CSS overhaul, hub, editor chrome, migrations

FILES LIKELY:
- views/platform/website/components/*
- public/platform/website-*.css (or product-scoped AC public CSS hooks)
- src/platform/website/presentation/* (only if presentation DTO needs optional chip fields)
- AC presentation adapters (doctor/service) only if mapping new presentation fields

TESTS: existing presentation / component registry tests; architecture dependency test if touched
ACCEPT: STITCH_DOCTOR + SERVICE mapping path remains PersonPresentation / CollectionPresentation
COMMIT only if green. No deploy.
```

---

## BATCH 2 — AC public foundation (R01–R03)

```
TASK=V2_04_AC_STITCH_BATCH_2_PUBLIC_FOUNDATION
READ: map §2.1 R01–R03, §12–13, §15
STITCH screens: R01 D+M, R02 D+M, R03 D+M

SCOPE:
- Visual parity for home / about / services list
- Header, footer, hero, section, CTA, service grids via shared components
- Bind existing presentation fields (home.hero.*, about.*, services)
- Responsive from Stitch mobile companions

OUT OF SCOPE: doctors detail, contact, hub, editor, gallery

ROUTES: /clinics/:clinicKey , /about , /services
TESTS: AC public website smoke / existing website tests focused on home/about/services
ACCEPT: DESKTOP_MOBILE_SHARED_COMPONENTS=YES; no new routes
```

---

## BATCH 3 — Doctors / services detail / contact / booking entry (R04–R08)

```
TASK=V2_04_AC_STITCH_BATCH_3_PUBLIC_CONTENT
READ: map §2.1 R04–R08, §5–7, §16 booking conflict
STITCH: R04–R08 (mobile Stitch; implement responsive)

SCOPE:
- Doctors list + doctor profile via PersonPresentation adapters
- Service detail via CollectionPresentation
- Contact page via contact/hours components
- Booking entry = presentation CTA into EXISTING booking domain (no new booking engine)

OUT OF SCOPE: hub, editor, pricing (missing in Stitch)

ROUTES: existing doctors / services / contact / booking entry
TESTS: catalogue + public page focused tests
ACCEPT: STITCH_DOCTOR_COMPONENT_MAPPING and SERVICE remain EXTENSION_REQUIRED or PASS after Batch 1; no second engines
```

---

## BATCH 4 — Facilities / gallery / patient / CMS (R09–R12)

```
TASK=V2_04_AC_STITCH_BATCH_4_REMAINING_PUBLIC
READ: map §2.1 R09–R12, EXTRA gallery, MISSING pricing/offline

SCOPE:
- Facilities & clinic info (hours/location)
- Gallery via shared gallery + media (prefer CMS page slug over NEW route)
- Patient info & guidance
- Modular CMS page R12

OUT OF SCOPE: invent Pricing Stitch; do not remove platform offline lifecycle shell

TESTS: CMS page + location/contact focused
ACCEPT: NEW routes minimized; media via shared platform media
```

---

## BATCH 5 — Inline editor parity (E01–E02)

```
TASK=V2_04_AC_STITCH_BATCH_5_EDITOR
READ: map §9; public/platform/website-inline-edit.js
STITCH: E01 desktop, E02 mobile

SCOPE:
- Visual/affordance parity for WE01 pencil chrome
- Mobile editor density + UIE framing path already shared
- SHARED_EDITOR_ENGINE_COUNT must remain 1

OUT OF SCOPE: new editor JS engine; hub lifecycle

TESTS: website-inline-edit / media framing tests
ACCEPT: DUPLICATE_EDITOR_ENGINE_REQUIRED=NO
```

---

## BATCH 6 — Website hub (H01–H06)

```
TASK=V2_04_AC_STITCH_BATCH_6_HUB
READ: map §10–11
STITCH: H01–H06 desktop (responsive for mobile)

SCOPE:
- Hub tiles, pages, brand, media, history, settings visual parity
- Wire existing routes under /app/settings/website*
- No duplicate draft/publish/version services

OUT OF SCOPE: Platform Admin console (already separate); production deploy

TESTS: website management / hub focused
ACCEPT: lifecycle engines remain singular
```

---

## BATCH 7 — Responsive + visual parity correction

```
TASK=V2_04_AC_STITCH_BATCH_7_PARITY
READ: map §13, §15
STITCH: sample all public D+M pairs + hub

SCOPE:
- Diff screenshots vs Stitch; fix spacing/typography/hierarchy only
- Confirm mobile-only Stitch screens render correctly at desktop widths via shared CSS
- Confirm hub responsive

OUT OF SCOPE: architecture changes; new fields

ACCEPT: visual parity report with residual DESIGN_CAN_ADAPT items only
```

---

## BATCH 8 — Final regression / freeze

```
TASK=V2_04_AC_STITCH_BATCH_8_FREEZE
READ: map §11, §17

SCOPE:
- Focused BB + AC website regression (presentation, editor, media, hub, architecture dependency)
- Confirm APPLICATION candidate policy: do not replace 4d602f9c… unless deliberate app commits in this program land
- No production / neuniversity / pronline deploy

ACCEPT gates:
  SHARED_EDITOR_ENGINE_COUNT=1
  DUPLICATE_*_ENGINE_REQUIRED=NO
  ARCHITECTURE_BLOCKERS=0
  FINAL=V2_04_ACTIVECLINIC_STITCH_IMPLEMENTATION_READY (for redesign program; freeze when green)
```

---

## Prompt hygiene

- Never paste Stitch API keys into the repo.
- Prefer `get_screen` for in-batch screens only.
- Prefer product-scoped AC CSS for Clinical Clarity tokens; do not restyle BlessBoard marketing with AC teal.
- If a conflict appears that needs a second engine → **STOP** and classify as REAL_ARCHITECTURE_BLOCKER in the map update (docs), do not duplicate.
