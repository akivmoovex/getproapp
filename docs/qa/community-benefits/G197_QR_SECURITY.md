# G197 QR security

The pass token is 32 random bytes, encoded as base64url. The store keeps the SHA-256 hash and a separate fallback code. The plaintext token is returned only from issue and rotate. The audit helper drops `token`, `code`, and `diagnosis`.

The payload shown to staff is the display name, membership status, person id, and the clinic that presented the code. It has no diagnosis and no local patient id. Validation is server-side. Expired and revoked passes fail. Rotation revokes the previous pass before issuing the next one.

Presentation does not create an introduction, a patient link, a chart, or a ledger row. A second presentation of a valid code can identify the membership again and does not post a benefit. The isolated test server is the only place that accepts `x-community-test-actor`. The foundation server sets `allowTestActor: false`.
