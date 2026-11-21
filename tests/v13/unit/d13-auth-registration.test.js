"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const {
  decideClinicPhoneOccupancy,
  REGISTRATION_IDENTITY_ACTION,
} = require("../../../src/platform/registration/resolveRegistrationContactIdentity");
const {
  phoneUniquenessSqlPredicate,
  DUPLICATE_PHONE_MESSAGE,
} = require("../../../src/blessboard/services/normalizeRegistrationPhone");
const {
  completeMemberPasswordRecovery,
  signDraft,
} = require("../../../src/blessboard/services/blessBoardMemberPortalAuthService");
const { resolveOtpProvider } = require("../../../src/blessboard/services/otp/otpProviders");

const ROOT = path.join(__dirname, "../../..");

describe("D13 authentication and registration guards", () => {
  it("reuses a clinic phone only when the existing credential matches", async () => {
    const hash = bcrypt.hashSync("Clinic-Password-13!", 4);
    const fresh = await decideClinicPhoneOccupancy({ password: "Clinic-Password-13!" });
    assert.equal(fresh.action, REGISTRATION_IDENTITY_ACTION.CREATE);

    const reused = await decideClinicPhoneOccupancy({
      password: "Clinic-Password-13!",
      applicationHashes: [hash],
    });
    assert.equal(reused.ok, true);
    assert.equal(reused.action, REGISTRATION_IDENTITY_ACTION.REUSE);

    const denied = await decideClinicPhoneOccupancy({
      password: "wrong-password-not-matching",
      applicationHashes: [hash],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "existing_account_password_mismatch");

    const staleApplication = bcrypt.hashSync("Old-Application-13!", 4);
    const identityWins = await decideClinicPhoneOccupancy({
      password: "Old-Application-13!",
      identityHash: hash,
      applicationHashes: [staleApplication],
    });
    assert.equal(identityWins.ok, false);
  });

  it("treats an active church phone as occupying and keeps the public error free of SQL", () => {
    const predicate = phoneUniquenessSqlPredicate("app");
    assert.match(predicate, /'active'/);
    assert.match(predicate, /'duplicate_review'/);
    assert.match(DUPLICATE_PHONE_MESSAGE, /already linked to a BlessBoard church registration/i);
    assert.doesNotMatch(DUPLICATE_PHONE_MESSAGE, /23505|contact_phone_normalized/);
    const service = fs.readFileSync(
      path.join(ROOT, "src/blessboard/services/platformChurchRegistrationService.js"),
      "utf8"
    );
    assert.match(service, /isUniquePhoneViolation\(err\)/);
    assert.match(service, /DUPLICATE_PHONE_MESSAGE/);
  });

  it("rejects a substituted recovery verification before checking the OTP", async () => {
    const env = { SESSION_SECRET: "d13-recovery-secret", DEPLOYMENT_ENV: "testing" };
    const draftToken = signDraft(
      {
        v: 1,
        exp: Date.now() + 60000,
        purpose: "recovery",
        churchId: "church-1",
        userId: "user-1",
        verificationId: "ver-1",
        memberNumber: "BB100",
      },
      env.SESSION_SECRET
    );
    let checked = false;
    const swapped = await completeMemberPasswordRecovery(
      null,
      {
        churchId: "church-1",
        draftToken,
        verificationId: "ver-other",
        code: "123456",
        password: "NewPassword1!",
        passwordConfirm: "NewPassword1!",
      },
      env,
      {
        checkVerification() {
          checked = true;
          return { ok: true, userId: "user-2" };
        },
      }
    );
    assert.equal(checked, false);
    assert.equal(swapped.ok, false);
    assert.equal(swapped.code, "otp_failed");
  });

  it("keeps the recovery page free of a testing OTP and refuses the test provider on a production signal", () => {
    const view = fs.readFileSync(
      path.join(ROOT, "views/blessboard/v5/member-auth/recovery-verify.ejs"),
      "utf8"
    );
    const route = fs.readFileSync(
      path.join(ROOT, "src/blessboard/http/memberPortalAuthRoutes.js"),
      "utf8"
    );
    assert.doesNotMatch(view, /data-bb-test-otp|Test code:/);
    assert.doesNotMatch(route, /testCode:/);
    const provider = resolveOtpProvider({
      NODE_ENV: "production",
      BLESSBOARD_OTP_PROVIDER: "test",
    });
    return provider.send({}).then((result) => {
      assert.equal(result.ok, false);
      assert.equal(result.reason, "test_provider_forbidden_in_production");
    });
  });
});
