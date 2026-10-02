# ActiveClinic V2.04 Product Contract Scope

**Doc ID:** `V2_04_AC_PRODUCT_CONTRACT_SCOPE`  
**Decision:** PD-V204-AC-01 OPTION B  
**Status:** `TEMPORARY_APPROVED_FOR_V2_04` · `REVIEW_LATER=YES`

## Approved V2.04 scope

- ActiveClinic V2.04 release scope is **presentation/editor-focused** only.
- Website / editor / public presentation functionality may be release-gated and claimed (existing SANITY_PASS retained).
- **Patient** functionality remains **FOUNDATION / non-release-gated** in V2.04 until a canonical ActiveClinic Feature Specification exists.
- Do **not** claim full patient feature certification in V2.04.
- Authoring the full AC canonical FR/AC/BR contract is **later product work** (Option A deferred).

## Related

- Stitch wave decisions in `docs/activeclinic/ACTIVECLINIC_STITCH_PRODUCT_DECISIONS.md` remain in force for presentation waves.
- **PD-V204-AC-P1-01** (`TEMPORARY_APPROVED_FOR_V2_04` · `REVIEW_LATER=YES`): website/editor/presentation track = **PRESENTATION**; patient = non-release-gated **FOUNDATION**; unimplemented = **FUTURE**; invent no new MUST requirements.
- **PD-V204-AC-P1-02** (`TEMPORARY_APPROVED_FOR_V2_04` · `REVIEW_LATER=YES`): public doctor/services output is **allowlist-driven** (`publicCatalogueFieldPolicy.js`); private contact / internal IDs / PHI forbidden.
- **PD-V204-AC-P1-03** (`TEMPORARY_APPROVED_FOR_V2_04` · `REVIEW_LATER=YES`): R08 is presentation/chrome/handoff only to the existing ActiveClinic booking engine — no second booking domain.
