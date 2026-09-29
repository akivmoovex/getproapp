"use strict";

/**
 * Phase2 Prompt 044 — pure duplicate normalization helpers (no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  normalizeCompareText,
  normalizeChurchNameForDuplicate,
  normalizePlaceForDuplicate,
  normalizeChurchNameCityCountryForDuplicate,
  normalizePhoneForDuplicate,
  normalizeEmailForDuplicate,
  normalizeWebsiteDomainForDuplicate,
  normalizeRegistrationNumberForDuplicate,
  normalizeAddressForDuplicate,
} = require("../src/blessboard/services/registrationDuplicateNormalization");
const { normalizeRegistrationPhone } = require("../src/blessboard/services/normalizeRegistrationPhone");
const { normalizeEmail } = require("../src/blessboard/services/createBlessBoardUser");
const { slugifyOrganizationKey } = require("../src/blessboard/services/organizationKey");

describe("registrationDuplicateNormalization (Prompt 044)", () => {
  describe("church name", () => {
    it("preserves original and collapses whitespace without stripping punctuation", () => {
      const raw = "  Grace   Community  Church  ";
      const out = normalizeChurchNameForDuplicate(raw);
      assert.ok(out);
      assert.equal(out.original, raw);
      assert.equal(out.normalized, "grace community church");

      const punct = normalizeChurchNameForDuplicate("St. Mary's Church");
      assert.equal(punct.normalized, "st. mary's church");
      assert.equal(punct.original, "St. Mary's Church");
    });

    it("does not apply organization-key NFKD / slug destructive transforms", () => {
      const name = "Église Évangélique";
      const out = normalizeChurchNameForDuplicate(name);
      assert.ok(out);
      assert.equal(out.normalized, "église évangélique");
      assert.notEqual(out.normalized, slugifyOrganizationKey(name));
      assert.match(out.normalized, /é/);
    });

    it("returns null for empty or non-string values", () => {
      assert.equal(normalizeChurchNameForDuplicate(null), null);
      assert.equal(normalizeChurchNameForDuplicate(""), null);
      assert.equal(normalizeChurchNameForDuplicate("   "), null);
      assert.equal(normalizeChurchNameForDuplicate({}), null);
      assert.equal(normalizeChurchNameForDuplicate(undefined), null);
    });
  });

  describe("name + city + country triple", () => {
    it("builds a stable exact-match key when all parts are present", () => {
      const out = normalizeChurchNameCityCountryForDuplicate({
        churchName: "Grace Church",
        city: "  Lusaka ",
        country: "Zambia",
      });
      assert.ok(out);
      assert.equal(out.original.churchName, "Grace Church");
      assert.equal(out.normalized.city, "lusaka");
      assert.equal(out.key, "grace church|lusaka|zambia");
    });

    it("returns null when any part is missing", () => {
      assert.equal(
        normalizeChurchNameCityCountryForDuplicate({
          churchName: "Grace",
          city: "Lusaka",
          country: "",
        }),
        null
      );
      assert.equal(normalizeChurchNameCityCountryForDuplicate(null), null);
    });
  });

  describe("phone", () => {
    it("reuses normalizeRegistrationPhone E.164 and preserves original", () => {
      const raw = "097 123 4567";
      const out = normalizePhoneForDuplicate(raw, "Zambia");
      const direct = normalizeRegistrationPhone(raw, "Zambia");
      assert.ok(out);
      assert.equal(out.original, raw);
      assert.equal(direct.ok, true);
      assert.equal(out.normalized, direct.normalized);
      assert.equal(out.normalized, "+260971234567");
    });

    it("maps equivalent formats to the same normalized value", () => {
      const a = normalizePhoneForDuplicate("+260 97 123 4567", "Zambia");
      const b = normalizePhoneForDuplicate("0971234567", "ZM");
      assert.equal(a.normalized, b.normalized);
    });

    it("returns normalized null for unusable phones without throwing", () => {
      const out = normalizePhoneForDuplicate("0971234567", "Atlantis");
      assert.ok(out);
      assert.equal(out.original, "0971234567");
      assert.equal(out.normalized, null);
      assert.equal(normalizePhoneForDuplicate(""), null);
      assert.equal(normalizePhoneForDuplicate(null), null);
    });
  });

  describe("email", () => {
    it("reuses normalizeEmail and validates format", () => {
      const raw = "  Pat.Applicant@Example.COM ";
      const out = normalizeEmailForDuplicate(raw);
      assert.ok(out);
      assert.equal(out.original, raw);
      assert.equal(out.normalized, normalizeEmail(raw));
      assert.equal(out.normalized, "pat.applicant@example.com");
    });

    it("returns normalized null for invalid emails", () => {
      const out = normalizeEmailForDuplicate("not-an-email");
      assert.ok(out);
      assert.equal(out.normalized, null);
      assert.equal(normalizeEmailForDuplicate("  "), null);
      assert.equal(normalizeEmailForDuplicate(null), null);
    });
  });

  describe("website domain", () => {
    it("normalizes hostnames like platform.domains (lower, trim, trailing dots)", () => {
      const out = normalizeWebsiteDomainForDuplicate("Example.ORG.");
      assert.ok(out);
      assert.equal(out.original, "Example.ORG.");
      assert.equal(out.normalized, "example.org");
    });

    it("extracts hostname from URLs and strips a single www prefix for compare key", () => {
      const out = normalizeWebsiteDomainForDuplicate("https://WWW.Example.org/about?x=1");
      assert.ok(out);
      assert.equal(out.original, "https://WWW.Example.org/about?x=1");
      assert.equal(out.normalized, "example.org");
    });

    it("rejects ports, whitespace-only junk, and bare labels without a dot", () => {
      assert.equal(normalizeWebsiteDomainForDuplicate("example.org:443").normalized, null);
      assert.equal(normalizeWebsiteDomainForDuplicate("not a host").normalized, null);
      assert.equal(normalizeWebsiteDomainForDuplicate("localhost").normalized, null);
      assert.equal(normalizeWebsiteDomainForDuplicate(""), null);
      assert.equal(normalizeWebsiteDomainForDuplicate(null), null);
    });
  });

  describe("registration number", () => {
    it("preserves original and uppercases compact alphanumerics safely", () => {
      const raw = " pacra 123-ab ";
      const out = normalizeRegistrationNumberForDuplicate(raw);
      assert.ok(out);
      assert.equal(out.original, raw);
      assert.equal(out.normalized, "PACRA123-AB");
    });

    it("returns normalized null for symbols-only or too-short values", () => {
      assert.equal(normalizeRegistrationNumberForDuplicate("!!").normalized, null);
      assert.equal(normalizeRegistrationNumberForDuplicate("A").normalized, null);
      assert.equal(normalizeRegistrationNumberForDuplicate(""), null);
      assert.equal(normalizeRegistrationNumberForDuplicate(null), null);
    });

    it("does not invent a number when input is absent", () => {
      assert.equal(normalizeRegistrationNumberForDuplicate(undefined), null);
    });
  });

  describe("address", () => {
    it("builds a safe city+country key and preserves originals", () => {
      const out = normalizeAddressForDuplicate({
        line1: " 12  Main  St ",
        city: "Lusaka",
        country: "Zambia",
        postalCode: "10101",
      });
      assert.ok(out);
      assert.equal(out.original.line1, " 12  Main  St ");
      assert.equal(out.normalized.line1, "12 main st");
      assert.equal(out.normalized.city, "lusaka");
      assert.equal(out.normalized.postalCode, "10101");
      assert.equal(out.key, "12 main st|lusaka||10101|zambia");
    });

    it("allows postal+country when city is missing", () => {
      const out = normalizeAddressForDuplicate({
        postalCode: "SW1A 1AA",
        country: "United Kingdom",
      });
      assert.ok(out);
      assert.equal(out.normalized.postalCode, "SW1A1AA");
      assert.equal(out.key, "postal|SW1A1AA|united kingdom");
    });

    it("returns null key when not enough safe parts; null input overall when empty", () => {
      const partial = normalizeAddressForDuplicate({ line1: "Only street" });
      assert.ok(partial);
      assert.equal(partial.key, null);
      assert.equal(partial.normalized.line1, "only street");
      assert.equal(normalizeAddressForDuplicate({}), null);
      assert.equal(normalizeAddressForDuplicate(null), null);
    });
  });

  describe("shared guarantees", () => {
    it("normalizeCompareText never strips diacritics", () => {
      assert.equal(normalizeCompareText("Café"), "café");
    });

    it("normalizePlaceForDuplicate mirrors church-name whitespace rules", () => {
      const place = normalizePlaceForDuplicate("  New   York  ");
      assert.equal(place.normalized, "new york");
      assert.equal(place.original, "  New   York  ");
    });

    it("exports no scoring fields", () => {
      const samples = [
        normalizeChurchNameForDuplicate("A"),
        normalizePhoneForDuplicate("+260971234567", "Zambia"),
        normalizeEmailForDuplicate("a@b.co"),
        normalizeWebsiteDomainForDuplicate("a.b.co"),
        normalizeRegistrationNumberForDuplicate("AB12"),
        normalizeAddressForDuplicate({ city: "X", country: "Y" }),
      ];
      for (const sample of samples) {
        assert.ok(sample);
        assert.equal(Object.prototype.hasOwnProperty.call(sample, "score"), false);
        assert.equal(Object.prototype.hasOwnProperty.call(sample, "confidence"), false);
      }
    });
  });
});
