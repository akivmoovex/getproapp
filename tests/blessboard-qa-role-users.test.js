"use strict";

/**
 * BlessBoard QA role-user seed — classification + phone range unit tests.
 * Does not require a live database.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyCatalogueRole,
  resolveQaAssignmentPlan,
  formatQaPhone,
  qaEmailForRole,
  DEMO_ORGANIZATION_KEY,
  QA_PASSWORD,
  NON_HUMAN_ASSIGNABLE_ROLE_KEYS,
} = require("../src/blessboard/services/blessBoardQaRoleUsersSpec");
const {
  normalizeRegistrationPhone,
} = require("../src/blessboard/services/normalizeRegistrationPhone");

describe("blessboard QA role users spec", () => {
  it("classifies ActiveClinic and non-staff roles as SYSTEM_ONLY", () => {
    assert.equal(
      classifyCatalogueRole({ roleKey: "activeclinic_nurse", roleCategory: "activeclinic", isActive: true }),
      "SYSTEM_ONLY"
    );
    assert.equal(
      classifyCatalogueRole({ roleKey: "visitor", roleCategory: "visitor", isActive: true }),
      "SYSTEM_ONLY"
    );
    assert.equal(
      classifyCatalogueRole({ roleKey: "member", roleCategory: "member", isActive: true }),
      "SYSTEM_ONLY"
    );
    assert.equal(
      classifyCatalogueRole({
        roleKey: "platform_administrator",
        roleCategory: "platform",
        isActive: true,
      }),
      "SYSTEM_ONLY"
    );
    for (const key of NON_HUMAN_ASSIGNABLE_ROLE_KEYS) {
      assert.equal(
        classifyCatalogueRole({ roleKey: key, roleCategory: "x", isActive: true }),
        "SYSTEM_ONLY"
      );
    }
  });

  it("classifies active BlessBoard staff catalogue roles as HUMAN_ASSIGNABLE", () => {
    assert.equal(
      classifyCatalogueRole({
        roleKey: "finance_officer",
        roleCategory: "finance",
        isActive: true,
      }),
      "HUMAN_ASSIGNABLE"
    );
    assert.equal(
      classifyCatalogueRole({
        roleKey: "branch_administrator",
        roleCategory: "branch",
        isActive: true,
      }),
      "HUMAN_ASSIGNABLE"
    );
  });

  it("maps branch roles to branch_admin baseline and HQ roles to church_hq_admin", () => {
    const branch = resolveQaAssignmentPlan("branch_pastor", "branch");
    assert.equal(branch.legacyRoleKey, "branch_admin");
    assert.equal(branch.catalogueScopeType, "branch");
    const finance = resolveQaAssignmentPlan("finance_director", "finance");
    assert.equal(finance.legacyRoleKey, "church_hq_admin");
    assert.equal(finance.catalogueScopeType, "church");
  });

  it("uses deterministic QA emails and Zambia phones that normalize", () => {
    assert.equal(qaEmailForRole("finance_officer"), "qa.finance_officer@demo-church.example.test");
    assert.equal(DEMO_ORGANIZATION_KEY, "demo-church");
    assert.equal(QA_PASSWORD.length, 10);
    const phone = formatQaPhone(1);
    assert.equal(phone, "+260971000001");
    const norm = normalizeRegistrationPhone(phone, "ZM");
    assert.equal(norm.ok, true);
    assert.equal(norm.normalized, "+260971000001");
    const existingRange = formatQaPhone(101);
    assert.equal(existingRange, "+260971000101");
    assert.notEqual(phone.slice(0, 8), "+2609700"); // avoid ActiveClinic QA range
  });
});
