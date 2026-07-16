"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const {
  TEMPLATE_KEYS,
  validateTemplatesAgainstAllowlist,
  sampleVariablesForTemplate,
  getTemplateDefinition,
} = require("../src/church/notificationTemplateCatalogue");
const { sanitizeNotificationHtml } = require("../src/church/notificationTemplateSanitize");
const notificationTemplateService = require("../src/services/church/notificationTemplateService");
const { issueChurchSessionCsrfToken } = require("../src/church/churchSessionCsrf");
const churchRoutes = require("../src/routes/church");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const { ROLES } = require("../src/auth/roles");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const EXPECTED_KEYS = [
  "welcome_administrator",
  "member_registration_received",
  "member_approved",
  "member_rejected",
  "growth_trial_reminder",
  "growth_trial_expiry",
  "quota_warning",
  "branch_activation",
  "branch_deactivation",
  "foundation_dormancy_warning",
  "password_reset_support_notice",
];

test("catalogue includes the required system templates", () => {
  for (const key of EXPECTED_KEYS) {
    assert.ok(TEMPLATE_KEYS.includes(key), `missing ${key}`);
    assert.ok(getTemplateDefinition(key));
  }
});

test("default rendering fills sample merge fields", () => {
  const key = "member_approved";
  const def = getTemplateDefinition(key);
  const rendered = notificationTemplateService.renderTemplateContent(
    {
      key,
      subjectTemplate: def.defaultSubject,
      bodyTextTemplate: def.defaultBodyText,
      bodyHtmlTemplate: def.defaultBodyHtml,
      source: "catalogue_default",
    },
    sampleVariablesForTemplate(key)
  );
  assert.match(rendered.subject, /Example Church/);
  assert.match(rendered.bodyText, /Alex Member/);
  assert.match(rendered.bodyText, /Main Campus/);
  assert.ok(rendered.bodyHtml);
  assert.match(rendered.bodyHtml, /Alex Member/);
  assert.doesNotMatch(rendered.bodyHtml, /<script/i);
});

test("invalid merge field is rejected", () => {
  const result = validateTemplatesAgainstAllowlist(
    "quota_warning",
    "Hello {{organisation_name}}",
    "Usage for {{not_allowed_field}}",
    null
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /not_allowed_field/);

  const secret = validateTemplatesAgainstAllowlist(
    "welcome_administrator",
    "Welcome",
    "Your password is {{password}}",
    null
  );
  assert.equal(secret.ok, false);
  assert.match(secret.error, /password/);
});

test("missing merge variables fail render", () => {
  const key = "quota_warning";
  const def = getTemplateDefinition(key);
  assert.throws(
    () =>
      notificationTemplateService.renderTemplateContent(
        {
          key,
          subjectTemplate: def.defaultSubject,
          bodyTextTemplate: def.defaultBodyText,
          bodyHtmlTemplate: null,
          source: "catalogue_default",
        },
        { organisation_name: "X", admin_name: "Y" }
      ),
    (err) => err && err.code === "MISSING_VARIABLES"
  );
});

test("safe HTML sanitisation strips scripts and event handlers", () => {
  const dirty =
    '<p>Hi {{admin_name}}</p><script>alert(1)</script><p onclick="evil()">Ok</p><a href="javascript:alert(1)">bad</a><a href="{{login_url}}">ok</a><a href="https://blessboard.com">safe</a>';
  const clean = sanitizeNotificationHtml(dirty);
  assert.ok(clean);
  assert.doesNotMatch(clean, /script/i);
  assert.doesNotMatch(clean, /onclick/i);
  assert.doesNotMatch(clean, /javascript:/i);
  assert.match(clean, /\{\{login_url\}\}/);
  assert.match(clean, /href="https:\/\/blessboard\.com"/);
  assert.match(clean, /Hi \{\{admin_name\}\}/);
});

test("validateAndSanitizeInput strips unsafe HTML and keeps merge links", () => {
  const result = notificationTemplateService.validateAndSanitizeInput("member_approved", {
    subject_template: "Approved for {{organisation_name}}",
    body_text_template: "Hello {{member_name}} at {{branch_name}}. Sign in {{login_url}}.",
    body_html_template:
      '<p>Hello <strong>{{member_name}}</strong></p><script>x</script><a href="{{login_url}}">Sign in</a>',
  });
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.body_html_template, /script/i);
  assert.match(result.body_html_template, /href="\{\{login_url\}\}"/);
});

test("test-send rejects unauthorised recipients", async () => {
  await assert.rejects(
    () =>
      notificationTemplateService.testSendTemplate(
        { query: async () => ({ rows: [], rowCount: 0 }) },
        {
          templateKey: "member_approved",
          organizationId: 1,
          recipientEmail: "someone@example.com",
          authorisedRecipient: false,
        }
      ),
    (err) => err && err.code === "FORBIDDEN"
  );
});

function makeChurchApp(ctx, sessionPatch) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-notification-templates",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    if (sessionPatch) Object.assign(req.session, sessionPatch);
    next();
  });
  app.get("/__csrf", (req, res) => {
    res.json({ token: issueChurchSessionCsrfToken(req) });
  });
  app.use(churchRoutes());
  return app;
}

function makePlatformApp(role, email) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "platform-notification-templates",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 99,
        username: email || "super@example.com",
        email: email || "super@example.com",
        display_name: "Super",
        role,
      };
    }
    next();
  });
  app.use("/admin", blessboardAdminRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_notification_test_deliveries WHERE organization_id = $1`, [
      orgId,
    ]);
    await pool.query(`DELETE FROM public.church_notification_templates WHERE organization_id = $1`, [
      orgId,
    ]);
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test(
  "tenant override, isolation, restore, and test-send permission",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("ntpl");
    const passwordHash = await bcrypt.hash("testpass123456", 12);
    const orgIds = [];

    try {
      const orgA = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `nta_${suffix}`.slice(0, 40),
        name: `Notify A ${suffix}`,
      });
      const orgB = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `ntb_${suffix}`.slice(0, 40),
        name: `Notify B ${suffix}`,
      });
      orgIds.push(orgA.id, orgB.id);

      for (const org of [orgA, orgB]) {
        await branchesRepo.createBranch(pool, {
          organization_id: org.id,
          slug: `main_${org.id}_${suffix}`.slice(0, 30),
          host_slug: `main_${org.id}_${suffix}`.slice(0, 30),
          name: "Main",
          status: "active",
        });
      }

      const hqA = await hqAdminsRepo.createHqAdmin(pool, {
        organization_id: orgA.id,
        full_name: "HQ A",
        email: `hqa_${suffix}@example.com`,
        phone: "0977000111",
        password_hash: passwordHash,
        role: "hq_admin",
        status: "active",
      });
      await hqAdminsRepo.createHqAdmin(pool, {
        organization_id: orgB.id,
        full_name: "HQ B",
        email: `hqb_${suffix}@example.com`,
        phone: "0977000222",
        password_hash: passwordHash,
        role: "hq_admin",
        status: "active",
      });

      const key = "quota_warning";
      const baselineA = await notificationTemplateService.getEffectiveTemplate(pool, key, orgA.id);
      assert.ok(["catalogue_default", "platform_default"].includes(baselineA.source));
      assert.equal(baselineA.isOverride, false);

      await notificationTemplateService.upsertTemplate(pool, {
        templateKey: key,
        organizationId: orgA.id,
        subject_template: "Org A warning for {{organisation_name}}",
        body_text_template:
          "Hello {{admin_name}}, {{meter_label}} is {{usage_display}} at {{warning_band}}% for {{organisation_name}} / {{branch_name}}. {{support_url}} {{login_url}}",
        body_html_template: null,
        actorType: "hq_admin",
        actorId: hqA.id,
      });

      const overrideA = await notificationTemplateService.getEffectiveTemplate(pool, key, orgA.id);
      assert.equal(overrideA.isOverride, true);
      assert.match(overrideA.subjectTemplate, /Org A warning/);

      const forB = await notificationTemplateService.getEffectiveTemplate(pool, key, orgB.id);
      assert.equal(forB.isOverride, false);
      assert.doesNotMatch(forB.subjectTemplate, /Org A warning/);

      const previewA = await notificationTemplateService.previewTemplate(pool, {
        templateKey: key,
        organizationId: orgA.id,
      });
      assert.match(previewA.subject, /Org A warning/);

      const delivery = await notificationTemplateService.testSendTemplate(pool, {
        templateKey: key,
        organizationId: orgA.id,
        recipientEmail: `hqa_${suffix}@example.com`,
        authorisedRecipient: true,
        recipientActorType: "hq_admin",
        recipientActorId: hqA.id,
        actorType: "hq_admin",
        actorId: hqA.id,
      });
      assert.ok(delivery.deliveryId);
      assert.equal(delivery.recordedOnly, true);

      const audits = await pool.query(
        `SELECT action FROM public.church_audit_logs
         WHERE organization_id = $1 AND action LIKE 'notification_template%'
         ORDER BY id`,
        [orgA.id]
      );
      const actions = audits.rows.map((r) => r.action);
      assert.ok(actions.includes("notification_template_override_saved"));
      assert.ok(actions.includes("notification_template_test_sent"));

      await notificationTemplateService.restoreDefaultTemplate(pool, {
        templateKey: key,
        organizationId: orgA.id,
        actorType: "hq_admin",
        actorId: hqA.id,
      });
      const restored = await notificationTemplateService.getEffectiveTemplate(pool, key, orgA.id);
      assert.equal(restored.isOverride, false);
      assert.doesNotMatch(restored.subjectTemplate, /Org A warning/);

      const orgARow = await organizationsRepo.findOrganizationById(pool, orgA.id);
      const branchA = (await branchesRepo.listBranchesForOrganization(pool, orgA.id))[0];
      const agent = request.agent(
        makeChurchApp(
          { kind: "hq", orgSlug: orgARow.slug, organization: orgARow, branch: branchA },
          null
        )
      );
      await agent
        .post("/hq/login")
        .type("form")
        .send({ identifier: `hqa_${suffix}@example.com`, password: "testpass123456" })
        .expect(303);
      const listRes = await agent.get("/hq/notification-templates");
      assert.equal(listRes.status, 200);
      assert.match(listRes.text, /Notification templates|Quota warning/i);

      const csrfRes = await agent.get("/__csrf");
      const token = csrfRes.body.token;
      const badOverride = await agent
        .post(`/hq/notification-templates/${encodeURIComponent(key)}`)
        .type("form")
        .send({
          _csrf: token,
          subject_template: "Hack {{password}}",
          body_text_template: "nope {{organisation_name}}",
        });
      assert.equal(badOverride.status, 303);
      assert.match(String(badOverride.headers.location || ""), /error=/);

      const csrf2 = (await agent.get("/__csrf")).body.token;
      const unauthForm = await agent
        .post(`/hq/notification-templates/${encodeURIComponent(key)}/test-send`)
        .type("form")
        .send({ _csrf: csrf2 });
      assert.equal(unauthForm.status, 303);
      assert.match(String(unauthForm.headers.location || ""), /notice=/);

      const denied = await request(makePlatformApp(null)).get("/admin/church/notification-templates");
      assert.ok([302, 401, 403].includes(denied.status));

      const allowed = await request(makePlatformApp(ROLES.SUPER_ADMIN)).get(
        "/admin/church/notification-templates"
      );
      assert.equal(allowed.status, 200);
      assert.match(allowed.text, /Welcome administrator/i);
    } finally {
      await cleanup(pool, orgIds);
    }
  }
);
