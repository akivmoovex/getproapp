"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePersonDuplicates } = require("../src/platform/person/duplicate");

test("HQ matching service preserves multiple legitimate candidates without merging", async () => {
  const candidates = [
    {
      id: "member-a",
      subjectRef: "member-a",
      organizationId: "org-a",
      productCode: "blessboard",
      firstName: "Shared",
      lastName: "Household",
      phoneNormalized: "+260977001001",
    },
    {
      id: "member-b",
      subjectRef: "member-b",
      organizationId: "org-a",
      productCode: "blessboard",
      firstName: "Shared",
      lastName: "Household",
      phoneNormalized: "+260977001001",
    },
  ];
  const adapter = {
    duplicatePolicy: {
      decide: () => ({ action: "review", blocking: true, overrideAllowed: false, reason: "multiple_candidates" }),
    },
    normalizeProductFields: ({ trusted }) => ({ ok: true, product: trusted }),
    loadDuplicateCandidates: async () => ({ ok: true, candidates }),
    presentMatch: (candidate) => ({ subjectRef: candidate.id, nameHint: "Shared Household" }),
  };
  const result = evaluatePersonDuplicates({
    trusted: { organizationId: "org-a" },
    productCode: "blessboard",
    probe: {
      firstName: "Shared",
      lastName: "Household",
      phoneNormalized: "+260977001001",
    },
    candidates,
    policy: adapter.duplicatePolicy,
    presentMatch: adapter.presentMatch,
  });
  assert.equal(result.ok, true);
  assert.equal(result.blocking, true);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches.map((match) => match.subjectRef), ["member-a", "member-b"]);
});
