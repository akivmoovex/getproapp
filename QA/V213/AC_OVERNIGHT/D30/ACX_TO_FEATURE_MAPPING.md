# ACX to feature mapping

The original 84 IDs are unchanged. `ACX-001` through `ACX-008` are supplementary and outside the V2.13 release until their decisions are approved. Details are in `SUPPLEMENTARY_ACCEPTANCE_CRITERIA.csv`.

| ACX | D29 uncovered requirement | Package | Owner | Decision | G1 now | Evidence that can close it |
|---|---|---|---|---|---|---|
| ACX-001 | Consent capture and withdrawal | F | ActiveClinic | D29-16 | Characterization of the current type list, withdrawal, and tenant scope only | Database row for grant and withdraw. Browser after a screen is named |
| ACX-002 | Representatives and witnesses | F | ActiveClinic | D29-16 | Not safe. No approved representative record | Database and browser after D29-16 |
| ACX-003 | Structured allergy review before dispense | D | ActiveClinic | D29-17 | Characterization that triage text is not a dispense blocker | Database after a review rule that contains no dose threshold |
| ACX-004 | Clinical accessibility | G | ActiveClinic | D29-18 | Not safe | Browser on the approved screen list |
| ACX-005 | Monitoring | G | Shared Platform and ActiveClinic | D29-18 | Not safe | Operational counters with no patient text and no OTP secret |
| ACX-006 | SLOs, hosting, controller roles | G | Shared Platform | D21-10 and D29-18 | Not safe. No number is proposed | Operational evidence after the numbers are approved |
| ACX-007 | Transactional outbox | G | Shared Platform | D21-02 for the events that would be published | Characterization that no outbox is published | Database commit and rollback after an outbox design. No table is authorized now |
| ACX-008 | Versioned clinical HTTP paths | C | ActiveClinic | D21-02 | Contract that this stage adds no route | Authenticated API and browser evidence after paths are approved |

`ACX-005` also waits on D21-06 for critical-result acknowledgement and on D21-11 for OTP delivery signals. Those monitors must not turn delivery on.

`ACX-008` constrains later routes in packages D, E, and F. Package C is the first clinical surface, not permission to publish paths.

Safe G1 work that does not expand the release:

- ACX-001 may assert the existing allow-list and that another organization is out of scope, in memory.
- ACX-003 may assert the absence of a structured allergy gate.
- ACX-007 may assert that current clinical services do not write an outbox.
- ACX-008 may assert that no new versioned clinical route was added.

Those four results are not acceptance passes. ACX-002, ACX-004, ACX-005, and ACX-006 have no safe G1 assertion until the owner supplies the missing rule, screen list, or number.
