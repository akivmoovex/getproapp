# ActiveClinic V7 — Pass 6 asset parity report

## ACTIVECLINIC_ASSET_INVENTORY (priority)

| file | type | dimensions | format | used by | Stitch ref | quality |
|------|------|------------|--------|---------|------------|---------|
| `clinic/julflona-hero.jpg` | HERO | 1376×768 | JPEG | Juflona home | P22 home exterior | APPROVED_STITCH (CDN max) |
| `platform/home-hero.jpg` | HERO | 1408×768 | JPEG | Platform home | P21 home BG | APPROVED_STITCH (CDN max) |
| `clinic-hero-default.jpg` | CLINIC_PHOTO | 1376×768 | JPEG | default / non-mapped | directory waiting | APPROVED_ALTERNATIVE |
| `clinic/directory-waiting.jpg` | CLINIC_PHOTO | 1376×768 | JPEG | directory cards | directory | APPROVED_STITCH |
| `clinic/directory-dental.jpg` | CLINIC_PHOTO | 1408×768 | JPEG | directory rotation | directory | APPROVED_STITCH |
| `clinic/directory-lab.jpg` | CLINIC_PHOTO | 1408×768 | JPEG | directory rotation | directory | APPROVED_STITCH |
| `doctors/dr-julflona-banda.jpg` | DOCTOR_PHOTO | 1376×768 | JPEG | list/profile/booking | Juflona doctors | APPROVED_STITCH → demo map |
| `doctors/dr-julflona-mwansa.jpg` | DOCTOR_PHOTO | 1376×768 | JPEG | list/profile/booking | choose-doctor | APPROVED_STITCH → demo map |
| `doctors/doctor-fallback.svg` | AVATAR | vector | SVG | missing photos | AC designed | FALLBACK |
| `icons/*.svg` | ICON | vector | SVG | services | Material Symbols alt | APPROVED_ALTERNATIVE |

## PASS6_ASSET_QUEUE (executed)

1. Juflona Home hero — fixed (512→1376 Stitch exterior)
2. Juflona doctor photos — banda/mwansa mapped; nurse fallback
3. Juflona service imagery — SVG icon system (Stitch uses icons, not photos)
4. Platform hero — Stitch BG wired
5. Directory cards — Juflona + rotating approved clinic images
6. Doctor profile — same canonical photoUrl
7–10. Booking consistency / portal / internal — booking uses same map; portal unchanged (no required photography); internal ops icon-only N/A this pass

## FINAL_ASSET_PARITY_MATRIX (priority)

| Screen | Stitch Project | Asset expected | Current | Status | Exact? | Desktop | Mobile | Remaining gap |
|--------|----------------|----------------|---------|--------|--------|---------|--------|---------------|
| Juflona Home | 1781… | Exterior hero | julflona-hero.jpg | MATCHED_ASSET | Yes (CDN) | Improved | Crop OK | LOW_RESOLUTION vs retina |
| Juflona Doctors | 1781… | Doctor portraits | banda/mwansa + SVG nurse | MATCHED_ASSET / FALLBACK | Partial | Improved | Crop OK | Nurse photo ASSET_PARITY_GAP |
| Doctor profile | 1781… | Headshot | canonical photoUrl | MATCHED_ASSET | Mapped | Improved | OK | Name mapping demo-only |
| Services | 1781… | Icons | SVG icons | APPROVED_ALTERNATIVE | No | Improved | OK | Not Material Symbols |
| Pricing | 1781… | None/photo | n/a | NOT_REQUIRED | — | — | — | — |
| Platform Home | 1781… | Hero media | platform/home-hero.jpg | MATCHED_ASSET | Yes (CDN) | Improved | OK | LOW_RESOLUTION; content narrative PRODUCT_DECISION |
| Directory | 1781… | Clinic cards | mapped + pool | APPROVED_ALTERNATIVE | Partial | Improved | OK | Featured chips layout gap (Pass4) |
| Choose doctor | 1781… | Portraits | same map | MATCHED_ASSET / FALLBACK | Partial | Improved | OK | Nurse fallback |

## Honest limits

Stitch `aida-public` defaults to ~512px; `=s2048`/`=s0` tops out ~1376–1408px. Full-page screenshot download URLs are also ~512px. True 2× desktop hero sources are **not available** via current Stitch tooling → remain `LOW_RESOLUTION` / `ASSET_PARITY_GAP` for retina.
