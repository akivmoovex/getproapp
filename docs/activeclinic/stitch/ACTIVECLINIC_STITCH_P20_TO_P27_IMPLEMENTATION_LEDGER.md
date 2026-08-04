# ActiveClinic Stitch — P20–P27 Implementation Ledger

**Mission start SHA (P20–P26):** `42234be27cb072859df8bd26cabc7c3557e63a2b`  
**P27 start SHA:** `775131ade26997d7caf9a23dc153a01a9b2f50a8`  
**Branch:** `V6`  
**Production touched:** no · **Deployed:** no · **Pushed:** no

**Stitch design project:** `projects/17813606734422395399` (Public Ecosystem & Booking Flow)  
**Clinical project:** `projects/12272131183982732110` (no P20–P27 screens)

## Discovery

| Item | Result |
|------|--------|
| Juflona Pilot `12272131183982732110` P20–P27 | **0 screens** |
| Public Ecosystem `17813606734422395399` | P20–P26 + P27 |
| P27 stability (2026-08-04) | **30 screens · STABLE** (A=B) |

## Checkpoints

| Phase | Stability | Notes |
|------:|-----------|-------|
| P20–P26 | STABLE | Implemented; ending SHA `775131ad` |
| P27 | STABLE | Patient portal implemented; see `ACTIVECLINIC_STITCH_P27_FINAL_REPORT.md` |

## Final run notes (P27)

- Patient portal under `/clinics/:clinicKey/patient/*`
- Migrations platform `026` + activeclinic `020`
- Visual: FUNCTIONAL_ONLY
- SMS/email delivery: not claimed
