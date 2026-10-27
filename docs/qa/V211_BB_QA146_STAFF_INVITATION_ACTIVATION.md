# V211-BB-QA146 Staff Invitation Activation

## Executed HTTP lifecycle

Using the existing QA75 HQ session and the authorized disposable database:

- staff invitation POST: `200`
- result page: rendered with `data-bb-staff-invite-result="1"`
- invitation URL field: present and non-empty
- generated URL: validated in process memory as the QA tenant host with
  `/invite/accept` and a token query parameter
- acceptance GET: `200`
- password setup form: present
- acceptance POST: `200`, rendered “Invitation accepted”
- replay GET: `400`, rendered controlled unavailable/invalid invitation

The raw URL/token and password were not logged or written to artifacts.

## Remaining login issue

The newly activated user was persisted as an invited staff identity and the
acceptance route completed, but the subsequent canonical `/login` attempt
returned `400`. `GET /login` on the tenant host redirected to the canonical
login-transfer flow, so the direct local login request did not establish a
staff session. Role dashboard and wrong-tenant access were therefore not
claimed.

No product source, migration, reset, protected database mutation, commit,
push or deployment was performed.
