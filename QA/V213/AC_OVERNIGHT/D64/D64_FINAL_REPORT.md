# D64 final report

Two isolation checks were added to guest booking registration and linking. The booking is re-read in the caller’s organization, and a patient id from another clinic does not get written onto the link. The public booking token is still not revoked. Staff-created patients still do not require a portal. AC-05 was not changed.

G1 passed 325 and failed 0. Live AC-05 denial and portal persistence were not run. No database write, commit, or push was made.
