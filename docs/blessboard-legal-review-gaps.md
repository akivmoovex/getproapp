# BlessBoard legal review gaps (internal)

**Status:** Not for publication on blessboard.org. Tracks items that require business or legal counsel before becoming final policy text.

**Last updated:** 2026-07-19 (BB-LEGAL-001 operational drafts on V5 apex)

---

## Public launch status (2026-07-19)

V5 apex routes **`GET /terms`** and **`GET /privacy`** now render structured operational drafts (pending professional legal review).

- Content modules: `src/blessboard/content/termsOfServiceContent.js`, `privacyPolicyContent.js`
- Central metadata: `src/blessboard/config/legalMetadata.js`
- Template: `views/blessboard/v5/apex/legal-page.ejs`
- Pages display an explicit **operational draft** banner.
- **No invented** company registration numbers, physical addresses, support/privacy emails, governing-law jurisdiction, DPO names, or regulators are rendered as facts.

V4 church apex still uses the shorter informational overviews under `views/church/partials/platform_*_body.ejs` (unchanged by BB-LEGAL-001).

---

## Unresolved legal / operator details (owner or counsel)

Populate only via `src/blessboard/config/legalMetadata.js` (`PENDING` keys) after confirmation:

| Field | Status | Notes |
|-------|--------|--------|
| Registered company / operator legal name | **PENDING** | Public brand “BlessBoard” is used; formal entity name not confirmed in repo |
| Company registration number | **PENDING** | Do not invent |
| Legal / correspondence address | **PENDING** | Do not invent |
| Support email | **PENDING** | No dedicated BlessBoard support email in env docs |
| Privacy email | **PENDING** | Same |
| Governing-law jurisdiction | **PENDING** | Terms §20 states pending confirmation |
| Data-protection officer | **PENDING** | Not named |
| Supervisory / regulator authority | **PENDING** | Privacy §19 does not invent one |
| Moovex corporate relationship | **PENDING** | Appears only as Stitch demo copy to avoid; not used as operator identity |
| GetPro relationship | **Documented** | “Built on GetPro technology” (product branding already public) |
| V5 public `/contact` route | **GAP** | Contact path not registered on V5 foundation; drafts point to `/register-church` + directory |
| Cookie consent banner | **GAP** | Not required for current apex (no third-party ad analytics); revisit if analytics added |
| Controller/processor classification | **PENDING** | Jurisdiction-dependent; draft uses cautious language |
| Retention schedules | **PENDING** | See `docs/security/V5_DATA_RETENTION_PRIVACY_INVENTORY.md` |
| Children’s minimum age | **PENDING** | Not stated as a fixed age |
| Refund / billing cycle specifics | **PENDING** | Not invented in Terms §10 |
| Monetary liability cap | **PENDING** | Not invented in Terms §18 |

---

## Privacy Policy (`/privacy`) — remaining counsel items

- [ ] Lawful basis framework for target markets
- [ ] Retention and deletion schedules
- [ ] International transfer wording with named safeguards
- [ ] Formal rights wording per jurisdiction
- [ ] Subprocessor list for publication
- [ ] Children’s age threshold if required
- [ ] Breach notification timelines

---

## Terms of Service (`/terms`) — remaining counsel items

- [ ] Jurisdiction and dispute venue
- [ ] Liability caps (if any)
- [ ] Commercial refund / cancellation terms
- [ ] SLA commitments (if any)

---

## Security / Support

No dedicated BlessBoard support or security email is configured in repository environment variables. Public paths used today:

- `/register-church`, `/directory`, `/login`
- V4 also had `/contact`, `/support`, `/security` — not yet on V5 foundation

---

## Review checklist before calling drafts “final”

1. Legal counsel approves Terms and Privacy text.
2. Fill `PENDING` keys in `legalMetadata.js` (or confirm they remain intentionally omitted).
3. Remove or soften the operational-draft banner only after approval.
4. Run `tests/blessboard-apex-legal.test.js` and related public-page suites.
5. Confirm no placeholder phrases (`TODO`, `lorem ipsum`, invented company numbers) on production pages.
