# ActiveClinic Stitch — P20–P27 Component Map

**Audited:** 2026-08-04
**Stitch design project:** `projects/17813606734422395399` (Public Ecosystem & Booking Flow)  
**Clinical project:** `projects/12272131183982732110` (no P20–P27 screens)

| Component | Phases | Path | Notes |
|-----------|--------|------|-------|
| Public design tokens | P20 | `public/activeclinic/ac-public.css` | Public Sans + teal/navy tokens |
| Platform public header | P20–P21 | `views/activeclinic/partials/public-platform-header.ejs` | |
| Tenant public header | P20,P22+ | `views/activeclinic/partials/public-tenant-header.ejs` | Tenant identity |
| Mobile drawer | P20 | `views/activeclinic/partials/public-mobile-nav.ejs` + JS | Focus trap |
| Platform footer | P20–P21 | `views/activeclinic/partials/public-platform-footer.ejs` | |
| Tenant footer | P20,P22+ | `views/activeclinic/partials/public-tenant-footer.ejs` | Config reference |
| Public shell layout | P20 | `views/activeclinic/layouts/public-shell.ejs` | `data-ac-shell="public"` |
| Clinic card | P21 | partial | Directory |
| Service card | P23 | partial | |
| Doctor card | P23 | partial | |
| Step indicator | P24–P25 | partial | Booking progress |
| Slot list | P24–P25 | partial | Keyboard operable |
| Pending confirmation | P24–P26 | partial | Honest status |
| Unavailable state | P24–P25 | partial | |
| Upload field | P25 | partial | Safe fallback if no AC media |
| Booking summary | P24–P26 | partial | |
