"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  getDraftConsentNotice,
  DRAFT_NOTICE_VERSION,
} = require("../../../src/activeclinic/communityBenefits/consentNoticeDraft");
const { calculateBenefit } = require("../../../src/activeclinic/communityBenefits/money");

describe("G301 consent draft and Model B preview", () => {
  it("keeps the consent notice draft inactive and unapproved", () => {
    const notice = getDraftConsentNotice();
    assert.equal(notice.version, DRAFT_NOTICE_VERSION);
    assert.equal(notice.activated, false);
    assert.equal(notice.status, "DRAFT_INACTIVE");
    assert.equal(notice.legalApproval, "unapproved");
    assert.match(notice.text, /NOT ACTIVATED/);
  });

  it("previews a Model B 10 percent contribution without patient savings", () => {
    const quote = calculateBenefit({
      model: "MODEL_B_COMMUNITY_CONTRIBUTION",
      amountMinor: 25000,
      contributionBps: 1000,
    });
    assert.equal(quote.contributionMinor, 2500);
    assert.equal(quote.discountMinor, 0);
    assert.equal(quote.patientSavingsMinor, 0);
    assert.equal(quote.payableMinor, 25000);
  });
});
