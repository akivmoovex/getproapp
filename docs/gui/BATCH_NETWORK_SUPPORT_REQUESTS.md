# BATCH_NETWORK_SUPPORT_REQUESTS — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — entry gate failed  
**Prompt:** 55. IMPLEMENT NETWORK ONBOARDING AND SUPPORT REQUEST WORKFLOW

## Gate

Sources:

- [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) (B11)
- [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](../product/NETWORK_SCREEN_AND_FEATURE_COVERAGE.md) (row 17)
- [`NETWORK_ENTITLEMENT_MATRIX.md`](../product/NETWORK_ENTITLEMENT_MATRIX.md)
- [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md)
- `db/migrations/blessboard/025_create_resources_forms_requests.sql` (`member_requests`)

| Check | Result |
|-------|--------|
| Coverage / blocked class | **NOT_SOFTWARE_FEATURE** — assisted implementation & priority support is an **ops/SLA promise**, not a customer support portal |
| Stitch “support” pair `74cbe4a0…` / `9f400420…` | Mapped as **platform support monitoring → reused for deployment detail**; **≠** Network customer support product |
| Runtime Network entitlement for priority | **None** — `priority_support` is catalogue-only; deliberately **not** in `FEATURE_KEYS` |
| Existing requests module | Member pastoral/ops care: categories **`prayer` \| `pastoral` \| `practical` \| `other`** only; church/branch member-owned |
| Can reuse without unsafe schema? | **No** — Network categories (domain, mailbox, migration, integration, training, priority support) are **HQ/ops** concerns; stuffing them into `member_requests` conflates confidential care with commercial onboarding and breaks the category CHECK |
| Platform-admin support queue for these categories | **No** approved V5 role/surface for Network onboarding tickets (beyond existing platform **inquiries**, which are apex marketing leads — not tenant Network ops) |
| SLA / response-time data | **None** — prompt correctly forbids inventing SLAs |

## Why this batch did not run

Product SoT classifies priority support / assisted onboarding as **NOT_SOFTWARE_FEATURE** (B11). Implementing an in-platform Network support workflow (new categories, priority classification, PA/support queue) would productize an ops/CRM promise the audit and coverage map exclude from the software queue.

Prefer-reuse of the existing requests module is **not** safe here: that module is the member prayer/care queue with a closed category allow-list and member privacy rules. Expanding it for mailbox/domain/migration assistance would require schema + product redesign that invents a ticketing surface beyond “current request capabilities,” contradicting both the prompt stop and B11.

Canonical Stitch “support” screens are **not** available as a Network support portal SoT.

## Unchanged

- No new Network support / onboarding request categories  
- No schema change to `member_requests` for Network ops types  
- No HQ “priority support” request GUI  
- No PA Network support ticket queue  
- No `priority_support` FEATURE_KEY activation  
- No SLA copy or response-time promises  
- Member request privacy / categories unchanged  

## Resume when

1. Product reclassifies assisted onboarding / priority support from **NOT_SOFTWARE_FEATURE** to an approved in-app workflow (or issues an explicit exception prompt), **and**  
2. A design chooses the correct vehicle (extend platform inquiries vs new HQ-scoped request type — **not** member prayer/care categories), **and**  
3. A runtime entitlement policy exists for priority classification (or assisted-only without FEATURE_KEY is documented), **and**  
4. Stitch SoT exists or Stitch match is waived  

Until then: do not re-run this implementation prompt as written.

## Suggested follow-up

Keep commercial language “assisted onboarding / priority support by arrangement.” If product later wants in-app intake only, write `NETWORK_SUPPORT_REQUEST_DESIGN.md` (HQ actor, categories, no SLA, no member internal notes, PA queue roles) **before** any migration.
