"use strict";

/**
 * D17 mutation probes. Mutants are written outside the repository and required
 * only by this file. The V13 working tree is not modified.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "../../..");

function loadMutant(rel, mutate) {
  const sourcePath = path.join(ROOT, rel);
  let text = fs.readFileSync(sourcePath, "utf8");
  const next = mutate(text);
  assert.notEqual(next, text, `mutation did not change ${rel}`);
  text = next.replace(/require\((['"])(\.[^'"]+)\1\)/g, (_match, quote, spec) => {
    const abs = require.resolve(spec, { paths: [path.dirname(sourcePath)] });
    return `require(${quote}${abs}${quote})`;
  });
  const dest = path.join(os.tmpdir(), `d17-mutant-${crypto.randomBytes(6).toString("hex")}.js`);
  fs.writeFileSync(dest, text);
  return require(dest);
}

function killed(run) {
  try {
    const value = run();
    if (value && typeof value.then === "function") {
      return value.then(
        () => false,
        () => true
      );
    }
    return false;
  } catch {
    return true;
  }
}

describe("D17 mutation probes", () => {
  it("kills a public-visibility mutation and a CTA-prefix mutation", async () => {
    const announcements = loadMutant("src/blessboard/services/announcementsService.js", (text) =>
      text.replace(
        'return resolveEffectiveStatus(ann, now) === "published";',
        "return true;"
      )
    );
    assert.equal(await killed(() => {
      assert.equal(announcements.isPubliclyVisible({ status: "draft" }, new Date()), false);
    }), true);

    const schema = loadMutant("src/platform/website/editableFieldSchema.js", (text) =>
      text.replace("text|cta|image|story", "text|image|story")
    );
    assert.equal(await killed(() => {
      const resolved = schema.resolveEditableField({
        productCode: "blessboard",
        pageKey: "home",
        sectionKey: "cta_visit",
        fieldKey: "buttonText",
      });
      assert.equal(resolved.ok, true);
    }), true);
  });

  it("kills an end-before-start mutation and a church-recipient mutation", async () => {
    const content = loadMutant("src/blessboard/services/publicContentAdminService.js", (text) =>
      text.replace(
        "if (endMs < startMs) return { ok: false, reason: \"ends_at\" };",
        "if (false && endMs < startMs) return { ok: false, reason: \"ends_at\" };"
      )
    );
    assert.equal(await killed(() => {
      const event = content.buildEventFields({
        title: "Prayer",
        startsAt: "2026-07-01T18:00",
        endsAt: "2026-07-01T17:00",
        timezone: "Africa/Lusaka",
        status: "published",
      }, { partial: false });
      assert.equal(event.ok, false);
    }), true);

    const contact = loadMutant("src/blessboard/services/publicChurchContactService.js", (text) =>
      text.replace(
        "const churchId = String(source.churchId || \"\").trim();",
        "const churchId = String((body && body.church_id) || source.churchId || \"\").trim();"
      )
    );
    const churchA = "11111111-1111-4111-8111-111111111111";
    const churchB = "44444444-4444-4444-8444-444444444444";
    const org = "22222222-2222-4222-8222-222222222222";
    const branch = "33333333-3333-4333-8333-333333333333";
    const result = await contact.submitPublicChurchEnquiry({
      async query(_sql, params) {
        return {
          rows: [{
            id: churchA,
            organization_id: params[0],
            church_id: params[1],
            branch_id: params[2],
            full_name: params[3],
            email: params[4],
            phone: params[5],
            message: params[6],
            status: "new",
            reviewed_by_user_id: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        };
      },
    }, {
      organizationId: org,
      churchId: churchA,
      branchId: branch,
    }, {
      full_name: "Visitor",
      email: "visitor@example.com",
      message: "We would like to visit on Sunday.",
      church_id: churchB,
    });
    assert.equal(result.churchId, churchB);
    assert.notEqual(result.churchId, churchA);
  });

  it("kills a fixed-OTP mutation and a facility-role mutation", async () => {
    const otp = loadMutant("src/platform/otp/otpService.js", (text) =>
      text.replace(
        "if (isProductionSignal(env) && submitted === OTP_POLICY.testingCode)",
        "if (false && isProductionSignal(env) && submitted === OTP_POLICY.testingCode)"
      )
    );
    const env = {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      DATABASE_IDENTITY_ENV: "production",
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
      GETPRO_OTP_PEPPER: "unit-test-otp-pepper-32b-minimum!!",
    };
    const service = otp.createOtpService();
    const started = await service.beginChallenge({
      action: "auth.login",
      productCode: "blessboard",
      channel: "email",
      organizationId: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      identifier: "member@example.com",
      accountResolved: true,
    }, env);
    const rejected = await service.verifyChallenge({
      action: "auth.login",
      productCode: "blessboard",
      channel: "email",
      organizationId: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      attemptId: started.server.attemptId,
      code: "1234",
    }, env);
    assert.notEqual(rejected.server.reason, "testing_code_rejected");

    const authz = loadMutant("src/activeclinic/services/activeClinicAuthorizationService.js", (text) =>
      text.replace(
        "if (FACILITY_SCOPE_ONLY_ROLES.includes(role.role_key))",
        "if (false && FACILITY_SCOPE_ONLY_ROLES.includes(role.role_key))"
      )
    );
    const staffId = "22222222-2222-4222-8222-222222222222";
    const orgId = "11111111-1111-4111-8111-111111111111";
    let assigned = { code: "threw" };
    try {
      assigned = await authz.assignStaffRole({
        async query(sql, params) {
          const text = String(sql);
          if (text.includes("activeclinic.staff_members") && params[1] === orgId) {
            return { rows: [{ id: staffId, organization_id: orgId, healthcare_organization_id: "55555555-5555-4555-8555-555555555555", first_name: "Ada", last_name: "Cashier", display_name: "Ada", phone_normalized: "+260977123456", phone_display: "0977", employment_type: "full_time", status: "active" }] };
          }
          if (text.includes("blessboard.roles")) {
            return { rows: [{ id: "44444444-4444-4444-8444-444444444444", role_key: "activeclinic_cashier", role_category: "activeclinic" }] };
          }
          return { rows: [] };
        },
      }, {
        organizationId: orgId,
        staffMemberId: staffId,
        roleKey: "activeclinic_cashier",
        scopeType: "organisation",
      });
    } catch {
      assigned = { code: "threw" };
    }
    assert.notEqual(assigned.code, "invalid_scope");
  });
});
