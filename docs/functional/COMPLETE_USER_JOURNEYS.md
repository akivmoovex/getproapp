# Complete user journeys

The executed journeys that pass in the browser are registration denial, password-reset replay, disabled booking, walk-in, and vitals. Sermon, event, announcement, and theme browser journeys are not verified.

Verification for every journey is `IMPLEMENTED_UNVERIFIED` or the more specific status in the traceability matrix, unless [FEATURE_STATUS_AND_GAPS.md](FEATURE_STATUS_AND_GAPS.md) records a G82 class. G37–G44 did not execute HTTP or browser journeys. G82 did, only on `getpro_v13_e2e_g78d2301`. A journey that is not named in that G82 table was not promoted.

## ActiveClinic

### Patient registration

Role: registration staff. Navigation: `/app/patients`. Preconditions: signed in, organisation and facility selected, create permission. Steps: open the form, enter demographics, post. Service: patient service. Persistence: patient row in the organisation. Outcome: a chart id. Errors: invalid fields stay on the form. Security: organisation predicate. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated HTTP.

### Patient lookup

Role: registration or clinical staff. Navigation: `/app/patients`. Preconditions: patient view permission. Steps: search and open the chart. Service: patient query. Persistence: read only. Outcome: the matching chart. Errors: another organisation’s patient is absent. Security: tenant filter. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated HTTP.

### New encounter

Role: clinician with encounter manage, or a nurse starting triage. Navigation: `/app/clinical/start-encounter`. Preconditions: a patient in this facility. Steps: start, then land on the encounter or the vitals form. Service: `startEncounter`. Persistence: an open encounter. Outcome: encounter id. Errors: missing permission is denied. Security: facility scope. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated HTTP.

### Reception

Role: receptionist. Navigation: `/app/reception/check-in` or `/app/reception/walk-in`. Preconditions: check-in permission and a service point in this facility. Steps: choose the point and check in. Service: reception service. Persistence: queue entry. Outcome: queue id. Errors: an empty facility explains that a point is required. Security: points from another facility are hidden. Public booking stays off. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: browser AC-REC-02.

### Nursing

Role: nurse with `activeclinic.triage.record`. Navigation: Start triage, then vitals. Preconditions: an encounter. Steps: record a stored vital type. Service: clinical vitals. Persistence: vital row. Outcome: the encounter shows the vital. Errors: a receptionist is denied. Security: no numeric diagnosis threshold. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: browser AC-REC-03.

### Consultation

Role: clinician. Navigation: the encounter page. Preconditions: encounter manage. Steps: write and sign the note. The banner shows Reception, Laboratory queue, Pharmacy, and Billing only when this staff member already holds that department’s view permission. Service: clinical notes and `selectEncounterHandoffLinks`. Persistence: note row. Outcome: a signed note, with department links that the existing routes still authorize. Errors: a later save cannot overwrite it. A staff member without the department permission does not see that link. Security: amendments table stays unused. The links do not grant a new permission. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated HTTP.

### Laboratory

Role: clinician to order; laboratory staff for the queue. Navigation: encounter order form, then `/app/diagnostics/laboratory/queue`. A preview form is at `/app/diagnostics/laboratory/reference-rules` and does not save a rule. Preconditions: an open encounter; laboratory view for the queue and the preview. Steps: set urgency to routine, urgent, or stat and add a reason. Service: diagnostic fulfillment and `previewReferenceRule`. Persistence: order and, when resulted, result rows. The preview writes nothing. Outcome: the order is on the encounter. Errors: an unknown urgency is rejected. An unapproved preview returns `not_approved`. Security: ranges are caller-supplied only, and the preview uses the signed-in organisation and facility. Status: `PARTIAL`. Dependency: gated G03 and G66, both `NOT_RUN`.

### Pharmacy

Role: clinician for the manual form; pharmacist to dispense. Navigation: prescription order, then `/app/pharmacy`. Preconditions: dose, frequency, and duration; dispense permission for the counter. Steps: save the manual prescription. A queue handoff happens only with a same-organisation catalogue id and a whole number. Without that id the encounter says the prescription was saved and is not on the pharmacy queue. Service: clinical service and `dispensePrescription`. Persistence: order, and dispense rows when the pharmacy path runs. Outcome: remaining quantity cannot be exceeded. Errors: missing dose fields fail before a query. Security: the form stays manual. Status: `PARTIAL`. Dependency: no new picker. Browser coverage is the gated G67 test, which is `NOT_RUN`.

### Billing

Role: billing staff. Navigation: `/app/billing`. Preconditions: billing permission and a facility. Steps: invoice in minor units, take payment, reverse once. Service: billing service. Persistence: invoice, payment, receipt. Outcome: a second reversal is `already_reversed`. Errors: a receptionist is denied. Security: no card processor. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated billing denial.

### Encounter closeout

Role: clinician with manage permission. Navigation: the encounter close action. Preconditions: the encounter is open and the version matches. Steps: post close. Service: `closeEncounter`. Persistence: status closed. Outcome: one close. Errors: `STALE_VERSION` when the version, organisation, or facility does not match. Security: the update predicate includes all four. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated HTTP.

### Record retrieval

Role: clinician. Navigation: `/app/clinical/patients/:patientId/documents`. Preconditions: document permission. Steps: open the text document. Service: clinical document service. Persistence: text rows. Outcome: the document for that patient. Errors: a receptionist is denied. Security: no binary upload. Status: `PARTIAL`. Dependency: migration 043 is not required for this text path.

## BlessBoard

### Church registration

Role: registering administrator. Navigation: the church registration form. Preconditions: a new phone or a verified reuse. Steps: submit church and administrator. Service: registration resolver. Persistence: organisation and church. Outcome: a tenant. Errors: identity conflict. Security: passwords are not logged. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated HTTP.

### Church and branch administration

Role: HQ admin. Navigation: `/hq`. Preconditions: HQ gate. Steps: open branches and settings. Service: church admin. Persistence: branch rows. Outcome: the branch list for this church. Errors: apex is rejected. Security: branch admins stay in their branch. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated HTTP.

### Member registration

Role: HQ create. Navigation: `/hq/members/new`. Preconditions: one CSRF token. Steps: enter address, marital status, kin name, relationship, and kin phone. Service: member parser. Persistence: member row. Outcome: member id, portal not activated. Errors: missing required fields. Security: email stays optional. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated BB-MEM-01.

### Member activation

Role: HQ, then the member. Navigation: invitation, then `/invite/accept`. Preconditions: a separate invitation. Steps: send, then accept. Service: invitation service. Persistence: portal user. Outcome: the member can sign in only after accept. Errors: create alone does not activate. Security: token required. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated activation HTTP.

### Website editing

Role: website editor. Navigation: website content. Preconditions: website edit permission. Steps: edit a section of type `plain_text` for this church. Service: website section service. Persistence: section row when a public page exists. Outcome: a draft section. Errors: a missing church id is refused by the fixture builder. Security: church id is bound. Status: `PARTIAL`. Dependency: public-page rows, which were not inserted.

### Theme application

Role: website editor. Navigation: theme gallery. Preconditions: a BlessBoard theme key. Steps: apply to draft. Service: theme service. Persistence: draft theme. Outcome: the draft uses that theme. Errors: another product’s theme is `invalid_theme`. CSRF mismatch is 403. Security: one token. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: browser not run.

### Draft publishing

Role: website editor. Navigation: publish action. Preconditions: a draft. Steps: publish explicitly. Service: theme and content publish. Persistence: published snapshot. Outcome: draft save alone does not publish. Errors: missing permission. Security: publish is a separate post. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: a public page for live render.

### Sermon management

Role: content editor. Navigation: structured content. Preconditions: content edit. Steps: Add sermon, set date and summary, save. Service: `normalizeStructuredSermonPayload`. Persistence: `preachedAt` and summary. Outcome: the public reader sees the preached time. Errors: the date is not dropped. Security: unpublished stays private. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: browser BB-WEB-09.

### Event management

Role: content editor. Navigation: structured content. Preconditions: content edit. Steps: Add event, set start, end, and location. Service: `normalizeStructuredEventPayload`. Persistence: those fields. Outcome: the event is a real create. Errors: end before start fails the unit expectation. Security: unpublished stays private. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: browser BB-WEB-10.

### Announcements

Role: content editor. Navigation: `/hq/announcements`. Preconditions: announcement permission. Steps: write, set audience `public`, publish. Service: announcement service. Persistence: announcement and audience. Outcome: the public list includes it and the success URL has the id. Errors: a non-public audience stays off that list. Security: church filter. Status: `IMPLEMENTED_UNVERIFIED`. Dependency: isolated BB-ANN-01.

### Media management

Role: content editor. Navigation: announcement upload. Preconditions: the deployment switch. Steps: choose a file. Service: media upload. Persistence: none while disabled. Outcome: the UI names the refusal reason. Errors: disabled, size, CSRF, or type. Security: default off. The 5 MiB limit is BlessBoard media, not a clinical rule. Status: `PARTIAL`. Dependency: do not set the flag here.
