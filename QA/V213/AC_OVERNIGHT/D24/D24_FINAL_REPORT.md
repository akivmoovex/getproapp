# D24 final report

Staff create the patient profile. Portal activation is optional and uses either a matching phone and name or a guest booking token. Public booking does not create the portal. Registration redirects to login and does not start a session.

In-process tests confirmed the portal is not required, Zambia phone normalization, duplicate and wrong-organization denial, expired and revoked tokens, and a production OTP block. A valid booking token can still be read twice. Registration responses distinguish several failure reasons.

The safe suite passed 197 tests and failed 0. The new persistence file returned `NOT_RUN`. No patient record was written. Persistence stays `NOT_RUN`, and none of PAT-01-01, PAT-01-02, or PAT-01-03 is a pass.

No product code, database, browser run, message, commit, or push occurred.
