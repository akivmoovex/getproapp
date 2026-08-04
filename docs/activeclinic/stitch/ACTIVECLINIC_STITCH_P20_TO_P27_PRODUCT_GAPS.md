# ActiveClinic Stitch — P20–P27 Product Gaps

**Audited:** 2026-08-04
**Stitch design project:** `projects/17813606734422395399` (Public Ecosystem & Booking Flow)  
**Clinical project:** `projects/12272131183982732110` (no P20–P27 screens)

| ID | Phase | Gap | Severity | Notes |
|----|------:|-----|----------|-------|
| GAP-P20-STITCH-PROJECT | 20 | P20–P27 not in Juflona Pilot project | Info | Use Public Ecosystem project |
| GAP-P20-CMS | 20 | No full CMS | Medium | Typed settings only |
| GAP-P21-STATS | 21 | Stitch may show invented stats | High | Do not invent clinic counts |
| GAP-P21-ONBOARD | 21 | No prior application table | Resolved by migration | Applications pending review |
| GAP-P22-JUFLONA-SEED | 22 | No Juflona org seed | High | Tests provision published tenant; prod needs real data |
| GAP-P23-DOCTORS | 23 | Public doctor profiles | Medium | Only show staff with public profile enabled |
| GAP-P24-SLOTS | 24 | Weak slot engine | High | Honest availability; pending confirmation |
| GAP-P24-SMS | 24 | SMS states in Stitch | High | Do not claim delivery |
| GAP-P25-RESOURCE | 25 | No resource scheduling model | High | Pending clinic confirmation |
| GAP-P25-UPLOAD | 25 | No AC secure upload | High | Upload-pending / clinic follow-up |
| GAP-P25-PREP | 25 | Prep instructions | High | Config only; else clinic-contact guidance |
| GAP-P26-TOKEN | 26 | Patient booking lookup | Medium | Opaque tokens + rate limits |
| GAP-P27-SMS | 27 | Phone verify / recovery OTP delivery | High | Honesty / contact clinic only |
| GAP-P27-VISUAL | 27 | Stitch visual parity | Medium | FUNCTIONAL_ONLY renderer |
| GAP-P27-EMR | 27 | Clinical data in Stitch boundary screens | Info | Intentionally omitted — booking portal only |
| GAP-P27-NOTIFY | 27 | Notifications inbox | Medium | No fabricated messages |
| GAP-P27 | 27 | ~~Screens not in Stitch~~ | Resolved | 30 screens STABLE; implemented with gaps |
