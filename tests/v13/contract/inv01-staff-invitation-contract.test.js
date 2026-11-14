"use strict";

/**
 * INV-01 — Invited staff password setup and login contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const inviteMod = require("../../../src/blessboard/services/inviteBlessBoardStaff");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("INV-01 staff invitation contracts", () => {
  it("exports invitation create/accept/revoke and status taxonomy", () => {
    assert.equal(typeof inviteMod.inviteBlessBoardStaff, "function");
    assert.equal(typeof inviteMod.acceptInvitation, "function");
    assert.equal(typeof inviteMod.revokeInvitation, "function");
    assert.equal(typeof inviteMod.getInvitationForAccept, "function");
    assert.ok(inviteMod.STATUS.OK);
    assert.ok(inviteMod.STATUS.EXPIRED);
    assert.ok(inviteMod.STATUS.REVOKED);
    assert.ok(inviteMod.STATUS.FORBIDDEN);
  });

  it("HQ invite route validates CSRF and builds accept link", () => {
    const src = read("src/blessboard/http/hqRoleAdminRoutes.js");
    assert.match(src, /router\.post\("\/hq\/roles\/invite"/);
    assert.match(src, /validateCsrfPost/);
    assert.match(src, /inviteBlessBoardStaff/);
    assert.match(src, /\/invite\/accept\?token=/);
    assert.match(src, /router\.post\("\/hq\/roles\/invitations\/:invitationId\/revoke"/);
  });

  it("invite accept routes support GET/POST password setup", () => {
    const routes = read("src/blessboard/http/inviteAcceptRoutes.js");
    assert.match(routes, /router\.get\("\/invite\/accept"/);
    assert.match(routes, /router\.post\("\/invite\/accept"/);
    assert.match(routes, /acceptInvitation/);
    assert.match(routes, /validateCsrf/);
    const form = read("views/blessboard/v5/invite/accept.ejs");
    assert.match(form, /csrfField|csrfToken|_csrf/);
    assert.match(form, /password/);
  });

  it("rejects platform_administrator from invite role allowlist", () => {
    const src = read("src/blessboard/services/inviteBlessBoardStaff.js");
    assert.match(src, /platform_administrator cannot be invited/);
    assert.doesNotMatch(
      src,
      /INVITE_ROLES = Object\.freeze\(\[[^\]]*platform_administrator/
    );
  });

  it("invitation acceptance assigns catalogue roles and uses hashed single-use tokens", () => {
    const src = read("src/blessboard/services/inviteBlessBoardStaff.js");
    assert.match(src, /hashSessionToken/);
    assert.match(src, /INVITE_TTL_MS/);
    assert.match(src, /validatePasswordPair/);
    assert.match(src, /markAccepted|accepted/);
  });
});
