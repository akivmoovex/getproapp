"use strict";

/**
 * ActiveClinic P07 — Billing & Cashier UI parity tests
 * HTTP smoke tests: auth, CSRF, create charge, invoice, payment, receipt, session
 */

const request = require("supertest");
const { createActiveClinicFoundationApp } = require("../src/activeclinic/http/activeClinicFoundationServer");
const { getPgPool } = require("../src/db/pg");
const { createPlatformIdentitySession } = require("../src/platform/session/createDeploymentSession");
const { setV5SessionCookie } = require("../src/platform/session/v5SessionCookie");

describe("ActiveClinic P07 Billing & Cashier UI", () => {
  let app;
  let pool;
  let agent;
  let sessionToken;
  let csrfToken;
  let testContext;

  beforeAll(async () => {
    pool = getPgPool();
    app = createActiveClinicFoundationApp({ getPool: () => pool });
    agent = request.agent(app);

    // Setup test data: organization, facility, staff, patient
    const orgResult = await pool.query(
      `INSERT INTO platform.organizations (id, key, display_name, description, product_code)
       VALUES (gen_random_uuid(), 'test-billing-org', 'Test Billing Org', 'Test', 'activeclinic')
       RETURNING id`
    );
    const orgId = orgResult.rows[0].id;

    const hcoResult = await pool.query(
      `INSERT INTO activeclinic.healthcare_organizations (organization_id, public_name, legal_name)
       VALUES ($1, 'Test Clinic', 'Test Clinic Ltd')
       RETURNING organization_id`,
      [orgId]
    );

    const facilityResult = await pool.query(
      `INSERT INTO activeclinic.facilities (id, tenant_id, facility_key, display_name, facility_type, facility_code)
       VALUES (gen_random_uuid(), $1, 'main', 'Main Facility', 'hospital', 'MAIN')
       RETURNING id`,
      [orgId]
    );
    const facilityId = facilityResult.rows[0].id;

    const identityResult = await pool.query(
      `INSERT INTO platform.identities (id, email_normalized, status)
       VALUES (gen_random_uuid(), 'billing-test@example.com', 'active')
       RETURNING id`
    );
    const identityId = identityResult.rows[0].id;

    const staffResult = await pool.query(
      `INSERT INTO activeclinic.staff (id, tenant_id, platform_identity_id, first_name, last_name, status)
       VALUES (gen_random_uuid(), $1, $2, 'Billing', 'Tester', 'active')
       RETURNING id`,
      [orgId, identityId]
    );
    const staffId = staffResult.rows[0].id;

    // Grant all billing permissions
    const roleResult = await pool.query(
      `INSERT INTO blessboard.roles (id, role_key, role_name)
       VALUES (gen_random_uuid(), 'test_billing_admin', 'Test Billing Admin')
       RETURNING id`
    );
    const roleId = roleResult.rows[0].id;

    const permissionsResult = await pool.query(
      `SELECT id, permission_key FROM blessboard.permissions
       WHERE permission_key LIKE 'activeclinic.billing%'
          OR permission_key LIKE 'activeclinic.payment%'
          OR permission_key LIKE 'activeclinic.cashier%'
          OR permission_key = 'activeclinic.access'`
    );

    for (const perm of permissionsResult.rows) {
      await pool.query(
        `INSERT INTO blessboard.role_permissions (role_id, permission_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [roleId, perm.id]
      );
    }

    await pool.query(
      `INSERT INTO blessboard.role_grants (role_id, subject_type, subject_id, scope_type, scope_id, granted_by_identity_id)
       VALUES ($1, 'identity', $2, 'organization', $3, $2)`,
      [roleId, identityId, orgId]
    );

    // Create session
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: "activeclinic-org-v6",
      platformIdentityId: identityId,
      organizationId: orgId,
      ip: "127.0.0.1",
      userAgent: "test",
    });

    if (!session.ok) {
      throw new Error("Failed to create session");
    }

    sessionToken = session.rawToken;

    // Set session context with selected facility
    await pool.query(
      `UPDATE platform.sessions
       SET context_json = jsonb_set(COALESCE(context_json, '{}'::jsonb), '{selectedFacilityId}', $1::text::jsonb)
       WHERE raw_token = $2`,
      [facilityId, sessionToken]
    );

    // Create a patient for testing
    const patientResult = await pool.query(
      `INSERT INTO activeclinic.patients (id, tenant_id, first_name, last_name, sex)
       VALUES (gen_random_uuid(), $1, 'Test', 'Patient', 'male')
       RETURNING id`,
      [orgId]
    );
    const patientId = patientResult.rows[0].id;

    await pool.query(
      `INSERT INTO activeclinic.patient_registrations (patient_id, tenant_id, facility_id, patient_number, registration_method)
       VALUES ($1, $2, $3, 'P001', 'walk_in')`,
      [patientId, orgId, facilityId]
    );

    testContext = {
      orgId,
      facilityId,
      staffId,
      identityId,
      patientId,
      patientNumber: "P001",
    };
  });

  afterAll(async () => {
    // Cleanup
    if (testContext && testContext.orgId) {
      await pool.query(`DELETE FROM platform.organizations WHERE id = $1`, [testContext.orgId]);
    }
    await pool.end();
  });

  async function makeAuthRequest(method, path) {
    return agent[method](path).set("Cookie", `v5_session=${sessionToken}`);
  }

  async function extractCsrfToken(html) {
    const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
    return match ? match[1] : null;
  }

  describe("Billing Routes", () => {
    it("should load billing dashboard with auth", async () => {
      const res = await makeAuthRequest("get", "/app/billing");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Billing overview");
      csrfToken = await extractCsrfToken(res.text);
      expect(csrfToken).toBeTruthy();
    });

    it("should load charge catalog", async () => {
      const res = await makeAuthRequest("get", "/app/billing/catalog");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Charge catalog");
    });

    it("should create charge catalog item", async () => {
      const res = await makeAuthRequest("post", "/app/billing/catalog")
        .type("form")
        .send({
          _csrf: csrfToken,
          code: "TEST-001",
          name: "Test Consultation",
          description: "Test service",
          category: "consultation",
          amount: "100.00",
        });
      expect(res.status).toBe(303);
      expect(res.header.location).toBe("/app/billing/catalog");
    });

    it("should load patient billing account", async () => {
      const res = await makeAuthRequest("get", `/app/billing/patients/${testContext.patientNumber}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Patient account");
    });

    it("should load invoice creation form", async () => {
      const res = await makeAuthRequest("get", "/app/billing/invoices/new");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Create invoice");
    });

    it("should load invoice list", async () => {
      const res = await makeAuthRequest("get", "/app/billing/invoices");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Invoices");
    });
  });

  describe("Cashier Routes", () => {
    it("should load cashier dashboard", async () => {
      const res = await makeAuthRequest("get", "/app/cashier");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Cashier operations");
    });

    it("should load open session form", async () => {
      const res = await makeAuthRequest("get", "/app/cashier/open");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Open cashier session");
    });

    it("should open cashier session", async () => {
      const res = await makeAuthRequest("post", "/app/cashier/open")
        .type("form")
        .send({
          _csrf: csrfToken,
          opening_cash: "500.00",
          notes: "Test session",
        });
      expect(res.status).toBe(303);
      expect(res.header.location).toBe("/app/cashier");
    });

    it("should load current session detail", async () => {
      const res = await makeAuthRequest("get", "/app/cashier/session");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Current session");
    });

    it("should load payment form", async () => {
      const res = await makeAuthRequest("get", "/app/cashier/payment");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Record payment");
    });

    it("should load session history", async () => {
      const res = await makeAuthRequest("get", "/app/cashier/history");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Session history");
    });
  });

  describe("CSRF Protection", () => {
    it("should reject POST without CSRF token", async () => {
      const res = await makeAuthRequest("post", "/app/billing/catalog")
        .type("form")
        .send({
          code: "FAIL-001",
          name: "Should Fail",
          amount: "50.00",
        });
      expect(res.status).toBe(403);
    });

    it("should reject POST with invalid CSRF token", async () => {
      const res = await makeAuthRequest("post", "/app/billing/catalog")
        .type("form")
        .send({
          _csrf: "invalid-token",
          code: "FAIL-002",
          name: "Should Fail",
          amount: "50.00",
        });
      expect(res.status).toBe(403);
    });
  });

  describe("Money Formatting", () => {
    const { formatMoney, formatMoneyPlain, parseMoneyInput } = require("../src/activeclinic/services/formatMoney");

    it("should format minor units to ZMW", () => {
      expect(formatMoney(10000)).toBe("ZMW 100.00");
      expect(formatMoney(50050)).toBe("ZMW 500.50");
      expect(formatMoney(0)).toBe("ZMW 0.00");
    });

    it("should format without currency code", () => {
      expect(formatMoneyPlain(10000)).toBe("100.00");
      expect(formatMoneyPlain(50050)).toBe("500.50");
    });

    it("should parse money input", () => {
      expect(parseMoneyInput("100.00")).toBe(10000);
      expect(parseMoneyInput("500.50")).toBe(50050);
      expect(parseMoneyInput("1,000.00")).toBe(100000);
      expect(parseMoneyInput("invalid")).toBeNull();
      expect(parseMoneyInput("-50.00")).toBeNull();
    });

    it("should handle integer minor units correctly", () => {
      const amount = 123456; // 1234.56 ZMW
      expect(formatMoney(amount)).toBe("ZMW 1,234.56");
      expect(parseMoneyInput("1234.56")).toBe(123456);
    });
  });

  describe("Stitch Screen IDs", () => {
    it("should include stitch IDs in billing dashboard", async () => {
      const res = await makeAuthRequest("get", "/app/billing");
      expect(res.status).toBe(200);
      expect(res.text).toContain('data-ac-stitch-desktop="ece0b9d1d9384f5d8c1e3b944f122e47"');
    });

    it("should include stitch IDs in cashier dashboard", async () => {
      const res = await makeAuthRequest("get", "/app/cashier");
      expect(res.status).toBe(200);
      expect(res.text).toContain('data-ac-stitch-desktop="792d5cbb6f234332a088399e4ccdd545"');
    });

    it("should include stitch IDs in catalog", async () => {
      const res = await makeAuthRequest("get", "/app/billing/catalog");
      expect(res.status).toBe(200);
      expect(res.text).toContain('data-ac-stitch-desktop="4ca894f70d6646eca246847cd8c39d6a"');
    });
  });
});
