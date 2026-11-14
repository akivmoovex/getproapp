# G1 coverage report

Fresh G1 at `/tmp/d77-g1.log` finished `2026-11-15T01:35:55+0200`. It passed 399 and failed 0. Skipped 0. Database URLs were unset and the write and browser flags were `0`.

The 17 product safeguards from D64 through D76 each have a service-level assertion: a denial code, a missing write, or a stored actor on a fake database. D77 added the two document finalization cases that were only implied by the facility predicate: another facility, and a document that is already final.

That G1 run is not Stage A. `npm run test:v13:ac` still names five files. A passing count of 399 does not mean CI ran those 399 tests.

No row in this G1 run is a persistence pass. A fake database that returns the scripted row is `MOCK_DENIAL` or `IN_MEMORY_RACE_OPEN`.
