# Final implementation status

HEAD is `b8f6b420d25e908de64ba292866c218c32edc30c` on `V13` in `/private/tmp/getpro-v13`. The index is empty. No feature area is fully implemented.

| Bucket | Count | What it contains |
|---|---|---|
| Implemented | 0 | No area has stored acceptance evidence |
| Partial | 17 | 15 source or in-memory areas, plus portal activation and appointment collision, which are prepared and not stored |
| Missing | 5 | Merge, retention, backup and restore, offline writes, accessibility and monitoring |
| Deferred | 2 | Break-glass and Juflona signing |

D64 scoped guest-booking reads and refused a patient id from another clinic. D65 reached the existing payment duplicate return and did not add a slot lock. D66 scoped radiology, laboratory verify, and dispense updates to the caller organization. D67 blocked a required `NOT_RUN` row and a mock-only pass. D68 prepared G2 and G3 and did not run them. D69 re-ran G1 at 344 passed.

Staff-created patients still do not require a portal. Registration still does not open a session. The public booking token is still not revoked. Capacity is still `BLOCKED_APPROVAL_REQUIRED`.
