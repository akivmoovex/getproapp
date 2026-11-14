# QA coverage certification

Certification is **not certified**.

The conditions that are missing:

- No acceptance ID has verified database evidence. Persistence-sensitive behavior is unproven.
- No browser journey has run. UI workflows have no evidence.
- Live AC-05 denial has not run. Security evidence is in-process or held.
- ActiveClinic Stage A executes 14 cases. It does not execute the D22–D61 tests.
- No SHA-pinned acceptance artifact exists. The ActiveClinic workflow does not require a full SHA.
- G2, G3, and G4 have not run. Eighteen design decisions are still pending.
- Twenty-four features are missing and two are deferred. A feature with only a mock or a source read is not certified.

Fresh G1 passed 321, failed 0, and skipped 0. That count is in-process. It is not certification. The D61 validator rejects a report that turns this count into a pass.
