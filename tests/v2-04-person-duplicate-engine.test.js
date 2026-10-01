"use strict";

/**
 * V2.04 Phase 2 — shared person duplicate / match engine tests.
 * No UI. No automatic merge. AC public duplicate API characterization preserved.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  PERSON_MATCH_CODE,
  PERSON_MATCH_ACTION,
  scorePersonMatch,
  toActiveClinicMatchStrength,
  evaluatePersonDuplicates,
  BLESSBOARD_DUPLICATE_POLICY,
  ACTIVECLINIC_DUPLICATE_POLICY,
  BASELINE_DUPLICATE_POLICY,
} = require("../src/platform/person/duplicate");

const {
  findPotentialBlessBoardMemberDuplicates,
} = require("../src/blessboard/services/blessBoardMemberDuplicateService");

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("V2.04 scorePersonMatch signals", () => {
  it("exact product identifier → EXACT_IDENTIFIER_MATCH", () => {
    const scored = scorePersonMatch(
      {
        productIdentifiers: [
          { key: "patient_number", valueNormalized: "AC-2026-000001" },
        ],
      },
      {
        productIdentifiers: [
          { key: "patient_number", valueNormalized: "AC-2026-000001" },
        ],
      }
    );
    assert.equal(scored.matchCode, PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH);
    assert.ok(scored.reasons.includes("identifier:patient_number"));
    assert.equal(
      toActiveClinicMatchStrength(scored.matchCode, scored.reasons),
      "strong"
    );
  });

  it("normalized phone alone → STRONG_POSSIBLE_MATCH (not exact identity)", () => {
    const scored = scorePersonMatch(
      {
        phoneNormalized: "+260971234567",
        firstName: "Alice",
        lastName: "Banda",
      },
      {
        phoneNormalized: "+260971234567",
        firstName: "Alice",
        lastName: "Banda",
      }
    );
    assert.equal(scored.matchCode, PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH);
    assert.ok(scored.reasons.includes("phone_exact"));
    assert.equal(scored.matchCode !== PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH, true);
  });

  it("same phone different person remains possible (shared family phone)", () => {
    const scored = scorePersonMatch(
      {
        phoneNormalized: "+260971234567",
        firstName: "Alice",
        lastName: "Banda",
      },
      {
        phoneNormalized: "+260971234567",
        firstName: "Bob",
        lastName: "Banda",
      }
    );
    assert.equal(scored.matchCode, PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH);
    assert.equal(scored.signals.samePhoneDifferentIdentityHint, true);
    assert.ok(scored.reasons.includes("shared_phone_possible"));
  });

  it("same name + DOB → POSSIBLE_MATCH", () => {
    const scored = scorePersonMatch(
      {
        firstName: "Mary",
        lastName: "Phiri",
        dateOfBirth: "1990-05-01",
      },
      {
        firstName: "Mary",
        lastName: "Phiri",
        dateOfBirth: "1990-05-01",
      }
    );
    assert.equal(scored.matchCode, PERSON_MATCH_CODE.POSSIBLE_MATCH);
    assert.ok(scored.reasons.includes("name_and_dob"));
    assert.equal(
      toActiveClinicMatchStrength(scored.matchCode, scored.reasons),
      "moderate"
    );
  });

  it("email + similar name → POSSIBLE_MATCH", () => {
    const scored = scorePersonMatch(
      {
        emailNormalized: "mary@example.com",
        firstName: "Mary",
        lastName: "Phiri",
      },
      {
        emailNormalized: "mary@example.com",
        firstName: "Mary",
        lastName: "Other",
      }
    );
    assert.equal(scored.matchCode, PERSON_MATCH_CODE.POSSIBLE_MATCH);
    assert.ok(scored.reasons.includes("email_and_name"));
  });

  it("no match when demographics diverge", () => {
    const scored = scorePersonMatch(
      {
        firstName: "Ada",
        lastName: "Lovelace",
        phoneNormalized: "+260971111111",
        emailNormalized: "ada@example.com",
        dateOfBirth: "1815-12-10",
      },
      {
        firstName: "Grace",
        lastName: "Hopper",
        phoneNormalized: "+260972222222",
        emailNormalized: "grace@example.com",
        dateOfBirth: "1906-12-09",
      }
    );
    assert.equal(scored.matchCode, PERSON_MATCH_CODE.NO_MATCH);
    assert.deepEqual(scored.reasons, []);
  });

  it("false-positive prevention: name-only is POSSIBLE not EXACT", () => {
    const scored = scorePersonMatch(
      { firstName: "John", lastName: "Smith" },
      { firstName: "John", lastName: "Smith" }
    );
    assert.equal(scored.matchCode, PERSON_MATCH_CODE.POSSIBLE_MATCH);
    assert.ok(scored.reasons.includes("name_only"));
    assert.equal(
      toActiveClinicMatchStrength(scored.matchCode, scored.reasons),
      "weak"
    );
  });

  it("false-positive prevention: phone alone never BLOCK at baseline scoring", () => {
    const scored = scorePersonMatch(
      { phoneNormalized: "+260970000000" },
      { phoneNormalized: "+260970000000" }
    );
    assert.equal(scored.matchCode, PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH);
    const baseline = BASELINE_DUPLICATE_POLICY.decide(scored);
    assert.equal(baseline.action, PERSON_MATCH_ACTION.WARN);
    assert.equal(baseline.blocking, false);
  });
});

describe("V2.04 evaluatePersonDuplicates isolation + policies", () => {
  it("rejects cross-tenant candidates (privacy)", () => {
    const result = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "activeclinic",
      probe: { phoneNormalized: "+260971234567" },
      candidates: [
        {
          id: "p1",
          organizationId: ORG_B,
          productCode: "activeclinic",
          phoneNormalized: "+260971234567",
        },
      ],
      policy: ACTIVECLINIC_DUPLICATE_POLICY,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "cross_tenant_candidate_rejected");
    assert.deepEqual(result.matches, []);
  });

  it("rejects cross-product candidates by default", () => {
    const result = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "blessboard",
      probe: { phoneNormalized: "+260971234567" },
      candidates: [
        {
          id: "p1",
          organizationId: ORG_A,
          productCode: "activeclinic",
          phoneNormalized: "+260971234567",
        },
      ],
      policy: BLESSBOARD_DUPLICATE_POLICY,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "cross_product_candidate_rejected");
  });

  it("BB policy BLOCKs duplicate Church ID / member_number", () => {
    const result = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "blessboard",
      probe: {
        firstName: "New",
        lastName: "Member",
        productIdentifiers: [
          { key: "member_number", valueNormalized: "BB-100" },
        ],
      },
      candidates: [
        {
          id: "m1",
          organizationId: ORG_A,
          productCode: "blessboard",
          firstName: "Existing",
          lastName: "Member",
          productIdentifiers: [
            { key: "member_number", valueNormalized: "BB-100" },
          ],
        },
      ],
      policy: BLESSBOARD_DUPLICATE_POLICY,
    });
    assert.equal(result.ok, true);
    assert.equal(result.overallMatchCode, PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH);
    assert.equal(result.action, PERSON_MATCH_ACTION.BLOCK);
    assert.equal(result.blocking, true);
    assert.equal(result.overrideAllowed, false);
  });

  it("BB policy WARNs on phone / name+DOB possibles without blocking", () => {
    const phone = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "blessboard",
      probe: {
        phoneNormalized: "+260971234567",
        firstName: "A",
        lastName: "One",
      },
      candidates: [
        {
          id: "m1",
          organizationId: ORG_A,
          productCode: "blessboard",
          phoneNormalized: "+260971234567",
          firstName: "B",
          lastName: "Two",
        },
      ],
      policy: BLESSBOARD_DUPLICATE_POLICY,
    });
    assert.equal(phone.overallMatchCode, PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH);
    assert.equal(phone.action, PERSON_MATCH_ACTION.WARN);
    assert.equal(phone.blocking, false);

    const nameDob = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "blessboard",
      probe: {
        firstName: "Mary",
        lastName: "Phiri",
        dateOfBirth: "1991-02-02",
      },
      candidates: [
        {
          id: "m2",
          organizationId: ORG_A,
          productCode: "blessboard",
          firstName: "Mary",
          lastName: "Phiri",
          dateOfBirth: "1991-02-02",
        },
      ],
      policy: BLESSBOARD_DUPLICATE_POLICY,
    });
    assert.equal(nameDob.overallMatchCode, PERSON_MATCH_CODE.POSSIBLE_MATCH);
    assert.equal(nameDob.action, PERSON_MATCH_ACTION.WARN);
    assert.equal(nameDob.blocking, false);
  });

  it("AC policy BLOCKs exact patient identifier and WARN_REVIEW on phone", () => {
    const exact = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "activeclinic",
      probe: {
        productIdentifiers: [
          { key: "patient_number", valueNormalized: "AC-2026-000009" },
        ],
      },
      candidates: [
        {
          id: "p1",
          organizationId: ORG_A,
          productCode: "activeclinic",
          productIdentifiers: [
            { key: "patient_number", valueNormalized: "AC-2026-000009" },
          ],
        },
      ],
      policy: ACTIVECLINIC_DUPLICATE_POLICY,
    });
    assert.equal(exact.overallMatchCode, PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH);
    assert.equal(exact.action, PERSON_MATCH_ACTION.BLOCK);
    assert.equal(exact.blocking, true);

    const phone = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "activeclinic",
      probe: { phoneNormalized: "+260977777777", firstName: "X", lastName: "Y" },
      candidates: [
        {
          id: "p2",
          organizationId: ORG_A,
          productCode: "activeclinic",
          phoneNormalized: "+260977777777",
          firstName: "X",
          lastName: "Z",
        },
      ],
      policy: ACTIVECLINIC_DUPLICATE_POLICY,
    });
    assert.equal(phone.overallMatchCode, PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH);
    assert.equal(phone.action, PERSON_MATCH_ACTION.WARN_REVIEW);
    assert.equal(phone.blocking, true);
    assert.equal(phone.overrideAllowed, true);
  });

  it("default presenter does not leak raw phone/email across tenants", () => {
    const result = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "activeclinic",
      probe: { phoneNormalized: "+260971234567" },
      candidates: [
        {
          id: "p1",
          organizationId: ORG_A,
          productCode: "activeclinic",
          phoneNormalized: "+260971234567",
          emailNormalized: "secret@example.com",
          firstName: "Secret",
          lastName: "Person",
        },
      ],
      policy: ACTIVECLINIC_DUPLICATE_POLICY,
      // no presentMatch → default strip
    });
    assert.equal(result.ok, true);
    assert.equal(result.matches.length, 1);
    const display = result.matches[0].display;
    assert.equal(display.phoneNormalized, undefined);
    assert.equal(display.emailNormalized, undefined);
    assert.equal(display.firstName, undefined);
    assert.equal(display.subjectRef, "p1");
  });

  it("NO_MATCH overall when candidates empty or unrelated", () => {
    const empty = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "blessboard",
      probe: { firstName: "Ada", lastName: "Lovelace" },
      candidates: [],
      policy: BLESSBOARD_DUPLICATE_POLICY,
    });
    assert.equal(empty.overallMatchCode, PERSON_MATCH_CODE.NO_MATCH);
    assert.equal(empty.blocking, false);

    const unrelated = evaluatePersonDuplicates({
      trusted: { organizationId: ORG_A },
      productCode: "blessboard",
      probe: {
        firstName: "Ada",
        lastName: "Lovelace",
        phoneNormalized: "+260971111111",
      },
      candidates: [
        {
          id: "m1",
          organizationId: ORG_A,
          productCode: "blessboard",
          firstName: "Grace",
          lastName: "Hopper",
          phoneNormalized: "+260972222222",
        },
      ],
      policy: BLESSBOARD_DUPLICATE_POLICY,
    });
    assert.equal(unrelated.overallMatchCode, PERSON_MATCH_CODE.NO_MATCH);
    assert.equal(unrelated.matches.length, 0);
  });
});

describe("V2.04 BlessBoard member duplicate adapter", () => {
  it("wraps shared engine with BB policy", () => {
    const blocked = findPotentialBlessBoardMemberDuplicates({
      trusted: { organizationId: ORG_A },
      probe: {
        productIdentifiers: [
          { key: "member_number", valueNormalized: "CH-9" },
        ],
      },
      candidates: [
        {
          id: "member-1",
          memberNumber: "CH-9",
          firstName: "Existing",
          lastName: "Person",
        },
      ],
    });
    assert.equal(blocked.ok, true);
    assert.equal(blocked.blocking, true);
    assert.equal(blocked.action, PERSON_MATCH_ACTION.BLOCK);
  });
});

describe("V2.04 AC strength mapping compatibility", () => {
  it("maps shared codes onto legacy AC strong/moderate/weak labels", () => {
    assert.equal(
      toActiveClinicMatchStrength(PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH, [
        "identifier:nrc",
      ]),
      "strong"
    );
    assert.equal(
      toActiveClinicMatchStrength(PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH, [
        "phone_exact",
      ]),
      "strong"
    );
    assert.equal(
      toActiveClinicMatchStrength(PERSON_MATCH_CODE.POSSIBLE_MATCH, [
        "name_and_dob",
      ]),
      "moderate"
    );
    assert.equal(
      toActiveClinicMatchStrength(PERSON_MATCH_CODE.POSSIBLE_MATCH, ["name_only"]),
      "weak"
    );
    assert.equal(
      toActiveClinicMatchStrength(PERSON_MATCH_CODE.NO_MATCH, []),
      null
    );
  });
});
