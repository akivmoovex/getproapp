# Patient identity implementation

Staff-created patients still do not require a portal. `assertPatientDoesNotRequirePortal` still returns `requiresPortal: false`.

Phone match is unchanged in its decisions: an existing identity, no patient, several patients, a name mismatch, and another organization still stop before an account is created. A national ID is still not required for that decision. No alternate identifier was invented.

The guest-token path now refuses a booking that already has `portal_platform_identity_id` before it creates an identity. A second phone number cannot take over that booking in this process.

Inside the transaction, the booking row is read with `FOR UPDATE`, and the claim update matches only a row whose portal identity is still null and whose organization is the caller's. The patient claim update matches only a row in that organization whose `platform_identity_id` is still null. A lost race rolls back and returns `link_conflict` or `patient_already_linked`.

Repeating `linkGuestBookingToPatient` for the same portal identity returns the existing link and does not write the booking again.

Public booking lookup still updates `last_used_at` and does not revoke the token. A patient can open the booking receipt more than once. That replay is separate from portal activation.
