# G199 identity linking

`linkMember` requires confirmation, role `reception` or `clinic_admin`, and the same clinic as the actor. A facility on the patient must match the actor. The caller must supply the local patient id. A phone without a patient id returns `review_required` and creates no link. Two concurrent confirms produce one link.

A repeat of an existing link returns `already_linked`. A chart read from another clinic returns `cross_clinic_chart`. The link audit does not copy the diagnosis.

PostgreSQL persistence of `community_patient_links` is blocked. The reviewed table is in the unapplied schema file.
