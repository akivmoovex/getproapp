# V2132 G259 full regression

Commit under test before docs commit: `157b2fc4…` then this handoff commit.  
Environment: disposable `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`; Playwright g80; no real email.

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Safe | 615 pass / 0 fail / 2 skip | same |
| HTTP g79 | 41 / 40 / 1 (D25 slot) | same |
| AC Playwright | 32 pass; one intermittent AC-FU-WEB-02 flake then 32×2 PASS on rerun | 32×2 PASS |
| BB Playwright | 23 | 23 |
| Community mock | 9 | 9 |
| D14C/D16/G185/G272 | PASS | PASS |
| D25 overlap | PASS | PASS |
| D25 slot | FAIL expected | FAIL expected |

Commands: standard safe node --test glob; `node .v13-isolated-pg/g79-run.cjs`; `node .v13-isolated-pg/g80-playwright.cjs ac|bb`; community Playwright config.
