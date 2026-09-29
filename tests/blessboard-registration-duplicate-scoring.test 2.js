"use strict";

/**
 * Phase2 Prompt 046 — deterministic duplicate scoring (no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  RISK_LEVELS,
  SIGNAL_WEIGHTS,
  STRONG_MIN,
  scoreRegistrationDuplicateMatch,
  scoreRegistrationDuplicateMatches,
} = require("../src/blessboard/services/registrationDuplicateScoring");

const NOW = "2026-07-24T12:00:00.000Z";

function subject(overrides = {}) {
  return {
    id: "subj-1",
    type: "application",
    churchName: "Grace Community Church",
    city: "Lusaka",
    country: "Zambia",
    contactEmail: "pat@example.com",
    contactPhone: "+260971234567",
    contactPhoneNormalized: "+260971234567",
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    id: "cand-1",
    type: "application",
    churchName: "Other Church",
    city: "Ndola",
    country: "Zambia",
    contactEmail: "other@example.com",
    contactPhone: "+260977000001",
    contactPhoneNormalized: "+260977000001",
    ...overrides,
  };
}

function score(opts) {
  return scoreRegistrationDuplicateMatch({ now: NOW, ...opts });
}

describe("registrationDuplicateScoring (Prompt 046)", () => {
  it("returns none with no overlap", () => {
    const out = score({
      subject: subject(),
      candidate: candidate(),
    });
    assert.equal(out.riskLevel, RISK_LEVELS.NONE);
    assert.equal(out.totalWeight, 0);
    assert.deepEqual(out.reasons, []);
    assert.equal(out.advisory, true);
    assert.equal(out.autoMerge, false);
    assert.equal(out.autoReject, false);
    assert.equal(out.approvalGateUnchanged, true);
    assert.equal(out.calculatedAt, NOW);
  });

  describe("strong matches", () => {
    it("marks exact registration number as strong", () => {
      const out = score({
        subject: subject({ registrationNumber: "PACRA-12345" }),
        candidate: candidate({ registrationNumber: " pacra-12345 " }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.STRONG);
      assert.ok(out.totalWeight >= STRONG_MIN);
      assert.ok(out.signals.includes("exact_registration_number"));
      assert.ok(out.reasons.every((r) => typeof r.message === "string" && r.message.length > 0));
      assert.match(out.explanation, /advisory|no automatic/i);
    });

    it("marks verified phone overlap as strong with high weight", () => {
      const out = score({
        subject: subject({ phoneVerified: true }),
        candidate: candidate({
          contactPhone: "+260 971 234 567",
          contactPhoneNormalized: null,
          country: "Zambia",
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.STRONG);
      assert.ok(out.signals.includes("verified_phone_overlap"));
      assert.equal(
        out.reasons.find((r) => r.code === "verified_phone_overlap").weight,
        SIGNAL_WEIGHTS.verified_phone_overlap
      );
      assert.ok(!out.signals.includes("exact_phone_overlap"));
    });

    it("marks unverified exact phone overlap as strong (occupying phone)", () => {
      const out = score({
        subject: subject({ phoneVerified: false }),
        candidate: candidate({
          contactPhoneNormalized: "+260971234567",
          phoneVerified: false,
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.STRONG);
      assert.ok(out.signals.includes("exact_phone_overlap"));
      assert.ok(!out.signals.includes("verified_phone_overlap"));
    });

    it("marks church-owned email as strong", () => {
      const out = score({
        subject: subject({ contactEmail: "office@grace.church" }),
        candidate: candidate({
          type: "organization",
          churchOwnedEmails: ["Office@Grace.Church"],
          contactEmail: null,
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.STRONG);
      assert.ok(out.signals.includes("church_owned_email"));
    });

    it("marks church-owned email via primaryEmail as strong", () => {
      const out = score({
        subject: subject({ contactEmail: "hello@org.test" }),
        candidate: candidate({
          type: "organization",
          primaryEmail: "hello@org.test",
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.STRONG);
      assert.ok(out.signals.includes("church_owned_email"));
    });

    it("combined weak signals without high-weight evidence stay possible, not strong", () => {
      const out = score({
        subject: subject(),
        candidate: candidate({
          churchName: "Grace Community Church",
          city: "Lusaka",
          country: "Zambia",
          contactEmail: "pat@example.com",
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.POSSIBLE);
      assert.ok(out.totalWeight < STRONG_MIN);
      assert.ok(out.signals.includes("exact_name_city_country"));
      assert.ok(out.signals.includes("same_contact_email"));
    });
  });

  describe("confirmed only with canonical manual evidence", () => {
    it("does not confirm from field overlap alone", () => {
      const out = score({
        subject: subject({ registrationNumber: "ABC-99", phoneVerified: true }),
        candidate: candidate({
          registrationNumber: "ABC-99",
          contactPhoneNormalized: "+260971234567",
          phoneVerified: true,
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.STRONG);
      assert.notEqual(out.riskLevel, RISK_LEVELS.CONFIRMED);
    });

    it("confirms when link_organization evidence exists", () => {
      const out = score({
        subject: subject(),
        candidate: candidate({ type: "organization", id: "org-1" }),
        manualEvidence: { linkedSameOrganization: true },
      });
      assert.equal(out.riskLevel, RISK_LEVELS.CONFIRMED);
      assert.ok(out.signals.includes("canonical_manual_evidence"));
      assert.equal(out.autoMerge, false);
      assert.equal(out.autoReject, false);
    });

    it("confirms when admin marked same duplicate", () => {
      const out = score({
        subject: subject(),
        candidate: candidate(),
        manualEvidence: { adminMarkedSameDuplicate: true },
      });
      assert.equal(out.riskLevel, RISK_LEVELS.CONFIRMED);
    });

    it("treats admin marked-different as none even with strong field overlap", () => {
      const out = score({
        subject: subject({ registrationNumber: "X1" }),
        candidate: candidate({ registrationNumber: "X1" }),
        manualEvidence: { adminMarkedDifferentDuplicate: true },
      });
      assert.equal(out.riskLevel, RISK_LEVELS.NONE);
      assert.match(out.explanation, /not the same|different/i);
    });
  });

  describe("false positives / weak signals", () => {
    it("keeps same town alone weak (possible, never strong/confirmed)", () => {
      const out = score({
        subject: subject({ churchName: "Alpha Church" }),
        candidate: candidate({
          churchName: "Beta Fellowship",
          city: "Lusaka",
          country: "Zambia",
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.POSSIBLE);
      assert.ok(out.totalWeight < STRONG_MIN);
      assert.ok(out.signals.includes("same_city_country"));
      assert.ok(!out.signals.includes("exact_church_name"));
      assert.notEqual(out.riskLevel, RISK_LEVELS.STRONG);
      assert.notEqual(out.riskLevel, RISK_LEVELS.CONFIRMED);
      assert.match(out.reasons[0].message, /weak/i);
    });

    it("keeps same city without country very weak", () => {
      const out = score({
        subject: subject({ churchName: "A", country: "Zambia" }),
        candidate: candidate({
          churchName: "B",
          city: "Lusaka",
          country: "Kenya",
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.POSSIBLE);
      assert.ok(out.signals.includes("same_city_only"));
      assert.ok(out.totalWeight < SIGNAL_WEIGHTS.exact_church_name);
    });

    it("limits exact church name weight (not strong alone)", () => {
      const out = score({
        subject: subject({ city: "Lusaka", country: "Zambia" }),
        candidate: candidate({
          churchName: "Grace Community Church",
          city: "Kitwe",
          country: "Zambia",
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.POSSIBLE);
      assert.ok(out.signals.includes("exact_church_name"));
      assert.ok(!out.signals.includes("exact_name_city_country"));
      assert.ok(out.totalWeight < STRONG_MIN);
      assert.match(out.explanation, /name|town|limited|weak/i);
    });

    it("limits exact name+city+country (possible, not strong)", () => {
      const out = score({
        subject: subject(),
        candidate: candidate({
          churchName: "Grace Community Church",
          city: "Lusaka",
          country: "Zambia",
        }),
      });
      assert.equal(out.riskLevel, RISK_LEVELS.POSSIBLE);
      assert.equal(
        out.reasons.find((r) => r.code === "exact_name_city_country").weight,
        SIGNAL_WEIGHTS.exact_name_city_country
      );
      assert.ok(out.totalWeight < STRONG_MIN);
    });

    it("does not treat platform-user email alone as strong", () => {
      const out = score({
        subject: subject({ contactEmail: "admin@example.com" }),
        candidate: {
          id: "user-1",
          type: "user",
          isPlatformUser: true,
          contactEmail: "admin@example.com",
        },
      });
      assert.equal(out.riskLevel, RISK_LEVELS.POSSIBLE);
      assert.ok(out.signals.includes("platform_user_email"));
      assert.ok(out.totalWeight < STRONG_MIN);
      assert.match(out.reasons[0].message, /not email ownership/i);
    });

    it("does not invent registration-number matches when absent", () => {
      const out = score({
        subject: subject({ registrationNumber: null }),
        candidate: candidate({ registrationNumber: undefined }),
      });
      assert.ok(!out.signals.includes("exact_registration_number"));
    });

    it("ignores dissimilar phones that only share a country calling code", () => {
      const out = score({
        subject: subject({ contactPhoneNormalized: "+260971234567" }),
        candidate: candidate({ contactPhoneNormalized: "+260977999999" }),
      });
      assert.ok(!out.signals.includes("exact_phone_overlap"));
      assert.ok(!out.signals.includes("verified_phone_overlap"));
      assert.equal(out.riskLevel, RISK_LEVELS.NONE);
    });

    it("does not elevate domain-less candidates via empty website", () => {
      const out = score({
        subject: subject({ website: "" }),
        candidate: candidate({ website: null }),
      });
      assert.ok(!out.signals.includes("exact_website_domain"));
    });

    it("requires usable domain on both sides for domain signal", () => {
      const out = score({
        subject: subject({ website: "https://www.grace.org/about" }),
        candidate: candidate({ website: "not a domain" }),
      });
      assert.ok(!out.signals.includes("exact_website_domain"));
    });
  });

  describe("website domain", () => {
    it("scores exact domain as contributing weight without confirming", () => {
      const out = score({
        subject: subject({ website: "https://WWW.Example.org/" }),
        candidate: candidate({ website: "example.org." }),
      });
      assert.ok(out.signals.includes("exact_website_domain"));
      assert.equal(out.riskLevel, RISK_LEVELS.STRONG);
      assert.notEqual(out.riskLevel, RISK_LEVELS.CONFIRMED);
    });
  });

  describe("batch scoring and guarantees", () => {
    it("sorts confirmed/strong ahead of possible/none", () => {
      const rows = scoreRegistrationDuplicateMatches({
        now: NOW,
        subject: subject({
          registrationNumber: "ZZ-1",
          contactPhoneNormalized: "+260971234567",
          phoneVerified: true,
        }),
        candidates: [
          candidate({ id: "weak", city: "Lusaka", country: "Zambia", churchName: "No Match" }),
          candidate({
            id: "phone",
            contactPhoneNormalized: "+260971234567",
            phoneVerified: true,
          }),
          candidate({ id: "none", churchName: "Z", city: "X", country: "Y" }),
        ],
        manualEvidenceByCandidateId: {
          phone: { adminMarkedSameDuplicate: true },
        },
      });
      assert.equal(rows[0].candidateId, "phone");
      assert.equal(rows[0].riskLevel, RISK_LEVELS.CONFIRMED);
      assert.ok(rows.some((r) => r.riskLevel === RISK_LEVELS.POSSIBLE));
      assert.ok(rows.some((r) => r.riskLevel === RISK_LEVELS.NONE));
    });

    it("never sets merge/reject/gate flags", () => {
      const out = score({
        subject: subject({ registrationNumber: "A1", phoneVerified: true }),
        candidate: candidate({
          registrationNumber: "A1",
          contactPhoneNormalized: "+260971234567",
          phoneVerified: true,
        }),
        manualEvidence: { linkedSameOrganization: true },
      });
      assert.equal(out.autoMerge, false);
      assert.equal(out.autoReject, false);
      assert.equal(out.approvalGateUnchanged, true);
      assert.equal(out.advisory, true);
    });

    it("handles null/malformed input safely", () => {
      const out = scoreRegistrationDuplicateMatch(null);
      assert.equal(out.riskLevel, RISK_LEVELS.NONE);
      assert.equal(out.advisory, true);
      assert.ok(Array.isArray(out.reasons));
    });

    it("includes a human-readable reason for every signal", () => {
      const out = score({
        subject: subject({
          registrationNumber: "R1",
          website: "grace.org",
          phoneVerified: true,
        }),
        candidate: candidate({
          churchName: "Grace Community Church",
          city: "Lusaka",
          country: "Zambia",
          registrationNumber: "R1",
          website: "grace.org",
          contactPhoneNormalized: "+260971234567",
          contactEmail: "pat@example.com",
        }),
      });
      assert.ok(out.reasons.length >= 2);
      for (const r of out.reasons) {
        assert.equal(typeof r.code, "string");
        assert.equal(typeof r.weight, "number");
        assert.equal(typeof r.message, "string");
        assert.ok(r.message.length > 10);
      }
    });
  });
});
