# Test quality and CI

The latest authorized run is D93. It passed 416, failed 0, and skipped 0, logged at `/tmp/d93-g1.log` and finished `2026-11-15T03:46:45+0200`. CSS lint passed. Those tests include in-memory fakes. A passing G1 test is not persistence evidence.

Stage A is `npm run test:v13:ac`, five files. It does not include D86 through D90. GitHub runs `43654736449` and `43654737245` failed before jobs, so Stage A has no GitHub pass. The D84 push trigger is not applied. Held database and browser jobs stay `if: ${{ false }}`. A local pass is not a GitHub pass.
