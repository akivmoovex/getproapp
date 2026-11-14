# Implementation roadmap

No step is authorized. Clinical design stays unapproved.

1. Keep portal registration and appointment create as they are. Collect evidence only: live AC-05 denial, disposable-database portal activation, and disposable-database staff overlap.
2. Leave encounter states, capacity, and OTP activation on their pending defaults.
3. Prove facility organization filters and duplicate decisions. Do not add merge.
4. Change orders, critical results, substitution, or allergy review only after D21-02, D21-06, D21-07, and D29-17.
5. Keep billing inside ActiveClinic and reversal on the finance supervisor until D21-08.
6. Add no scan quarantine, retention period, or deleter until D21-09 and D29-16.
7. Add no restore, offline writer, monitor, or SLO number until D21-10 and D29-18.
8. Leave break-glass and Juflona deferred.

Dependencies that still block implementation: the 18 decisions above, plus a durable OTP store and a selected provider before any production OTP claim. `048_otp_challenges.sql` does not exist.
