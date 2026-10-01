"use strict";

/**
 * V2.04 Phase 5 — BlessBoard member portal auth (M13–M19).
 * Happy + negative paths: exact verify, password policy, blocked login,
 * enumeration-safe recovery, lost Church ID, rate limits, session revoke.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");

const authService = require("../src/blessboard/services/blessBoardMemberPortalAuthService");
const {
  RESULT,
  NEUTRAL_VERIFY,
  NEUTRAL_LOGIN,
  NEUTRAL_RECOVERY,
  LOST_CHURCH_ID,
  validateMemberPortalPassword,
  verifyFirstTimeMembership,
  completeFirstTimeActivation,
  authenticateMemberByChurchId,
  beginMemberPasswordRecovery,
  completeMemberPasswordRecovery,
  lostChurchIdGuidance,
  signDraft,
  verifyDraft,
  _rateBuckets,
} = authService;
const { PORTAL_ACCESS_STATUS } = require("../src/blessboard/services/memberDomainConstants");
const {
  STATUS: MEMBER_GATE_STATUS,
  requireActiveMemberForTenant,
} = require("../src/blessboard/services/requireActiveMemberForTenant");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const USER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ENV = { CSRF_SECRET: "test-member-auth-secret", SESSION_SECRET: "test-session" };

function clearRates() {
  _rateBuckets.clear();
}

function baseMember(overrides) {
  return {
    id: MEMBER_ID,
    churchId: CHURCH,
    organizationId: ORG,
    memberNumber: "CH-10001",
    firstName: "Ada",
    lastName: "Lovelace",
    phoneNormalized: "+260971234567",
    phoneDisplay: "+260 97 123 4567",
    emailDisplay: null,
    userId: null,
    portalAccessStatus: PORTAL_ACCESS_STATUS.NOT_ACTIVATED,
    status: "active",
    ...overrides,
  };
}

describe("V2.04 BB member auth password policy", () => {
  it("requires min 8, uppercase, special, and matching confirm", () => {
    assert.equal(validateMemberPortalPassword("short1!", "short1!").ok, false);
    assert.equal(validateMemberPortalPassword("alllowercase1!", "alllowercase1!").ok, false);
    assert.equal(validateMemberPortalPassword("NoSpecial1", "NoSpecial1").ok, false);
    assert.equal(validateMemberPortalPassword("GoodPass1!", "mismatch").ok, false);
    assert.equal(validateMemberPortalPassword("GoodPass1!", "GoodPass1!").ok, true);
  });
});

describe("V2.04 BB member auth drafts", () => {
  it("signs and verifies activation drafts; rejects tampering and expiry", () => {
    const token = signDraft(
      {
        v: 1,
        exp: Date.now() + 60_000,
        purpose: "activation",
        churchId: CHURCH,
        memberId: MEMBER_ID,
      },
      ENV.CSRF_SECRET
    );
    const ok = verifyDraft(token, ENV.CSRF_SECRET);
    assert.equal(ok.ok, true);
    assert.equal(ok.draft.memberId, MEMBER_ID);

    const bad = verifyDraft(token.slice(0, -2) + "xx", ENV.CSRF_SECRET);
    assert.equal(bad.ok, false);

    const expired = signDraft(
      { v: 1, exp: Date.now() - 1, purpose: "activation", churchId: CHURCH },
      ENV.CSRF_SECRET
    );
    assert.equal(verifyDraft(expired, ENV.CSRF_SECRET).ok, false);
  });
});

describe("V2.04 BB first-time activation (M14/M15)", () => {
  beforeEach(clearRates);

  it("verifies exact Church ID + name + phone and rejects fuzzy/mismatched identity", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const original = memberRepo.findMemberByChurchAndNumber;
    memberRepo.findMemberByChurchAndNumber = async () => baseMember();
    try {
      const ok = await verifyFirstTimeMembership(
        {},
        {
          churchId: CHURCH,
          organizationId: ORG,
          memberNumber: "CH-10001",
          fullName: "Ada Lovelace",
          phone: "+260971234567",
          phoneNormalized: "+260971234567",
          requestIp: "127.0.0.1",
          env: ENV,
        }
      );
      assert.equal(ok.ok, true);
      assert.ok(ok.draftToken);

      const wrongName = await verifyFirstTimeMembership(
        {},
        {
          churchId: CHURCH,
          organizationId: ORG,
          memberNumber: "CH-10001",
          fullName: "Ada Lovelace-ish",
          phone: "+260971234567",
          phoneNormalized: "+260971234567",
          requestIp: "127.0.0.2",
          env: ENV,
        }
      );
      assert.equal(wrongName.ok, false);
      assert.equal(wrongName.code, RESULT.VERIFICATION_FAILED);
      assert.equal(wrongName.message, NEUTRAL_VERIFY);

      const wrongPhone = await verifyFirstTimeMembership(
        {},
        {
          churchId: CHURCH,
          organizationId: ORG,
          memberNumber: "CH-10001",
          fullName: "Ada Lovelace",
          phone: "+260999999999",
          phoneNormalized: "+260999999999",
          requestIp: "127.0.0.3",
          env: ENV,
        }
      );
      assert.equal(wrongPhone.ok, false);
      assert.equal(wrongPhone.message, NEUTRAL_VERIFY);
    } finally {
      memberRepo.findMemberByChurchAndNumber = original;
    }
  });

  it("does not create membership when verification fails for unknown Church ID", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const original = memberRepo.findMemberByChurchAndNumber;
    let createCalled = false;
    memberRepo.findMemberByChurchAndNumber = async () => null;
    const createSpy = async () => {
      createCalled = true;
      throw new Error("must not create");
    };
    try {
      const failed = await verifyFirstTimeMembership(
        {},
        {
          churchId: CHURCH,
          organizationId: ORG,
          memberNumber: "CH-99999",
          fullName: "Ghost Member",
          phone: "+260971234567",
          phoneNormalized: "+260971234567",
          requestIp: "10.0.0.1",
          env: ENV,
        }
      );
      assert.equal(failed.ok, false);
      assert.equal(failed.message, NEUTRAL_VERIFY);
      assert.equal(createCalled, false);
      assert.equal(typeof createSpy, "function");
    } finally {
      memberRepo.findMemberByChurchAndNumber = original;
    }
  });

  it("blocks activation when portal is blocked; completes password activation when verified", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const authRepo = require("../src/blessboard/repositories/blessBoardAuthRepository");

    const originals = {
      findByNumber: memberRepo.findMemberByChurchAndNumber,
      findById: memberRepo.findMemberById,
      updateUserId: memberRepo.updateMemberUserId,
      updatePortal: memberRepo.updatePortalAccessStatus,
      updateHash: authRepo.updateUserPasswordHash,
    };

    memberRepo.findMemberByChurchAndNumber = async () =>
      baseMember({ portalAccessStatus: PORTAL_ACCESS_STATUS.BLOCKED });
    try {
      const blocked = await verifyFirstTimeMembership(
        {},
        {
          churchId: CHURCH,
          organizationId: ORG,
          memberNumber: "CH-10001",
          fullName: "Ada Lovelace",
          phone: "+260971234567",
          phoneNormalized: "+260971234567",
          requestIp: "10.0.0.8",
          env: ENV,
        }
      );
      assert.equal(blocked.ok, false);
      assert.equal(blocked.code, RESULT.PORTAL_BLOCKED);
    } finally {
      memberRepo.findMemberByChurchAndNumber = originals.findByNumber;
    }

    const draftToken = signDraft(
      {
        v: 1,
        exp: Date.now() + 60_000,
        purpose: "activation",
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER_ID,
        memberNumber: "CH-10001",
        displayName: "Ada Lovelace",
        phoneNormalized: "+260971234567",
        email: null,
      },
      ENV.CSRF_SECRET
    );

    memberRepo.findMemberById = async () => baseMember();
    memberRepo.updateMemberUserId = async () => baseMember({ userId: USER_ID });
    memberRepo.updatePortalAccessStatus = async () =>
      baseMember({
        userId: USER_ID,
        portalAccessStatus: PORTAL_ACCESS_STATUS.ACTIVE,
      });
    authRepo.updateUserPasswordHash = async () => ({ ok: true });

    try {
      const weak = await completeFirstTimeActivation(
        {},
        {
          churchId: CHURCH,
          draftToken,
          password: "weak",
          passwordConfirm: "weak",
          env: ENV,
        },
        {}
      );
      assert.equal(weak.ok, false);
      assert.equal(weak.code, RESULT.WEAK_PASSWORD);

      const done = await completeFirstTimeActivation(
        {},
        {
          churchId: CHURCH,
          draftToken,
          password: "GoodPass1!",
          passwordConfirm: "GoodPass1!",
          env: ENV,
        },
        {
          createBlessBoardUser: async () => ({
            ok: true,
            user: { id: USER_ID },
          }),
        }
      );
      assert.equal(done.ok, true);
      assert.equal(done.memberNumber, "CH-10001");
      assert.equal(done.portalAccessStatus, PORTAL_ACCESS_STATUS.ACTIVE);
    } finally {
      memberRepo.findMemberById = originals.findById;
      memberRepo.updateMemberUserId = originals.updateUserId;
      memberRepo.updatePortalAccessStatus = originals.updatePortal;
      authRepo.updateUserPasswordHash = originals.updateHash;
    }
  });
});

describe("V2.04 BB returning login (M13)", () => {
  beforeEach(clearRates);

  it("logs in with Church ID + password and rejects blocked / bad password with safe messages", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const authRepo = require("../src/blessboard/repositories/blessBoardAuthRepository");
    const hash = await bcrypt.hash("GoodPass1!", 4);

    const originals = {
      findByNumber: memberRepo.findMemberByChurchAndNumber,
      findUser: authRepo.findUserById,
    };

    memberRepo.findMemberByChurchAndNumber = async () =>
      baseMember({
        userId: USER_ID,
        portalAccessStatus: PORTAL_ACCESS_STATUS.ACTIVE,
      });
    authRepo.findUserById = async () => ({
      id: USER_ID,
      status: "active",
      password_hash: hash,
    });
    const deps = {
      establishBlessBoardSession: async () => ({
        ok: true,
        rawToken: "raw-token-test",
        session: { id: "sess-1", userId: USER_ID },
      }),
    };

    try {
      const ok = await authenticateMemberByChurchId(
        {},
        {
          churchId: CHURCH,
          organizationId: ORG,
          memberNumber: "CH-10001",
          password: "GoodPass1!",
          deploymentCode: "local",
          requestIp: "10.1.1.1",
        },
        deps
      );
      assert.equal(ok.ok, true);
      assert.equal(ok.rawToken, "raw-token-test");

      const badPw = await authenticateMemberByChurchId(
        {},
        {
          churchId: CHURCH,
          organizationId: ORG,
          memberNumber: "CH-10001",
          password: "WrongPass1!",
          deploymentCode: "local",
          requestIp: "10.1.1.2",
        },
        deps
      );
      assert.equal(badPw.ok, false);
      assert.equal(badPw.message, NEUTRAL_LOGIN);

      memberRepo.findMemberByChurchAndNumber = async () =>
        baseMember({
          userId: USER_ID,
          portalAccessStatus: PORTAL_ACCESS_STATUS.BLOCKED,
        });
      const blocked = await authenticateMemberByChurchId(
        {},
        {
          churchId: CHURCH,
          organizationId: ORG,
          memberNumber: "CH-10001",
          password: "GoodPass1!",
          deploymentCode: "local",
          requestIp: "10.1.1.3",
        },
        deps
      );
      assert.equal(blocked.ok, false);
      assert.equal(blocked.code, RESULT.PORTAL_BLOCKED);
      assert.match(blocked.message, /blocked/i);
    } finally {
      memberRepo.findMemberByChurchAndNumber = originals.findByNumber;
      authRepo.findUserById = originals.findUser;
    }
  });
});

describe("V2.04 BB recovery (M17–M19)", () => {
  beforeEach(clearRates);

  it("returns enumeration-safe message when membership cannot recover; lost Church ID has no automation", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const original = memberRepo.findMemberByChurchAndNumber;
    memberRepo.findMemberByChurchAndNumber = async () => null;
    try {
      const missing = await beginMemberPasswordRecovery(
        {},
        {
          churchId: CHURCH,
          organizationId: ORG,
          memberNumber: "CH-40404",
          requestIp: "10.2.2.2",
        },
        ENV
      );
      assert.equal(missing.ok, true);
      assert.equal(missing.message, NEUTRAL_RECOVERY);
      assert.equal(missing.sent, false);
      assert.equal(Boolean(missing.draftToken), false);
    } finally {
      memberRepo.findMemberByChurchAndNumber = original;
    }

    const lost = lostChurchIdGuidance();
    assert.equal(lost.automatedRecovery, false);
    assert.equal(lost.message, LOST_CHURCH_ID);
  });

  it("completes OTP recovery, updates password, and revokes sessions", async () => {
    const draftToken = signDraft(
      {
        v: 1,
        exp: Date.now() + 60_000,
        purpose: "recovery",
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER_ID,
        memberNumber: "CH-10001",
        userId: USER_ID,
        verificationId: "ver-1",
      },
      ENV.CSRF_SECRET
    );

    let hashUpdated = false;
    const testEnv = { ...ENV, NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: "local" };
    const depsFail = {
      checkVerification: async () => ({ ok: false, status: "invalid_code" }),
      updateUserPasswordHash: async () => {
        throw new Error("should not update");
      },
      revokeSessionsByBlessBoardUser: async () => ({ revokedCount: 0 }),
    };
    const failed = await completeMemberPasswordRecovery(
      {},
      {
        churchId: CHURCH,
        draftToken,
        verificationId: "ver-1",
        code: "000000",
        password: "GoodPass1!",
        passwordConfirm: "GoodPass1!",
      },
      testEnv,
      depsFail
    );
    assert.equal(failed.ok, false);
    assert.equal(failed.code, RESULT.OTP_FAILED);

    const done = await completeMemberPasswordRecovery(
      {},
      {
        churchId: CHURCH,
        draftToken,
        verificationId: "ver-1",
        code: "123456",
        password: "GoodPass1!",
        passwordConfirm: "GoodPass1!",
      },
      testEnv,
      {
        checkVerification: async () => ({ ok: true }),
        updateUserPasswordHash: async (_db, userId, hash) => {
          hashUpdated = Boolean(userId === USER_ID && hash);
          return { ok: true };
        },
        revokeSessionsByBlessBoardUser: async () => ({ revokedCount: 2 }),
      }
    );
    assert.equal(done.ok, true);
    assert.equal(hashUpdated, true);
    assert.equal(done.sessionsRevoked, 2);
  });
});

describe("V2.04 BB portal blocked gate", () => {
  it("requireActiveMemberForTenant rejects blocked portal access", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originals = {
      findUser: memberRepo.findUserById,
      findChurch: memberRepo.findChurchById,
      findBranch: memberRepo.findBranchById,
      findMember: memberRepo.findActiveMemberByUserId,
      findMembership: memberRepo.findMembership,
    };
    memberRepo.findUserById = async () => ({ id: USER_ID, status: "active" });
    memberRepo.findChurchById = async () => ({ id: CHURCH, status: "active" });
    memberRepo.findBranchById = async () => ({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      church_id: CHURCH,
      status: "active",
    });
    memberRepo.findActiveMemberByUserId = async () =>
      baseMember({
        userId: USER_ID,
        portalAccessStatus: PORTAL_ACCESS_STATUS.BLOCKED,
      });
    memberRepo.findMembership = async () => ({ membershipStatus: "active" });
    try {
      const access = await requireActiveMemberForTenant(
        { query: async () => ({ rows: [] }) },
        {
          userId: USER_ID,
          churchId: CHURCH,
          branchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        }
      );
      assert.equal(access.ok, false);
      assert.equal(access.status, MEMBER_GATE_STATUS.PORTAL_BLOCKED);
    } finally {
      memberRepo.findUserById = originals.findUser;
      memberRepo.findChurchById = originals.findChurch;
      memberRepo.findBranchById = originals.findBranch;
      memberRepo.findActiveMemberByUserId = originals.findMember;
      memberRepo.findMembership = originals.findMembership;
    }
  });
});

describe("V2.04 BB member auth UI + routes wiring", () => {
  it("ships M13–M19 templates, CSS, router mount, and auth service", () => {
    const root = path.join(__dirname, "..");
    const templates = [
      "login.ejs",
      "activate.ejs",
      "create-password.ejs",
      "activated.ejs",
      "forgot-password.ejs",
      "recovery-verify.ejs",
      "recovery-failure.ejs",
    ];
    for (const name of templates) {
      const p = path.join(root, "views/blessboard/v5/member-auth", name);
      assert.equal(fs.existsSync(p), true, name);
      const src = fs.readFileSync(p, "utf8");
      assert.match(src, /BB-M1[3-9]/);
    }
    assert.equal(
      fs.existsSync(path.join(root, "public/blessboard/v5/member-auth.css")),
      true
    );
    const server = fs.readFileSync(
      path.join(root, "src/platform/http/v5FoundationServer.js"),
      "utf8"
    );
    assert.match(server, /createMemberPortalAuthRouter/);
    const routes = fs.readFileSync(
      path.join(root, "src/blessboard/http/memberPortalAuthRoutes.js"),
      "utf8"
    );
    assert.match(routes, /\/member\/login/);
    assert.match(routes, /\/member\/activate/);
    assert.match(routes, /\/member\/forgot-password/);
    assert.match(routes, /issueAuthenticatedSessionCookie/);
  });

  it("rate-limits repeated activation attempts", async () => {
    clearRates();
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const original = memberRepo.findMemberByChurchAndNumber;
    memberRepo.findMemberByChurchAndNumber = async () => null;
    try {
      let limited = false;
      for (let i = 0; i < 12; i += 1) {
        const result = await verifyFirstTimeMembership(
          {},
          {
            churchId: CHURCH,
            organizationId: ORG,
            memberNumber: "CH-RATE",
            fullName: "Rate Limit",
            phone: "+260971234567",
            phoneNormalized: "+260971234567",
            requestIp: "rate-limit-ip",
            env: ENV,
          }
        );
        if (result.code === RESULT.RATE_LIMITED) {
          limited = true;
          break;
        }
      }
      assert.equal(limited, true);
    } finally {
      memberRepo.findMemberByChurchAndNumber = original;
      clearRates();
    }
  });
});
