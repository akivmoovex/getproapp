# Idempotency review

Public booking requests store `idempotency_key`. Migration `019_public_website_and_booking.sql` declares `UNIQUE (organization_id, idempotency_key)`.

`createConsultationBookingRequest` selects that pair before insert. A hit returns `duplicate: true` and does not insert another request. `findPublicBookingByIdempotencyKey` does the same lookup for a retry after the draft cookie is gone. An in-process double confirmed the same key in one organization is a duplicate and the same key in another organization is `not_found`. A non-UUID organization id returns `invalid_input` before a query.

That key does not lock an appointment slot. Two different keys can still request the same time. Staff `createAppointment` has no idempotency key. A repeated staff submit is a second insert unless the staff-overlap read happens to see the first row.

Appointment updates use `expectedVersion`. If the version predicate updates no row, the service rolls back and returns `stale_version`. That protects a lost update of one row. It does not stop two new inserts into the same slot.

Payment idempotency in the billing migration is a different table and was not treated as appointment capacity.
