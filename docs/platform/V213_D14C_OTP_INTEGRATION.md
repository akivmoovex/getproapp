# V13 D14C — OTP integration

Activation status: **BLOCKED**.

Production cannot require OTP yet. The migration has not been applied, no provider is configured, and release verification has not been done. A production process stays blocked even if an activation override is present.

BlessBoard and ActiveClinic call the same session gate:

- HQ, branch, and church staff login use the unified staff workflow.
- Member login, forgot password, and member activation have their own workflows.
- Clinic staff login, patient login, clinic and patient password recovery, staff role changes, and role assignment use the same gate.
- Patient portal activation is a separate workflow from public appointment booking.

While activation is blocked, the existing session cookie, CSRF check, role catalogue, and multi-role `/account` choice stay in place. When the policy is active outside production, the gate withholds the session until a matching single-use OTP succeeds. Expired, reused, wrong-purpose, and cross-tenant challenges do not complete a session. Notifications stay on the shared code-only template.
