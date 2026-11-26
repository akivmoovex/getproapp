# G231 clinical printing

Supported print-ready controls now include:

- Patient cards
- Billing/cashier documents
- Laboratory request and laboratory result views
- Radiology request and radiology report views
- Encounter SOAP note and referral print controls on the consultation workspace
- Encounter vitals print control when vitals exist
- Vitals observation log print control
- Pharmacy prescription detail print control

These are `window.print()` regions bound to the authenticated clinical screens.
They do not invent PDF templates or new document policies. Cross-clinic denial
and role gates remain those of the parent clinical and diagnostics routes.

SOAP/referral field-by-field persistence matrices remain separate depth work.
