"use strict";

/**
 * Real V13 integration bodies. runGated executes them only when both database
 * write flags are set and the URL passes the disposable-database guard.
 */

const assert = require("node:assert/strict");
const { requireDbWriteAuthorization } = require("../helpers/v13DbWriteGate");
const { RESULTS } = require("../helpers/v13QaStatus");
const {
  applyBlessBoardFixtures,
  applyActiveClinicFixtures,
  cleanupBlessBoardFixtures,
  SYNTHETIC_PASSWORD,
  DEPLOYMENT_CODE,
} = require("../fixtures/v13SyntheticFixtures");

function must(result, label) {
  if (!result || result.ok !== true) {
    const detail = result ? result.status || result.code || result.reason || result.message : "empty";
    throw new Error(`${label} failed: ${detail}`);
  }
  return result;
}

async function count(db, sql, params) {
  const result = await db.query(sql, params);
  return Number(result.rows[0].n);
}

async function runGated(t, label, runner) {
  assert.equal(typeof runner, "function");
  if (!requireDbWriteAuthorization(t, label)) {
    assert.equal(RESULTS.NOT_RUN, "NOT_RUN");
    return RESULTS.NOT_RUN;
  }
  const { openAuthorizedPool } = require("../helpers/v13CiDatabaseGuard");
  const opened = openAuthorizedPool(process.env, (options) => {
    const { Pool } = require("pg");
    return new Pool(options);
  });
  try {
    await runner(opened.pool, opened.connectionString, process.env);
  } finally {
    await opened.pool.end();
  }
  return RESULTS.PASS;
}

async function withChurches(pool, connectionString, env, fn) {
  const fixtures = await applyBlessBoardFixtures(pool, connectionString, env);
  try {
    await fn(fixtures);
  } finally {
    await cleanupBlessBoardFixtures(pool, connectionString, fixtures.created, env);
  }
}

function church(fixtures, key) {
  const row = fixtures.created.find((item) => item.key === key);
  if (!row) throw new Error(`missing fixture ${key}`);
  return row;
}

async function runBb01(pool, connectionString, env) {
  const content = require("../../../src/blessboard/services/publicContentAdminService");
  await withChurches(pool, connectionString, env, async (fixtures) => {
    const a = church(fixtures, "v13d19-church-a");
    const b = church(fixtures, "v13d19-church-b");
    const pages = must(
      await content.provisionEmptyPublicPages(pool, { churchId: a.churchId, branchId: a.branchId }),
      "pages"
    );
    const home = pages.pages.find((page) => page.page_key === "home" || page.pageKey === "home") || pages.pages[0];
    const pageId = home.id || home.pageId;
    const created = must(
      await content.createPageSection(pool, {
        pageId,
        sectionKey: "text_intro",
        sectionType: "text",
        heading: "V13 D19 heading",
        bodyText: "V13 D19 body",
        status: "draft",
      }),
      "section"
    );
    const stored = await pool.query(
      `SELECT heading, body_text, status FROM blessboard.page_sections WHERE id = $1`,
      [created.section.id]
    );
    assert.equal(stored.rows[0].heading, "V13 D19 heading");
    assert.equal(stored.rows[0].body_text, "V13 D19 body");
    assert.equal(stored.rows[0].status, "draft");
    const duplicate = await content.createPageSection(pool, {
      pageId,
      sectionKey: "text_intro",
      sectionType: "text",
      heading: "V13 D19 heading",
      bodyText: "V13 D19 body",
      status: "draft",
    });
    const copies = await count(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.page_sections WHERE page_id = $1 AND section_key = 'text_intro'`,
      [pageId]
    );
    assert.equal(duplicate.ok === true && copies > 1, false);
    const rejected = await content.createPageSection(pool, {
      pageId,
      sectionKey: "image_bad",
      sectionType: "image",
      heading: "Image",
      mediaUrl: "javascript:alert(1)",
      status: "draft",
    });
    assert.equal(rejected.ok, false);
    const otherPages = await content.listAdminPages(pool, { churchId: b.churchId });
    const foreign = (otherPages.pages || []).some((page) => String(page.id) === String(pageId));
    assert.equal(foreign, false);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO blessboard.page_sections
           (page_id, section_key, section_type, heading, body_text, status, sort_order)
         VALUES ($1, 'v13d19_rollback', 'text', 'rollback', 'rollback', 'draft', 0)`,
        [pageId]
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const rolled = await count(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.page_sections WHERE section_key = 'v13d19_rollback'`,
      []
    );
    assert.equal(rolled, 0);
  });
}

async function runBb02(pool, connectionString, env) {
  const announcements = require("../../../src/blessboard/services/announcementsService");
  await withChurches(pool, connectionString, env, async (fixtures) => {
    const a = church(fixtures, "v13d19-church-a");
    const b = church(fixtures, "v13d19-church-b");
    const denied = await announcements.createAnnouncement(pool, {
      churchId: a.churchId,
      actorUserId: a.adminUserId,
      title: "Hidden draft",
      body: "Not public",
      audiences: ["public"],
      status: "draft",
      tenant: { organizationId: b.organizationId, churchId: b.churchId },
    });
    assert.equal(denied.ok, false);
    const published = must(
      await announcements.createAnnouncement(pool, {
        churchId: a.churchId,
        branchId: a.branchId,
        actorUserId: a.adminUserId,
        title: "V13 D19 public notice",
        body: "Visible to the public",
        audiences: ["public"],
        status: "published",
        confirmPublish: true,
        enforcePublishConfirm: true,
      }),
      "announcement"
    );
    const row = await pool.query(
      `SELECT church_id, status FROM blessboard.announcements WHERE id = $1`,
      [published.item.id]
    );
    assert.equal(String(row.rows[0].church_id), String(a.churchId));
    assert.equal(row.rows[0].status, "published");
    const visible = must(
      await announcements.listPublicWebsiteAnnouncements(pool, { churchId: a.churchId }),
      "public list"
    );
    assert.equal(visible.items.some((item) => item.title === "V13 D19 public notice"), true);
    const hidden = must(
      await announcements.listPublicWebsiteAnnouncements(pool, { churchId: b.churchId }),
      "other church"
    );
    assert.equal(hidden.items.some((item) => item.title === "V13 D19 public notice"), false);
  });
}

async function runBb03(pool, connectionString, env) {
  const content = require("../../../src/blessboard/services/publicContentAdminService");
  await withChurches(pool, connectionString, env, async (fixtures) => {
    const a = church(fixtures, "v13d19-church-a");
    const b = church(fixtures, "v13d19-church-b");
    const rejected = await content.createEvent(pool, {
      churchId: a.churchId,
      branchId: a.branchId,
      title: "Bad times",
      startsAt: "2026-12-01T11:00:00.000Z",
      endsAt: "2026-12-01T09:00:00.000Z",
      timezone: "Africa/Lusaka",
      status: "draft",
    });
    assert.equal(rejected.ok, false);
    const created = must(
      await content.createEvent(pool, {
        churchId: a.churchId,
        branchId: a.branchId,
        title: "V13 D19 gathering",
        startsAt: "2026-12-01T09:00:00.000Z",
        endsAt: "2026-12-01T11:00:00.000Z",
        timezone: "Africa/Lusaka",
        status: "published",
        confirmPublish: true,
        enforcePublishConfirm: true,
      }),
      "event"
    );
    const owned = await pool.query(`SELECT church_id FROM blessboard.events WHERE id = $1`, [created.item.id]);
    assert.equal(String(owned.rows[0].church_id), String(a.churchId));
    const mismatch = await content.createEvent(pool, {
      churchId: b.churchId,
      branchId: a.branchId,
      title: "Cross tenant",
      startsAt: "2026-12-02T09:00:00.000Z",
      timezone: "Africa/Lusaka",
      status: "draft",
    });
    assert.equal(mismatch.ok, false);
  });
}

async function runBb04(pool, connectionString, env) {
  const content = require("../../../src/blessboard/services/publicContentAdminService");
  await withChurches(pool, connectionString, env, async (fixtures) => {
    const a = church(fixtures, "v13d19-church-a");
    const badDate = await content.createSermon(pool, {
      churchId: a.churchId,
      branchId: a.branchId,
      title: "Bad date",
      speakerName: "Speaker",
      preachedAt: "18/07/2026",
      status: "draft",
    });
    assert.equal(badDate.ok, false);
    const badMedia = await content.createSermon(pool, {
      churchId: a.churchId,
      branchId: a.branchId,
      title: "Bad media",
      speakerName: "Speaker",
      preachedAt: "2026-07-18",
      mediaUrl: "http://example.com/audio.mp3",
      status: "draft",
    });
    assert.equal(badMedia.ok, false);
    const created = must(
      await content.createSermon(pool, {
        churchId: a.churchId,
        branchId: a.branchId,
        title: "V13 D19 sermon",
        speakerName: "V13 Speaker",
        preachedAt: "2026-07-18",
        mediaUrl: "https://media.v13d19.example/sermon.mp3",
        status: "published",
        confirmPublish: true,
        enforcePublishConfirm: true,
      }),
      "sermon"
    );
    const row = await pool.query(
      `SELECT church_id, title, status FROM blessboard.sermons WHERE id = $1`,
      [created.item.id]
    );
    assert.equal(row.rows[0].title, "V13 D19 sermon");
    assert.equal(String(row.rows[0].church_id), String(a.churchId));
    assert.equal(row.rows[0].status, "published");
  });
}

async function runBb05(pool, connectionString, env) {
  const { beginStaffAddMemberFlow, confirmStaffAddMemberCreate } = require("../../../src/blessboard/services/blessBoardStaffAddMemberFlowService");
  await withChurches(pool, connectionString, env, async (fixtures) => {
    const a = church(fixtures, "v13d19-church-a");
    const b = church(fixtures, "v13d19-church-b");
    const plan = fixtures.plan.churches[0];
    const started = must(
      await beginStaffAddMemberFlow(pool, {
        actorUserId: a.adminUserId,
        organizationId: a.organizationId,
        churchId: a.churchId,
        env,
        body: {
          full_name: plan.member.fullName,
          email: plan.member.email,
          phone: plan.member.phone,
          phone_country: plan.member.phoneCountry,
          phone_national: plan.member.phoneNational,
          date_of_birth: plan.member.dateOfBirth,
          branch_id: a.branchId,
        },
      }),
      "member draft"
    );
    const foreign = await confirmStaffAddMemberCreate(pool, {
      draftToken: started.draftToken,
      actorUserId: b.adminUserId,
      organizationId: b.organizationId,
      churchId: b.churchId,
      env,
      action: "confirm_create",
    });
    assert.equal(foreign.ok, false);
    const created = must(
      await confirmStaffAddMemberCreate(pool, {
        draftToken: started.draftToken,
        actorUserId: a.adminUserId,
        organizationId: a.organizationId,
        churchId: a.churchId,
        env,
        action: "confirm_create",
      }),
      "member create"
    );
    const members = await count(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.members WHERE church_id = $1 AND email_normalized = $2`,
      [a.churchId, plan.member.email]
    );
    assert.equal(members, 1);
    const replay = await confirmStaffAddMemberCreate(pool, {
      draftToken: started.draftToken,
      actorUserId: a.adminUserId,
      organizationId: a.organizationId,
      churchId: a.churchId,
      env,
      action: "confirm_create",
    });
    assert.equal(replay.memberId, created.memberId);
    const after = await count(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.members WHERE church_id = $1 AND email_normalized = $2`,
      [a.churchId, plan.member.email]
    );
    assert.equal(after, 1);
    const other = await count(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.members WHERE church_id = $1 AND email_normalized = $2`,
      [b.churchId, plan.member.email]
    );
    assert.equal(other, 0);
  });
}

async function createMember(pool, fixtures, env) {
  const { beginStaffAddMemberFlow, confirmStaffAddMemberCreate } = require("../../../src/blessboard/services/blessBoardStaffAddMemberFlowService");
  const a = church(fixtures, "v13d19-church-a");
  const plan = fixtures.plan.churches[0];
  const started = must(
    await beginStaffAddMemberFlow(pool, {
      actorUserId: a.adminUserId,
      organizationId: a.organizationId,
      churchId: a.churchId,
      env,
      body: {
        full_name: plan.member.fullName,
        email: plan.member.email,
        phone: plan.member.phone,
        phone_country: plan.member.phoneCountry,
        phone_national: plan.member.phoneNational,
        date_of_birth: plan.member.dateOfBirth,
        branch_id: a.branchId,
      },
    }),
    "member draft"
  );
  const created = must(
    await confirmStaffAddMemberCreate(pool, {
      draftToken: started.draftToken,
      actorUserId: a.adminUserId,
      organizationId: a.organizationId,
      churchId: a.churchId,
      env,
      action: "confirm_create",
    }),
    "member create"
  );
  return { church: a, plan, started, created };
}

async function runBb06(pool, connectionString, env) {
  const invitations = require("../../../src/blessboard/services/memberPortalInvitationService");
  const auth = require("../../../src/blessboard/services/authenticateBlessBoardUser");
  await withChurches(pool, connectionString, env, async (fixtures) => {
    const memberCreate = await createMember(pool, fixtures, env);
    const a = memberCreate.church;
    const member = (
      await pool.query(`SELECT id FROM blessboard.members WHERE church_id = $1 LIMIT 1`, [a.churchId])
    ).rows[0];
    assert.ok(member);
    const issued = must(
      await invitations.issueMemberPortalInvitation(pool, {
        purpose: "MEMBER_PORTAL_ACTIVATION",
        organizationId: a.organizationId,
        churchId: a.churchId,
        memberId: member.id,
        actorUserId: a.adminUserId,
      }),
      "invitation"
    );
    const accepted = must(
      await invitations.acceptMemberPortalInvitation(pool, {
        token: issued.rawToken,
        password: SYNTHETIC_PASSWORD,
        organizationId: a.organizationId,
        env,
      }),
      "accept"
    );
    const replay = await invitations.acceptMemberPortalInvitation(pool, {
      token: issued.rawToken,
      password: SYNTHETIC_PASSWORD,
      organizationId: a.organizationId,
      env,
    });
    assert.equal(replay.ok, false);
    const login = must(
      await auth.authenticateBlessBoardUser(pool, {
        email: fixtures.plan.churches[0].member.email,
        password: SYNTHETIC_PASSWORD,
        deploymentCode: DEPLOYMENT_CODE,
        requireOrganizationId: a.organizationId,
      }),
      "member login"
    );
    assert.ok(login.session || login.user);
    assert.notEqual(login.user && login.user.roleKey, "platform_administrator");
    assert.equal(accepted.memberId, member.id);
  });
}

async function runBb24(pool, connectionString, env) {
  const { submitPublicChurchEnquiry } = require("../../../src/blessboard/services/publicChurchContactService");
  await withChurches(pool, connectionString, env, async (fixtures) => {
    const a = church(fixtures, "v13d19-church-a");
    const b = church(fixtures, "v13d19-church-b");
    const missing = await submitPublicChurchEnquiry(pool, {}, {
      full_name: "Visitor",
      email: "visitor@v13d19.example",
      message: "Hello",
      church_id: a.churchId,
    });
    assert.equal(missing.status, 404);
    const saved = must(
      await submitPublicChurchEnquiry(
        pool,
        { organizationId: a.organizationId, churchId: a.churchId, branchId: a.branchId },
        {
          full_name: "Visitor",
          email: "visitor@v13d19.example",
          message: "Please contact this church",
          church_id: b.churchId,
        }
      ),
      "enquiry"
    );
    assert.equal(saved.churchId, a.churchId);
    const rows = await pool.query(
      `SELECT church_id FROM blessboard.public_contact_submissions WHERE message = $1`,
      ["Please contact this church"]
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(String(rows.rows[0].church_id), String(a.churchId));
    const inbox = await count(
      pool,
      `SELECT count(*)::int AS n FROM blessboard.public_contact_submissions WHERE church_id = $1`,
      [b.churchId]
    );
    assert.equal(inbox, 0);
  });
}

async function runInv01(pool, connectionString, env) {
  const { inviteBlessBoardStaff, acceptInvitation } = require("../../../src/blessboard/services/inviteBlessBoardStaff");
  const auth = require("../../../src/blessboard/services/authenticateBlessBoardUser");
  await withChurches(pool, connectionString, env, async (fixtures) => {
    const a = church(fixtures, "v13d19-church-a");
    const b = church(fixtures, "v13d19-church-b");
    const invite = fixtures.plan.churches[0].staffInvite;
    const escalation = await inviteBlessBoardStaff(pool, {
      organizationId: a.organizationId,
      churchId: a.churchId,
      branchId: a.branchId,
      actorUserId: a.adminUserId,
      email: invite.email,
      displayName: invite.displayName,
      roleKey: "platform_administrator",
    });
    assert.equal(escalation.ok, false);
    const issued = must(
      await inviteBlessBoardStaff(pool, {
        organizationId: a.organizationId,
        churchId: a.churchId,
        branchId: a.branchId,
        actorUserId: a.adminUserId,
        email: invite.email,
        displayName: invite.displayName,
        roleKey: invite.roleKey,
      }),
      "staff invite"
    );
    const expired = await acceptInvitation(pool, { token: "not-a-token", password: SYNTHETIC_PASSWORD, passwordConfirm: SYNTHETIC_PASSWORD });
    assert.equal(expired.ok, false);
    const accepted = must(
      await acceptInvitation(pool, {
        token: issued.rawToken,
        password: SYNTHETIC_PASSWORD,
        passwordConfirm: SYNTHETIC_PASSWORD,
      }),
      "accept invite"
    );
    const replay = await acceptInvitation(pool, {
      token: issued.rawToken,
      password: SYNTHETIC_PASSWORD,
      passwordConfirm: SYNTHETIC_PASSWORD,
    });
    assert.equal(replay.ok, false);
    const session = must(
      await auth.authenticateBlessBoardUser(pool, {
        email: invite.email,
        password: SYNTHETIC_PASSWORD,
        deploymentCode: DEPLOYMENT_CODE,
        requireOrganizationId: a.organizationId,
      }),
      "first login"
    );
    assert.ok(session.session || session.user);
    const wrongOrg = await auth.authenticateBlessBoardUser(pool, {
      email: invite.email,
      password: SYNTHETIC_PASSWORD,
      deploymentCode: DEPLOYMENT_CODE,
      requireOrganizationId: b.organizationId,
    });
    assert.equal(wrongOrg.ok, false);
    const role = await pool.query(
      `SELECT role_key FROM blessboard.user_role_assignments
        WHERE user_id = $1 OR organization_id = $2
        ORDER BY created_at DESC NULLS LAST LIMIT 5`,
      [accepted.userId || accepted.user && accepted.user.id, a.organizationId]
    );
    const keys = role.rows.map((row) => row.role_key);
    assert.equal(keys.includes("platform_administrator"), false);
  });
}

async function runD14cOtp(pool, connectionString, env) {
  const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
  const blocked = resolveOtpActivation({ ...env, NODE_ENV: "production", DEPLOYMENT_ENV: "production" }, "ACTIVE");
  assert.equal(blocked.status, "BLOCKED");
  await runPlatformOtp(pool, connectionString, env);
}

async function runAcAuth(pool, connectionString, env) {
  const { assignStaffRole } = require("../../../src/activeclinic/services/activeClinicAuthorizationService");
  const { createAppointment } = require("../../../src/activeclinic/services/activeClinicAppointmentService");
  const { insertPatient } = require("../../../src/activeclinic/repositories/patientRepository");
  const fixtures = await applyActiveClinicFixtures(pool, connectionString, env);
  const clinicA = fixtures.created[0];
  const clinicB = fixtures.created[1];
  const hco = (
    await pool.query(
      `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
      [clinicA.organizationId]
    )
  ).rows[0];
  const facility = (
    await pool.query(
      `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 LIMIT 1`,
      [clinicA.organizationId]
    )
  ).rows[0];
  const staff = (
    await pool.query(
      `SELECT id FROM activeclinic.staff_members WHERE organization_id = $1 LIMIT 1`,
      [clinicA.organizationId]
    )
  ).rows[0];
  assert.ok(hco && facility && staff);
  const deniedRole = await assignStaffRole(pool, {
    organizationId: clinicA.organizationId,
    staffMemberId: staff.id,
    roleKey: "activeclinic_receptionist",
    scopeType: "organisation",
    env,
  });
  assert.equal(deniedRole.ok, false);
  assert.equal(deniedRole.code, "invalid_scope");
  const patient = await insertPatient(pool, {
    organizationId: clinicA.organizationId,
    healthcareOrganizationId: hco.id,
    patientNumber: "V13D19-1",
    firstName: fixtures.plan.patient.firstName,
    lastName: fixtures.plan.patient.lastName,
    sexAtRegistration: "unknown",
    phoneNormalized: fixtures.plan.patient.phone,
    phoneDisplay: fixtures.plan.patient.phone,
    emailNormalized: fixtures.plan.patient.email,
    emailDisplay: fixtures.plan.patient.email,
    countryCode: "ZM",
    status: "active",
    registrationStatus: "complete",
    createdByStaffId: staff.id,
    updatedByStaffId: staff.id,
  });
  const first = await createAppointment(pool, {
    organizationId: clinicA.organizationId,
    healthcareOrganizationId: hco.id,
    facilityId: facility.id,
    patientId: patient.id,
    serviceTypeId: (
      await pool.query(
        `SELECT id FROM activeclinic.appointment_service_types WHERE organization_id = $1 LIMIT 1`,
        [clinicA.organizationId]
      )
    ).rows[0].id,
    actor: { staffMemberId: staff.id },
    assignedStaffId: staff.id,
    startsAt: fixtures.plan.slot.startsAt,
    endsAt: fixtures.plan.slot.endsAt,
    timezone: fixtures.plan.slot.timezone,
  });
  must(first, "appointment");
  const collision = await createAppointment(pool, {
    organizationId: clinicA.organizationId,
    healthcareOrganizationId: hco.id,
    facilityId: facility.id,
    patientId: patient.id,
    serviceTypeId: first.appointment.serviceTypeId,
    actor: { staffMemberId: staff.id },
    assignedStaffId: staff.id,
    startsAt: fixtures.plan.slot.startsAt,
    endsAt: fixtures.plan.slot.endsAt,
    timezone: fixtures.plan.slot.timezone,
  });
  assert.equal(collision.ok, false);
  assert.equal(collision.code, "appointment_collision");
  const cross = await createAppointment(pool, {
    organizationId: clinicB.organizationId,
    healthcareOrganizationId: hco.id,
    facilityId: facility.id,
    patientId: patient.id,
    serviceTypeId: first.appointment.serviceTypeId,
    actor: { staffMemberId: staff.id },
    assignedStaffId: staff.id,
    startsAt: "2026-12-01T12:00:00.000Z",
    endsAt: "2026-12-01T12:30:00.000Z",
    timezone: "Africa/Lusaka",
  });
  assert.equal(cross.ok, false);
  const owned = await count(
    pool,
    `SELECT count(*)::int AS n FROM activeclinic.appointments WHERE organization_id = $1`,
    [clinicA.organizationId]
  );
  assert.equal(owned, 1);
}

async function runPlatformOtp(pool) {
  const relation = await pool.query(`SELECT to_regclass('platform.otp_challenges') AS rel`);
  assert.ok(
    relation.rows[0].rel,
    "platform.otp_challenges is not present. Distributed OTP persistence stays blocked until an approved migration is applied on the disposable database."
  );
  const { createOtpService } = require("../../../src/platform/otp/otpService");
  const now = Date.now();
  const env = {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
  };
  const first = createOtpService({ clock: () => now });
  const input = {
    action: "auth.login",
    productCode: "blessboard",
    channel: "email",
    organizationId: "11111111-1111-4111-8111-111111111111",
    accountId: "22222222-2222-4222-8222-222222222222",
    sessionId: "44444444-4444-4444-8444-444444444444",
    identifier: "otp@v13d19.example",
  };
  const issued = await first.beginChallenge(input, env);
  assert.equal(issued.server.issued, true);
  const other = createOtpService({ clock: () => now });
  const replay = await other.verifyChallenge({ ...input, attemptId: issued.server.attemptId, code: "1234" }, env);
  assert.equal(
    replay.server.sessionComplete,
    true,
    "a second worker must read the same persisted challenge before OTP persistence can close"
  );
}

async function runG03Laboratory(pool) {
  const { collectSpecimen, RESULT } = require(
    "../../../src/activeclinic/services/activeClinicDiagnosticsService"
  );
  const missing = await collectSpecimen(pool, {
    organizationId: "00000000-0000-4000-8000-000000000001",
    healthcareOrganizationId: "00000000-0000-4000-8000-000000000002",
    facilityId: "00000000-0000-4000-8000-000000000003",
    laboratoryRequestId: "00000000-0000-4000-8000-000000000004",
    specimenType: "blood",
    actor: { staffId: "00000000-0000-4000-8000-000000000005" },
  });
  assert.equal(missing.code, RESULT.REQUEST_NOT_FOUND);
}

async function runG04PharmacyBilling(pool) {
  const { dispensePrescription, RESULT } = require(
    "../../../src/activeclinic/services/activeClinicPharmacyService"
  );
  const denied = await dispensePrescription(pool, {
    staffId: "00000000-0000-4000-8000-000000000021",
    organizationId: "00000000-0000-4000-8000-000000000022",
    facilityId: "00000000-0000-4000-8000-000000000023",
    prescriptionId: "00000000-0000-4000-8000-000000000024",
    itemDispenses: [{
      prescriptionItemId: "00000000-0000-4000-8000-000000000025",
      quantityToDispense: 1,
      batchId: "00000000-0000-4000-8000-000000000026",
    }],
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.result, RESULT.ACCESS_DENIED);
}

async function runG05Records(pool) {
  const { requestPaperDisposal, RESULT } = require(
    "../../../src/activeclinic/services/activeClinicRecordMigrationService"
  );
  const refused = requestPaperDisposal({ elapsedDays: 3650 });
  assert.equal(refused.deleted, false);
  assert.equal(refused.code, RESULT.LEGAL_APPROVAL_REQUIRED);
  const probe = await pool.query("SELECT 1 AS n");
  assert.equal(Number(probe.rows[0].n), 1);
}

module.exports = {
  runGated,
  runG03Laboratory,
  runG04PharmacyBilling,
  runG05Records,
  runBb01,
  runBb02,
  runBb03,
  runBb04,
  runBb05,
  runBb06,
  runBb24,
  runInv01,
  runD14cOtp,
  runAcAuth,
  runPlatformOtp,
};
