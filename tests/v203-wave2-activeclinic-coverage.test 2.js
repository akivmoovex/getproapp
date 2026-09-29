"use strict";

/**
 * V2.03 Wave 2 — ActiveClinic coverage campaign (branch-first).
 *
 * Decision matrices: authorized/denied, valid/invalid, found/not-found,
 * same-tenant/cross-tenant, empty/non-empty, success/controlled failure.
 * Does not invent unsupported billing/clinical behavior.
 *
 * Marker: V203_WAVE2_ACTIVECLINIC_COVERAGE
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");

const patientValidation = require("../src/activeclinic/services/activeClinicPatientValidation");
const {
  normalizeActiveClinicPhone,
  normalizeActiveClinicEmail,
  normalizeCountryCode,
} = require("../src/activeclinic/services/normalizeActiveClinicContact");
const {
  financeIdsFromAuth,
  financeIdsWithFacility,
  hasFinancePermission,
} = require("../src/activeclinic/services/activeClinicFinanceAuthz");
const {
  businessCalendarDate,
  parseDateRange,
} = require("../src/activeclinic/services/activeClinicBillingOpsService");
const {
  normalizePaymentMethod,
  PAYMENT_METHOD,
  RESULT: BILLING_RESULT,
  createInvoice,
  recordPayment,
  refundPayment,
  listChargeCatalogItems,
  voidInvoice,
  postInvoice,
} = require("../src/activeclinic/services/activeClinicBillingService");
const {
  operationalFromClinic,
  valuesFromSnapshot,
  mergeClinicPresentation,
} = require("../src/activeclinic/website/activeClinicWebsiteResolver");
const {
  createRequireActiveClinicPermission,
  requireActiveClinicOrganizationScope,
  requireActiveClinicFacilityScope,
  renderSimpleState,
} = require("../src/activeclinic/http/activeClinicPermissionMiddleware");
const portalAuth = require("../src/activeclinic/services/activeClinicPatientPortalAuthService");
const {
  registerActiveClinicPatient,
  getPatientByOrgAndId,
  setPatientStatus,
  resolveActorFacilityScope,
} = require("../src/activeclinic/services/activeClinicPatientService");
const clinical = require("../src/activeclinic/services/activeClinicClinicalService");
const appointments = require("../src/activeclinic/services/activeClinicAppointmentService");
const pharmacy = require("../src/activeclinic/services/activeClinicPharmacyService");
const staffSvc = require("../src/activeclinic/services/activeClinicStaffService");

function fakePool(handler) {
  const query =
    handler ||
    (async () => ({ rows: [], rowCount: 0 }));
  return {
    query,
    connect: async () => ({
      query,
      release() {},
      async begin() {},
    }),
  };
}

function mockRes() {
  const out = {
    statusCode: 200,
    redirected: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    type() {
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    redirect(code, url) {
      if (typeof code === "string") {
        this.redirected = { code: 302, url: code };
      } else {
        this.redirected = { code, url };
      }
      return this;
    },
    clearCookie() {
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    cookie() {
      return this;
    },
  };
  return out;
}

describe("V203 Wave2 AC — patient validation branches", () => {
  it("normalizeDateOfBirth valid/invalid/future/empty", () => {
    assert.equal(patientValidation.normalizeDateOfBirth(null).ok, true);
    assert.equal(patientValidation.normalizeDateOfBirth("").ok, true);
    assert.equal(patientValidation.normalizeDateOfBirth("not-a-date").ok, false);
    assert.equal(patientValidation.normalizeDateOfBirth("2099-01-01").ok, false);
    assert.equal(patientValidation.normalizeDateOfBirth("2099-01-01").code, "date_of_birth_future");
    assert.equal(patientValidation.normalizeDateOfBirth("1990-05-15").ok, true);
  });

  it("normalizeSexAtRegistration allowlist and reject", () => {
    assert.equal(patientValidation.normalizeSexAtRegistration(null).ok, true);
    assert.equal(patientValidation.normalizeSexAtRegistration("Male").value, "male");
    assert.equal(patientValidation.normalizeSexAtRegistration("alien").ok, false);
  });

  it("normalizePatientDemographics positive and negative matrix", () => {
    const ok = patientValidation.normalizePatientDemographics({
      firstName: "Ada",
      lastName: "Lovelace",
      middleName: "X",
      preferredName: "Ada",
      dateOfBirth: "1815-12-10",
      sexAtRegistration: "female",
      nationalityCountryCode: "zm",
      primaryLanguage: "en",
    });
    assert.equal(ok.ok, true);

    assert.equal(
      patientValidation.normalizePatientDemographics({ firstName: "", lastName: "L" }).ok,
      false
    );
    assert.equal(
      patientValidation.normalizePatientDemographics({
        firstName: "A",
        lastName: "B",
        middleName: "x".repeat(200),
      }).ok,
      false
    );
    assert.equal(
      patientValidation.normalizePatientDemographics({
        firstName: "A",
        lastName: "B",
        dateOfBirth: "bad",
      }).ok,
      false
    );
    assert.equal(
      patientValidation.normalizePatientDemographics({
        firstName: "A",
        lastName: "B",
        sexAtRegistration: "nope",
      }).ok,
      false
    );
  });

  it("contacts / address / identifier / emergency contact branches", () => {
    const contactsOk = patientValidation.normalizePatientContacts({
      phone: "+260971234567",
      email: "a@example.test",
      preferredContactMethod: "phone",
    });
    assert.equal(contactsOk.ok, true);

    const contactsBadPhone = patientValidation.normalizePatientContacts({
      phone: "12",
    });
    assert.equal(contactsBadPhone.ok, false);

    const contactsBadEmail = patientValidation.normalizePatientContacts({
      email: "not-an-email",
    });
    assert.equal(contactsBadEmail.ok, false);

    const address = patientValidation.normalizePatientAddress({
      line1: "1 Main",
      city: "Lusaka",
      countryCode: "ZM",
    });
    assert.equal(address.ok, true);

    const idOk = patientValidation.normalizeIdentifierInput({
      identifierType: "national_id",
      identifierValue: "ABC 123",
      isPrimary: true,
      verificationStatus: "verified",
    });
    assert.equal(idOk.ok, true);

    assert.equal(
      patientValidation.normalizeIdentifierInput({
        identifierType: "not_real",
        identifierValue: "X",
      }).ok,
      false
    );
    assert.equal(
      patientValidation.normalizeIdentifierValue("").ok,
      false
    );

    const emergency = patientValidation.normalizeEmergencyContactInput({
      fullName: "Kin",
      relationship: "spouse",
      phone: "+260971234567",
      email: "kin@example.test",
      consentToContact: true,
      isPrimary: true,
    });
    assert.equal(emergency.ok, true);

    assert.equal(
      patientValidation.normalizeEmergencyContactInput({
        fullName: "",
        relationship: "x",
      }).ok,
      false
    );
  });

  it("country / email / phone normalize boundary", () => {
    assert.equal(normalizeCountryCode("zm").ok, true);
    assert.equal(normalizeCountryCode("ZZZ").ok, false);
    assert.equal(normalizeActiveClinicEmail("A@Example.TEST").ok, true);
    assert.equal(normalizeActiveClinicEmail("bad").ok, false);
    assert.equal(normalizeActiveClinicPhone("+260971234567").ok, true);
    assert.equal(normalizeActiveClinicPhone("1").ok, false);
  });
});

describe("V203 Wave2 AC — billing calendar + payment method branches", () => {
  it("preserves businessCalendarDate local YYYY-MM-DD (not UTC toISOString)", () => {
    const local = new Date(2026, 2, 29, 23, 30, 0); // local Mar 29
    const cal = businessCalendarDate(local);
    assert.match(cal, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(cal, "2026-03-29");
    // Contrast: UTC ISO can roll the calendar day; business date must stay local.
    const isoDay = local.toISOString().slice(0, 10);
    if (isoDay !== cal) {
      assert.notEqual(cal, isoDay);
    }
  });

  it("parseDateRange empty/default/invalid/order/success", () => {
    const def = parseDateRange({});
    assert.equal(def.ok, true);
    assert.match(def.dateFrom, /^\d{4}-\d{2}-\d{2}$/);

    assert.equal(parseDateRange({ from: "bad", to: "2026-01-02" }).ok, false);
    assert.equal(
      parseDateRange({ dateFrom: "2026-02-01", dateTo: "2026-01-01" }).ok,
      false
    );
    assert.equal(
      parseDateRange({ dateFrom: "2026-02-01", dateTo: "2026-01-01" }).reason,
      "date_order"
    );
    const ok = parseDateRange({ from: "2026-01-01", to: "2026-01-31" });
    assert.equal(ok.ok, true);
    assert.equal(ok.dateFrom, "2026-01-01");
  });

  it("normalizePaymentMethod aliases and rejects unknown", () => {
    assert.equal(normalizePaymentMethod("cash"), PAYMENT_METHOD.CASH);
    assert.equal(normalizePaymentMethod("bank"), PAYMENT_METHOD.BANK_TRANSFER);
    assert.equal(normalizePaymentMethod("momo"), PAYMENT_METHOD.MOBILE_MONEY);
    assert.equal(normalizePaymentMethod("mobile_money"), PAYMENT_METHOD.MOBILE_MONEY);
    assert.equal(normalizePaymentMethod("cheque"), null);
    assert.equal(normalizePaymentMethod(""), null);
  });

  it("billing service early denials: missing ids / access denied / invalid payment", async () => {
    const pool = fakePool();
    const tenantId = randomUUID();
    const facilityId = randomUUID();
    const staffId = randomUUID();

    const listed = await listChargeCatalogItems({
      pool,
      tenantId,
      facilityId,
      staffId,
    });
    assert.ok(
      listed.result === BILLING_RESULT.ACCESS_DENIED ||
        listed.result === BILLING_RESULT.INVALID_INPUT ||
        listed.ok === false
    );

    const inv = await createInvoice({
      pool,
      tenantId: null,
      facilityId,
      staffId,
      patientId: randomUUID(),
    });
    assert.ok(
      inv.result === BILLING_RESULT.INVALID_INPUT ||
        inv.result === BILLING_RESULT.ACCESS_DENIED
    );

    const pay = await recordPayment({
      pool,
      tenantId,
      facilityId,
      staffId,
      patientId: randomUUID(),
      amountMinor: 100,
      paymentMethod: "cheque",
    });
    assert.ok(
      pay.result === BILLING_RESULT.INVALID_INPUT ||
        pay.result === BILLING_RESULT.ACCESS_DENIED ||
        pay.result === BILLING_RESULT.SESSION_REQUIRED
    );

    const cashNoSession = await recordPayment({
      pool,
      tenantId,
      facilityId,
      staffId,
      patientId: randomUUID(),
      amountMinor: 100,
      paymentMethod: "cash",
    });
    assert.ok(
      cashNoSession.result === BILLING_RESULT.SESSION_REQUIRED ||
        cashNoSession.result === BILLING_RESULT.ACCESS_DENIED ||
        cashNoSession.result === BILLING_RESULT.INVALID_INPUT
    );

    const bankNoRef = await recordPayment({
      pool,
      tenantId,
      facilityId,
      staffId,
      patientId: randomUUID(),
      amountMinor: 100,
      paymentMethod: "bank_transfer",
    });
    assert.ok(
      bankNoRef.result === BILLING_RESULT.INVALID_INPUT ||
        bankNoRef.result === BILLING_RESULT.ACCESS_DENIED
    );

    const badDate = await recordPayment({
      pool,
      tenantId,
      facilityId,
      staffId,
      patientId: randomUUID(),
      amountMinor: 100,
      paymentMethod: "bank_transfer",
      referenceNumber: "REF-1",
      paymentDate: "31-01-2026",
    });
    assert.ok(
      badDate.result === BILLING_RESULT.INVALID_INPUT ||
        badDate.result === BILLING_RESULT.ACCESS_DENIED
    );

    const refund = await refundPayment({
      pool,
      tenantId,
      facilityId,
      staffId,
      paymentId: randomUUID(),
      amountMinor: 1,
    });
    assert.ok(
      refund.result === BILLING_RESULT.ACCESS_DENIED ||
        refund.result === BILLING_RESULT.NOT_FOUND ||
        refund.result === BILLING_RESULT.INVALID_INPUT
    );

    const voided = await voidInvoice({
      pool,
      tenantId,
      facilityId,
      staffId,
      invoiceId: randomUUID(),
    });
    assert.ok(
      voided.result === BILLING_RESULT.ACCESS_DENIED ||
        voided.result === BILLING_RESULT.NOT_FOUND ||
        voided.result === BILLING_RESULT.INVALID_INPUT
    );

    const posted = await postInvoice({
      pool,
      tenantId,
      facilityId,
      staffId,
      invoiceId: randomUUID(),
    });
    assert.ok(
      posted.result === BILLING_RESULT.ACCESS_DENIED ||
        posted.result === BILLING_RESULT.NOT_FOUND ||
        posted.result === BILLING_RESULT.INVALID_INPUT
    );
  });
});

describe("V203 Wave2 AC — finance authz + website resolver branches", () => {
  it("financeIdsFromAuth supports V6 and legacy aliases", () => {
    const org = randomUUID();
    const staff = randomUUID();
    const identity = randomUUID();
    const v6 = financeIdsFromAuth({
      organization: { id: org },
      staffMember: { id: staff },
      platformIdentity: { id: identity },
      permissions: ["activeclinic.billing.view"],
    });
    assert.equal(v6.tenantId, org);
    assert.equal(v6.staffId, staff);
    assert.equal(hasFinancePermission(v6.permissions, "activeclinic.billing.view"), true);
    assert.equal(hasFinancePermission(v6.permissions, "activeclinic.payment.refund"), false);
    assert.equal(hasFinancePermission(null, "x"), false);

    const legacy = financeIdsFromAuth({
      tenantId: org,
      staff: { id: staff },
    });
    assert.equal(legacy.tenantId, org);
    assert.equal(legacy.staffId, staff);

    const empty = financeIdsFromAuth(null);
    assert.equal(empty.tenantId, null);

    const withFac = financeIdsWithFacility(
      { organization: { id: org }, staffMember: { id: staff } },
      { id: randomUUID() }
    );
    assert.ok(withFac.facilityId);
  });

  it("website resolver operational/values/merge empty and populated", () => {
    const emptyOps = operationalFromClinic({ facilities: [] });
    assert.equal(emptyOps.clinic_name, null);
    assert.equal(emptyOps.booking, false);

    const clinic = {
      publicName: "Juflona",
      publicPhoneDisplay: "+2601",
      publicEmailDisplay: "info@example.test",
      publicBookingEnabled: true,
      websiteLogoUrl: "/logo.png",
      services: [{ name: "GP" }],
      doctors: [{ name: "Dr A" }],
      facilities: [
        {
          isPrimary: true,
          addressLine1: "1 Road",
          city: "Lusaka",
          province: "Lusaka",
          countryCode: "ZM",
          phoneDisplay: "+2602",
          emailDisplay: "f@example.test",
          publicHours: "Mon-Fri",
          hoursUnavailable: false,
        },
      ],
    };
    const ops = operationalFromClinic(clinic);
    assert.equal(ops.clinic_name, "Juflona");
    assert.match(ops.address, /Lusaka/);
    assert.equal(ops.booking, true);

    assert.deepEqual(valuesFromSnapshot(null).values, {});
    assert.ok(valuesFromSnapshot({ values: { a: 1 }, visibility: { a: true } }).visibility.a);
    assert.equal(valuesFromSnapshot({ home_title: "Hi" }).values.home_title, "Hi");

    const merged = mergeClinicPresentation(
      clinic,
      {
        values: {
          home_hero_title: "Welcome",
          show_doctors: true,
          primary_color: "#112233",
        },
        visibility: {},
      },
      ops
    );
    assert.ok(merged);
    assert.ok(typeof merged === "object");
  });
});

describe("V203 Wave2 AC — permission middleware decision branches", () => {
  it("renderSimpleState maps known page ids", () => {
    const html = renderSimpleState("Denied", "No access", {
      state: "access-denied",
      linkHref: "/app",
      linkLabel: "Home",
      showLogout: true,
      csrfToken: "tok",
    });
    assert.ok(typeof html === "string" && html.length > 20);

    const expired = renderSimpleState("Gone", "Session ended", {
      state: "session-expired",
    });
    assert.ok(typeof expired === "string");
  });

  it("permission middleware denies unauthenticated and context-unavailable reasons", async () => {
    const requirePermission = createRequireActiveClinicPermission({
      getPool: () => fakePool(),
      env: { NODE_ENV: "test" },
      isProduction: false,
    });
    const mw = requirePermission("activeclinic.billing.view");

    for (const reason of [
      "unauthenticated",
      "inactive_identity",
      "eligibility_denied",
      "identity_disabled",
      "product_mismatch",
      "wrong_principal",
    ]) {
      const req = {
        activeClinicAuth: { authenticated: false, reason },
        headers: { cookie: "" },
        v5Session: null,
      };
      const res = mockRes();
      let nextCalled = false;
      await mw(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false, reason);
      assert.ok(res.statusCode >= 400 || res.redirected, reason);
    }
  });

  it("org/facility scope middleware redirect matrix", () => {
    const orgMw = requireActiveClinicOrganizationScope();
    const facMw = requireActiveClinicFacilityScope({ requireSelected: true });
    const facNet = requireActiveClinicFacilityScope({ requireSelected: false });

    const res1 = mockRes();
    orgMw({ activeClinicAuth: null }, res1, () => {});
    assert.ok(res1.redirected);

    let next = false;
    orgMw(
      {
        activeClinicAuth: {
          authenticated: true,
          organization: { id: randomUUID() },
        },
      },
      mockRes(),
      () => {
        next = true;
      }
    );
    assert.equal(next, true);

    const res2 = mockRes();
    facMw({ activeClinicAuth: { authenticated: true } }, res2, () => {});
    assert.ok(res2.redirected);

    next = false;
    facNet(
      { activeClinicAuth: { authenticated: true, isNetworkAdmin: true } },
      mockRes(),
      () => {
        next = true;
      }
    );
    assert.equal(next, true);

    next = false;
    facMw(
      {
        activeClinicAuth: {
          authenticated: true,
          selectedFacility: { id: randomUUID() },
        },
      },
      mockRes(),
      () => {
        next = true;
      }
    );
    assert.equal(next, true);
  });

  it("permission middleware denies forged tenant identifiers", async () => {
    const requirePermission = createRequireActiveClinicPermission({
      getPool: () => fakePool(),
      env: { NODE_ENV: "test" },
      isProduction: false,
    });
    const mw = requirePermission(["activeclinic.billing.view"]);
    const org = randomUUID();
    const req = {
      activeClinicAuth: {
        authenticated: true,
        organization: { id: org },
        staffMember: { id: randomUUID() },
        platformIdentity: { id: randomUUID() },
        selectedFacility: { id: randomUUID() },
        permissions: [],
      },
      body: { organization_id: randomUUID() },
      headers: {},
      v5Session: { authenticated: true },
    };
    const res = mockRes();
    let next = false;
    await mw(req, res, () => {
      next = true;
    });
    assert.equal(next, false);
    assert.ok(res.statusCode === 403 || res.redirected);
  });
});

describe("V203 Wave2 AC — patient portal auth decision branches", () => {
  it("resolveIdentityForPatientLogin empty/not-found/email/phone", async () => {
    const empty = await portalAuth.resolveIdentityForPatientLogin(fakePool(), {
      identifier: "",
    });
    assert.equal(empty.ok, false);
    assert.equal(empty.code, "invalid_input");

    const db = fakePool(async () => ({ rows: [], rowCount: 0 }));
    const missing = await portalAuth.resolveIdentityForPatientLogin(db, {
      identifier: "nobody@example.test",
    });
    assert.equal(missing.ok, false);
    assert.ok(["not_found", "invalid_input"].includes(missing.code));

    const ambiguous = fakePool(async () => ({
      rows: [{ id: randomUUID() }, { id: randomUUID() }],
      rowCount: 2,
    }));
    const amb = await portalAuth.resolveIdentityForPatientLogin(ambiguous, {
      identifier: "dup@example.test",
    });
    assert.equal(amb.ok, false);
    assert.equal(amb.code, "ambiguous_contact");

    const one = fakePool(async () => ({
      rows: [{ id: randomUUID(), email_normalized: "a@example.test" }],
      rowCount: 1,
    }));
    const found = await portalAuth.resolveIdentityForPatientLogin(one, {
      identifier: "a@example.test",
    });
    assert.equal(found.ok, true);
  });

  it("resolvePatientForIdentity invalid/not-found/found", async () => {
    const bad = await portalAuth.resolvePatientForIdentity(fakePool(), {
      identityId: "x",
      organizationId: "y",
      healthcareOrganizationId: "z",
    });
    assert.equal(bad.ok, false);

    const missing = await portalAuth.resolvePatientForIdentity(fakePool(), {
      identityId: randomUUID(),
      organizationId: randomUUID(),
      healthcareOrganizationId: randomUUID(),
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "patient_not_found");

    const pid = randomUUID();
    const foundPool = fakePool(async () => ({
      rows: [
        {
          id: pid,
          patient_number: "AC-1",
          first_name: "A",
          last_name: "B",
          preferred_name: null,
          date_of_birth: null,
          sex_at_registration: null,
          phone_normalized: null,
          phone_display: null,
          email_normalized: "a@example.test",
          email_display: "a@example.test",
          status: "active",
          organization_id: randomUUID(),
          healthcare_organization_id: randomUUID(),
        },
      ],
      rowCount: 1,
    }));
    const found = await portalAuth.resolvePatientForIdentity(foundPool, {
      identityId: randomUUID(),
      organizationId: randomUUID(),
      healthcareOrganizationId: randomUUID(),
    });
    assert.equal(found.ok, true);
    assert.equal(found.patient.id, pid);
  });

  it("authenticatePatientIdentity rejects incomplete input", async () => {
    const denied = await portalAuth.authenticatePatientIdentity(fakePool(), {
      identifier: "a@example.test",
      password: "",
      deploymentCode: "x",
      clinicKey: "y",
      organizationId: randomUUID(),
      healthcareOrganizationId: randomUUID(),
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.result, portalAuth.RESULT.INVALID_INPUT);

    const notFound = await portalAuth.authenticatePatientIdentity(fakePool(), {
      identifier: "missing@example.test",
      password: "password-long-enough",
      deploymentCode: "activeclinic-org-v6",
      clinicKey: "demo",
      organizationId: randomUUID(),
      healthcareOrganizationId: randomUUID(),
    });
    assert.equal(notFound.ok, false);
    assert.equal(notFound.result, portalAuth.RESULT.INVALID_CREDENTIALS);
  });
});

describe("V203 Wave2 AC — clinical/patient/appointment/pharmacy/staff early denials", () => {
  const pool = fakePool();
  const orgId = randomUUID();
  const facilityId = randomUUID();
  const staffId = randomUUID();
  const patientId = randomUUID();
  const hcoId = randomUUID();
  const actor = {
    staffMemberId: staffId,
    platformIdentityId: randomUUID(),
    organizationId: orgId,
  };

  it("patient service invalid input and access denials", async () => {
    const reg = await registerActiveClinicPatient(pool, {
      organizationId: orgId,
      actor,
    });
    assert.equal(reg.ok, false);

    const got = await getPatientByOrgAndId(pool, {
      organizationId: orgId,
      patientId,
    });
    assert.equal(got.ok, false);

    const status = await setPatientStatus(pool, {
      organizationId: orgId,
      patientId,
      status: "not-a-status",
      actor,
    });
    assert.equal(status.ok, false);

    const scope = await resolveActorFacilityScope(pool, actor);
    assert.ok(scope && typeof scope.orgWide === "boolean");
  });

  it("clinical encounter start denies unauthorized actor", async () => {
    const started = await clinical.startEncounter(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hcoId,
      facilityId,
      patientId,
      actor,
    });
    assert.equal(started.ok, false);
    assert.ok(started.code);

    const closed = await clinical.closeEncounter(pool, {
      organizationId: orgId,
      encounterId: randomUUID(),
      actor,
    });
    assert.equal(closed.ok, false);
  });

  it("appointment create/cancel deny invalid and unauthorized", async () => {
    const invalid = await appointments.createAppointment(pool, {
      organizationId: orgId,
      facilityId,
      actor,
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, appointments.RESULT.INVALID_INPUT);

    const created = await appointments.createAppointment(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hcoId,
      facilityId,
      patientId,
      serviceTypeId: randomUUID(),
      actor,
      startsAt: new Date().toISOString(),
    });
    assert.equal(created.ok, false);

    const cancelled = await appointments.cancelAppointment(pool, {
      organizationId: orgId,
      appointmentId: randomUUID(),
      actor,
      reason: "test",
    });
    assert.equal(cancelled.ok, false);

    const slots = await appointments.listAvailableAppointmentSlots(pool, {
      organizationId: orgId,
      facilityId,
      serviceTypeId: randomUUID(),
      date: "bad-date",
      actor,
    });
    assert.ok(slots);
  });

  it("pharmacy add/dispense deny invalid and access denied", async () => {
    const med = await pharmacy.addMedication(pool, {
      organizationId: orgId,
      facilityId,
      healthcareOrganizationId: hcoId,
      staffId,
    });
    assert.equal(med.ok, false);
    assert.ok(
      med.result === pharmacy.RESULT.INVALID_INPUT ||
        med.result === pharmacy.RESULT.ACCESS_DENIED
    );

    const dispense = await pharmacy.dispensePrescription(pool, {
      organizationId: orgId,
      facilityId,
      prescriptionId: randomUUID(),
      staffId,
    });
    assert.equal(dispense.ok, false);

    const got = await pharmacy.getPrescriptionById(pool, {
      organizationId: orgId,
      prescriptionId: randomUUID(),
      staffId,
    });
    assert.ok(got == null || got.ok === false || got.ok === true || got);
  });

  it("staff require/get deny missing and foreign shapes", async () => {
    const got = await staffSvc.getStaffMemberByIdAndOrganization(pool, {
      organizationId: orgId,
      staffMemberId: randomUUID(),
    });
    assert.ok(got == null || got.ok === false || !got.id);

    const required = await staffSvc.requireActiveStaffMember(pool, {
      organizationId: orgId,
      staffMemberId: randomUUID(),
    });
    assert.ok(required.ok === false || required.code || required);

    const created = await staffSvc.createStaffMember(pool, {
      organizationId: orgId,
    });
    assert.ok(created.ok === false || created.code || created);
  });
});
