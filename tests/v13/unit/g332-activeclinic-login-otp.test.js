"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const staff = require("../../../src/activeclinic/services/activeClinicStaffLoginOtp");
const patient = require("../../../src/activeclinic/services/activeClinicPatientLoginOtp");

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "33333333-3333-4333-8333-333333333333";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const HCO = "44444444-4444-4444-8444-444444444444";
const SECRET = "g332-unit-session-secret-32chars-min";

function observerEnv(flag) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_V13_BROWSER_AUTHORIZED: "1",
    GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
    SESSION_SECRET: SECRET,
    ...flag,
  };
}

function staffAccount(organizationId) {
  return {
    organizationId,
    accountId: ACCOUNT,
    healthcareOrganizationId: HCO,
    verifiedEmail: "staff.a@g332.example",
    mustChangePassword: false,
  };
}

describe("G332 ActiveClinic login OTP", () => {
  it("stays off for hosted production and for a testing process without the observer flag", () => {
    assert.equal(staff.staffLoginOtpActive({}), false);
    assert.equal(staff.staffLoginOtpActive(observerEnv({})), false);
    assert.equal(
      staff.staffLoginOtpActive({
        ...observerEnv({ GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER: "1" }),
        NODE_ENV: "production",
      }),
      false
    );
    assert.equal(patient.patientLoginOtpActive(observerEnv({})), false);
    assert.equal(
      patient.patientLoginOtpActive(observerEnv({ GETPRO_AC_PATIENT_LOGIN_OTP_OBSERVER: "1" })),
      true
    );
    assert.equal(
      staff.staffLoginOtpActive(observerEnv({ GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER: "1" })),
      true
    );
  });

  it("binds the challenge to the server identity and rejects a missing email", () => {
    const bound = staff.resolveServerLoginBinding(staffAccount(ORG_A));
    assert.equal(bound.ok, true);
    assert.equal(bound.organizationId, ORG_A);
    assert.equal(bound.productCode, "activeclinic");
    assert.equal(bound.purpose, "login");
    const missing = staff.resolveServerLoginBinding({ ...staffAccount(ORG_A), verifiedEmail: "" });
    assert.equal(missing.ok, false);
    const patientBound = patient.resolveServerLoginBinding({
      ...staffAccount(ORG_A),
      clinicKey: "v13-d19-clinic-a",
      patientId: "55555555-5555-4555-8555-555555555555",
    });
    assert.equal(patientBound.ok, true);
    assert.equal(patient.resolveServerLoginBinding({ ...staffAccount(ORG_A), clinicKey: "../other" }).ok, false);
  });

  it("rejects a tampered, expired, or cross-clinic cookie", () => {
    const env = observerEnv({ GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER: "1" });
    const sealed = staff.sealPendingLogin(
      {
        workflow: staff.WORKFLOW,
        attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        organizationId: ORG_A,
        accountId: ACCOUNT,
        healthcareOrganizationId: HCO,
        verifiedEmail: "staff.a@g332.example",
        mustChangePassword: false,
        deliveryAccepted: true,
        completion: "direct",
        exp: Date.now() + 60000,
      },
      env
    );
    const opened = staff.openPendingLogin(sealed, env);
    assert.equal(opened.organizationId, ORG_A);
    assert.notEqual(opened.organizationId, ORG_B);
    assert.equal(staff.openPendingLogin(`${sealed}x`, env), null);
    const expired = staff.sealPendingLogin(
      {
        workflow: staff.WORKFLOW,
        attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        organizationId: ORG_A,
        accountId: ACCOUNT,
        healthcareOrganizationId: HCO,
        verifiedEmail: "staff.a@g332.example",
        deliveryAccepted: true,
        exp: Date.now() - 1000,
      },
      env
    );
    assert.equal(staff.openPendingLogin(expired, env), null);
  });

  it("fails closed when the provider does not accept delivery", async () => {
    const env = observerEnv({ GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER: "1" });
    const binding = staff.resolveServerLoginBinding(staffAccount(ORG_A));
    const started = await staff.beginStaffLoginChallenge(binding, env, {
      async beginChallenge() {
        return { public: {}, server: { ok: false, reason: "delivery_not_activated" } };
      },
    });
    assert.equal(started.sessionAllowed, false);
    assert.equal(started.deliveryAccepted, false);
    assert.equal(started.reason, "delivery_not_activated");
  });

  it("accepts one code and rejects replay and a concurrent second completion", async () => {
    const env = observerEnv({ GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER: "1" });
    const binding = staff.resolveServerLoginBinding(staffAccount(ORG_A));
    let used = false;
    const service = {
      async beginChallenge() {
        return {
          public: {},
          server: { ok: true, attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", reason: "qa_observer_accepted" },
        };
      },
      async verifyChallenge(input) {
        if (input.organizationId !== ORG_A) {
          return { public: {}, server: { ok: false, reason: "cross_tenant" } };
        }
        if (used) return { public: {}, server: { ok: false, reason: "replay" } };
        if (input.code !== "482913") return { public: {}, server: { ok: false, reason: "invalid_code" } };
        used = true;
        return { public: {}, server: { ok: true, reason: "verified" } };
      },
      async completeProtectedAction(verified) {
        return verified.server.ok
          ? { sessionComplete: true, reason: "verified" }
          : { sessionComplete: false, reason: verified.server.reason };
      },
    };
    const started = await staff.beginStaffLoginChallenge(binding, env, service);
    assert.equal(started.deliveryAccepted, true);
    const pending = { ...binding, attemptId: started.attemptId, deliveryAccepted: true };
    const wrong = await staff.completeStaffLoginChallenge({ ...pending }, "000000", env, service);
    assert.equal(wrong.sessionComplete, false);
    const cross = await staff.completeStaffLoginChallenge(
      { ...pending, organizationId: ORG_B },
      "482913",
      env,
      service
    );
    assert.equal(cross.sessionComplete, false);
    assert.equal(cross.reason, "cross_tenant");
    const [first, second] = await Promise.all([
      staff.completeStaffLoginChallenge(pending, "482913", env, service),
      staff.completeStaffLoginChallenge(pending, "482913", env, service),
    ]);
    const winners = [first, second].filter((item) => item.sessionComplete);
    assert.equal(winners.length, 1);
    const replay = await staff.completeStaffLoginChallenge(pending, "482913", env, service);
    assert.equal(replay.sessionComplete, false);
    assert.equal(replay.reason, "replay");
  });

  it("renders the draft and published comparison for the website editor", async () => {
    const ejs = require("ejs");
    const path = require("path");
    const root = path.join(__dirname, "../../..");
    const section = await ejs.renderFile(
      path.join(root, "views/activeclinic/app/website-cms-section-settings.ejs"),
      {
        pageData: {
          cms: {
            clinicKey: "v13-d19-clinic-a",
            section: { id: "sec-1", type: "text", title: "Hero", heading: "Care", body: "Draft body", visible: true },
          },
        },
        csrfField: "_csrf",
        csrfToken: "token",
        shell: { healthcareOrganization: { publicName: "Clinic A" } },
      }
    );
    assert.match(section, /data-ac-stitch-screen="4d200465b37d4361a2abf1ff0834b2dc"/);
    assert.match(section, /data-ac-draft-published="1"/);
    assert.match(section, /role="alert"/);
    const image = await ejs.renderFile(
      path.join(root, "views/activeclinic/app/website-cms-section-settings.ejs"),
      {
        pageData: {
          cms: {
            clinicKey: "v13-d19-clinic-a",
            section: { id: "sec-2", type: "image", title: "Photo", image: { alt: "", src: "" }, visible: true },
          },
        },
        csrfField: "_csrf",
        csrfToken: "token",
        shell: {},
      }
    );
    assert.match(image, /data-ac-stitch-screen="b3bb570cc061466c9bb711a31f2f594d"/);
    assert.match(image, /name="imageAlt"/);
    const publish = await ejs.renderFile(
      path.join(root, "views/activeclinic/app/website-cms-publish.ejs"),
      {
        pageData: {
          website: { lastPublishedLabel: "24 Oct 2024", ux: { statusLabel: "Published" }, actions: {} },
          changes: [{ contentKey: "hero", changeType: "modified" }],
        },
        csrfField: "_csrf",
        csrfToken: "token",
        shell: {},
      }
    );
    assert.match(publish, /data-ac-stitch-screen="0ed58379267a4086afeab0862d0774bd"/);
    assert.match(publish, /Draft changes/);
    assert.match(publish, /hero/);
  });
});
