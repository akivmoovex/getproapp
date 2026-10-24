# V211-BB-QA87 Add Member Validation

## QA86 failure

The route handler is `src/blessboard/http/hqMembersAdminRoutes.js:420-548`.
Validation is performed by
`src/blessboard/services/blessBoardStaffAddMemberFormService.js:129-263`.

The rendered form showed `full_name`, `email`, `phone`, and `branch_id`, but
the validator additionally requires:

- `address_line_1`
- valid `marital_status`
- `next_of_kin_name`
- valid `next_of_kin_relationship`
- valid `next_of_kin_phone`

QA86 omitted all five fields. Its real `POST /hq/members/new` returned `400`
and produced no draft token. The subsequent review POST consequently returned
`403` because the draft did not exist.

## Corrected workflow

Using the same authenticated QA75 HQ session and CSRF token, a synthetic
request supplied the missing fields:

```text
full_name=QA87 Member
email=qa87-member@example.test
phone=+260970000087
address_line_1=1 QA Street
marital_status=single
next_of_kin_name=QA Contact
next_of_kin_relationship=sibling
next_of_kin_phone=+260970000088
branch_id=<QA75 HQ branch>
membership_status=pending
```

Results:

- `POST /hq/members/new`: `200`, review draft token created
- `POST /hq/members/new/review` with `action=confirm_create`: `303`
- Redirect: `/hq/members/9de7b247-c0c8-419e-8b29-c4569e10f498/created`
- Member number: `CH-00001`
- Church association: QA75 church
- Initial status: `pending`
- Portal access: `not_activated`
- `user_id`: null, as expected before activation

No member record was inserted directly; the record was created by the
application workflow.

## Classification

`TEST_PAYLOAD_MISMATCH`. No product validation defect was reproduced.
Invitation/account activation and portal sign-in remain follow-up steps.
