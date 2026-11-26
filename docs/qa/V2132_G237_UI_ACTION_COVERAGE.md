# G237 UI action coverage

Priority mutation and authorization actions have meaningful coverage:
registration, login, logout, patient creation, walk-in queueing, encounter
draft/sign, vitals correction, diagnostic collection/receipt/result/verify,
stocked dispense, website publish, church content publish, invitations,
member activation, Community Benefits search and settlement preview.

Important remaining interaction gaps are the complete radiology browser
journey, independent print-ready verification for every supported clinical
document, and exhaustive SOAP/referral field actions. These are tracked as
P1 depth gaps. Page-load-only tests are not counted as closing them.
