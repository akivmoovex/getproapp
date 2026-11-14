"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  mapDirectoryItems,
  mapDirectoryContactUrl,
  mapDirectoryJoinUrl,
} = require("../../../src/blessboard/http/apexMarketingContent");
const {
  submitPublicChurchEnquiry,
} = require("../../../src/blessboard/services/publicChurchContactService");

const CHURCH_A = "11111111-1111-4111-8111-111111111111";
const ORG_A = "22222222-2222-4222-8222-222222222222";
const BRANCH_A = "33333333-3333-4333-8333-333333333333";
const CHURCH_B = "44444444-4444-4444-8444-444444444444";

function fakePool() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            organization_id: params[0],
            church_id: params[1],
            branch_id: params[2],
          },
        ],
      };
    },
  };
}

describe("BB-24 directory actions and enquiry binding", () => {
  it("keeps two churches on their own visit, contact, and join links", () => {
    const items = mapDirectoryItems([
      { slug: "alpha-chapel", preview_branch_slug: "hq", name: "Alpha Chapel" },
      { slug: "beta-chapel", preview_branch_slug: "main", name: "Beta Chapel" },
    ]);
    assert.match(items[0].contact_href, /\/c\/alpha-chapel\/hq\/contact$/);
    assert.match(items[1].contact_href, /\/c\/beta-chapel\/main\/contact$/);
    assert.equal(items[0].join_href, "/c/alpha-chapel/register");
    assert.equal(items[1].join_href, "/c/beta-chapel/register");
    assert.doesNotMatch(items[0].contact_href, /beta-chapel|register-church|^\/contact$/);
    assert.doesNotMatch(items[0].join_href, /register-church|beta-chapel/);
    assert.doesNotMatch(items[1].join_href, /register-church|alpha-chapel/);
    assert.equal(items[0].contact_label, "Contact Church");
    assert.equal(items[0].join_label, "Join Church");
    assert.equal(mapDirectoryContactUrl({ slug: "alpha-chapel" }).endsWith("/contact"), true);
    assert.equal(mapDirectoryJoinUrl({ slug: "alpha-chapel" }), "/c/alpha-chapel/register");
  });

  it("stores the enquiry on the resolved church and ignores a posted church id", async () => {
    const pool = fakePool();
    const result = await submitPublicChurchEnquiry(
      pool,
      { organizationId: ORG_A, churchId: CHURCH_A, branchId: BRANCH_A },
      {
        full_name: "Ada Visitor",
        email: "ada@example.org",
        message: "Please tell me about Sunday.",
        church_id: CHURCH_B,
        organization_id: CHURCH_B,
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.churchId, CHURCH_A);
    assert.equal(pool.calls.length, 1);
    assert.equal(pool.calls[0].params[0], ORG_A);
    assert.equal(pool.calls[0].params[1], CHURCH_A);
    assert.equal(pool.calls[0].params[2], BRANCH_A);
    assert.doesNotMatch(pool.calls[0].sql, /platform_inquiries/);
  });

  it("does not write when the church scope is missing or the message is invalid", async () => {
    const pool = fakePool();
    const missing = await submitPublicChurchEnquiry(
      pool,
      { organizationId: ORG_A, churchId: CHURCH_A },
      { full_name: "Ada Visitor", email: "ada@example.org", message: "A long enough note." }
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 404);
    const invalid = await submitPublicChurchEnquiry(
      pool,
      { organizationId: ORG_A, churchId: CHURCH_A, branchId: BRANCH_A },
      { full_name: "", email: "ada@example.org", message: "short" }
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 400);
    assert.equal(pool.calls.length, 0);
  });
});
