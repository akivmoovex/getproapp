# Encounter implementation

An encounter type outside the stored check (`outpatient`, `emergency`, `referral`, `follow_up`, `other`) now returns `invalid_input` before a query. A blank type still means `outpatient`. No status was added. The stored statuses remain `open`, `completed`, and `cancelled`.

Closing an encounter now requires the caller’s organization as well as the facility, the open status, and the version. The closure note is still limited to the stored 500 characters. A miss still returns `stale_version`.

The open-encounter duplicate check for the same patient and facility now also requires that organization. The active-alert list for a facility now requires the organization, and the patient and staff joins match that organization.

Signed notes are still not updated. The draft update still requires `status = 'draft'`. Nothing inserts into `consultation_note_amendments`.
