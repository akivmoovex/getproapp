# BlessBoard legal review gaps (internal)

**Status:** Not for publication on blessboard.com. Tracks items that require business or legal counsel before becoming formal policy text.

**Last updated:** 2026-07-12 (public launch metadata pass)

---

## Public launch status (2026-07-12)

The following are **live on blessboard.com** as approved informational overviews:

- Privacy, Terms, Security, and Support pages use body partials under `views/church/partials/platform_*_body.ejs`.
- EJS comments in privacy/terms partials reference this document until formal legal text replaces the overviews.
- **No internal checklist content** from this file is rendered on public pages.

Formal legal documents still required before calling Privacy/Terms “final.”

---

## Privacy Policy (`/privacy`)

Public page currently publishes **factual information practices** only. The following are **not yet approved** as formal legal policy:

- [ ] Lawful basis / consent framework (GDPR, POPIA, or other jurisdictions)
- [ ] Data retention and deletion schedules for platform inquiries, sessions, and audit logs
- [ ] International data transfer statements
- [ ] Data subject rights (access, correction, erasure, portability)
- [ ] Processor / controller roles between BlessBoard, GetPro, and individual churches
- [ ] Cookie consent banner requirements (if mandated for target markets)
- [ ] Children’s data / minimum age
- [ ] Third-party subprocessors list (hosting, database provider)

**Approved for public use today:** factual descriptions of cookies, form fields, tenant separation, and contact path (see `views/church/partials/platform_privacy_body.ejs`).

---

## Terms of Service (`/terms`)

Public page currently publishes **operational terms overview** only. The following require legal review:

- [ ] Limitation of liability and warranty disclaimers
- [ ] Acceptable use enforcement and suspension rights
- [ ] Intellectual property (platform vs church content)
- [ ] Payment, billing, and plan terms (if commercial terms apply)
- [ ] Dispute resolution and governing law
- [ ] Service level commitments (if any)

**Approved for public use today:** high-level platform scope, church responsibility, and account access expectations (see `views/church/partials/platform_terms_body.ejs`).

---

## Security page (`/security`)

Public page describes **verified technical controls from the codebase**. Do **not** add until documented elsewhere:

- [ ] Compliance certifications (SOC 2, ISO 27001, etc.)
- [ ] Encryption at rest / in transit marketing language beyond factual TLS/database transport
- [ ] Backup frequency, RPO/RTO, disaster recovery
- [ ] Data residency / geographic storage guarantees
- [ ] Breach notification timelines
- [ ] Dedicated security contact email or bug bounty program

---

## Support

No dedicated BlessBoard support email or phone is configured in repository environment variables. Public support remains:

- `/support`, `/contact`, `/register-church`, `/churches`, `/churches?for=admin`

---

## Review checklist before replacing overview pages with formal legal text

1. Legal counsel approves final Privacy Policy and Terms of Service documents.
2. Replace body partials or add versioned legal content source.
3. Run `tests/church-platform-public-legal.test.js` — must pass with no placeholder phrases.
4. Confirm no new prohibited claims (`encrypted`, `guaranteed uptime`, compliance badges) in tests.
