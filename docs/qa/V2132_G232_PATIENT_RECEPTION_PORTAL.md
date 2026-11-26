# G232 patient, reception and portal coverage

Patient registration, review, phone preservation, patient-number lookup,
walk-in service selection, queue creation, practitioner worklist, portal
activation/login, logout, and clinic isolation have existing local HTTP and
browser evidence. G223 adds clinic/facility-scoped name and exact-phone
lookup without automatic linking.

Public unknown-person registration remains restricted. Public booking remains
disabled. Production OTP recovery remains blocked by the absent shared
challenge table and is not converted into a test skip or PASS. Hosted
retesting is still required for the locally verified portal and reception
journeys.
