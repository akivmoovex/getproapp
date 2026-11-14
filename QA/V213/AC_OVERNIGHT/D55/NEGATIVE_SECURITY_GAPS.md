# Negative security gaps

| Gap | What exists | What is missing |
|---|---|---|
| AC-05 | In-process router with a pool that returns no platform-admin row | Live 403 for a signed-in lower-privilege user on both test-database routes. A 303 to `/login` is not that denial |
| Portal registration | Service tests reject a missing organization before insert and do not issue a cookie in the service result | A request through the session middleware that proves no cookie was set |
| Password reset | A fake token row for another organization returns `token_invalid`, and a missed consume does not call the password update | A stored token used twice |
| Clinical reads | Source contracts require `organization_id` on joins | A row owned by clinic B returned, or refused, through the HTTP stack |
| Documents | `documentMatchesCallerPatient` returns false for a mismatched patient id | A download of another patient’s file through the route |
| Pharmacy and billing | Empty dispense and a missed invoice update return before the write in a fake pool | A cashier session calling a clinician route, and a second tenant’s invoice id |
| OTP | Memory-store tests reject `1234` unless every testing flag is set | A production process with a real provider. Delivery stays off |

`v13-ac-platform-qa.spec.js` has seven of these journeys and throws `NOT_RUN` before them. That is a hold, not a failed security assertion and not a pass. The BlessBoard spec is a separate file and is not counted here.
