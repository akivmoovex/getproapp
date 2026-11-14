# Implemented features

Two checks were added. No new identity rule was introduced.

| Change | Behavior |
|---|---|
| Password reset lookup | The token is selected with the caller’s organization. An expired token and a consumed token fail before the password is changed |
| Token consume | The patient reset passes the organization into `markConsumed`. Callers that omit it are unchanged |
| Duplicate candidates | A returned row whose `organization_id` is another organization is dropped and is not included in the response |

Staff-created patients still do not require a portal. Registration messages are unchanged, and registration still does not open a session. The public booking token is not revoked. Merge was not added. No production OTP bypass was added.

Facility reads in the department service already require `organization_id`. That predicate was not relaxed.
