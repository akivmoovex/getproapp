"use strict";

/**
 * Prompt 8 — deterministic RBAC E2E fixtures (prefix rbac-e2e-).
 * Idempotent create / verify / reset against a known church (demo-church or test org).
 * Never prints passwords or tokens. Testing environments only.
 */

const { createBlessBoardUser } = require("./createBlessBoardUser");
const { assignBlessBoardRole } = require("./assignBlessBoardRole");
const rbacRepo = require("../repositories/blessBoardRbacRepository");
const {
  checkDatabaseIdentity,
} = require("../../../db/scripts/lib/databaseIdentity");

const FIXTURE_PREFIX = "rbac-e2e-";
const STRUCTURE_PREFIX = "rbac_e2e_";
const ASSIGNMENT_REASON = "rbac-e2e-fixture";
const PASSWORD = "Correct-Horse-Battery-Staple-9!";

const CANONICAL_ORG_KEY = "demo-church";
const CANONICAL_BRANCH_KEYS = Object.freeze([
  "hq",
  "demo-church-lusaka",
  "demo-church-ndola",
]);

/** @typedef {{ label: string, emailLocal: string, roleKey: string|null, scopeType: string|null, scopeTarget: string, sensitivity: string, legacy?: boolean }} PersonaSpec */

/**
 * Class Teacher is not a catalogue role_key — mapped to classes_coordinator @ class scope.
 * Pastor maps to branch_pastor.
 * @type {readonly PersonaSpec[]}
 */
const PERSONAS = Object.freeze([
  {
    label: "Organisation Administrator",
    emailLocal: "org-admin",
    roleKey: "organisation_administrator",
    scopeType: "organisation",
    scopeTarget: "organisation",
    sensitivity: "Highly sensitive",
  },
  {
    label: "Church System Administrator",
    emailLocal: "church-admin",
    roleKey: "church_system_administrator",
    scopeType: "church",
    scopeTarget: "church",
    sensitivity: "Highly sensitive",
  },
  {
    label: "Branch Pastor",
    emailLocal: "branch-pastor",
    roleKey: "branch_pastor",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Sensitive",
  },
  {
    label: "Branch Administrator",
    emailLocal: "branch-admin",
    roleKey: "branch_administrator",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "Ministry Leader",
    emailLocal: "ministry-leader",
    roleKey: "ministry_leader",
    scopeType: "ministry",
    scopeTarget: "evangelism",
    sensitivity: "Standard",
  },
  {
    label: "Registration Officer",
    emailLocal: "registration",
    roleKey: "registration_officer",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "First Timers Coordinator",
    emailLocal: "first-timers",
    roleKey: "first_timers_coordinator",
    scopeType: "ministry",
    scopeTarget: "first-timers",
    sensitivity: "Standard",
  },
  {
    label: "Classes Coordinator",
    emailLocal: "classes-coord",
    roleKey: "classes_coordinator",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "Class Teacher",
    emailLocal: "class-teacher",
    roleKey: "classes_coordinator",
    scopeType: "class",
    scopeTarget: "orientation-cohort",
    sensitivity: "Standard",
  },
  {
    label: "Cell Coordinator",
    emailLocal: "cell-coord",
    roleKey: "cell_coordinator",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "Cell Leader",
    emailLocal: "cell-leader",
    roleKey: "cell_leader",
    scopeType: "cell",
    scopeTarget: "test-cell",
    sensitivity: "Standard",
  },
  {
    label: "Department Head",
    emailLocal: "dept-head",
    roleKey: "department_head",
    scopeType: "department",
    scopeTarget: "test-department",
    sensitivity: "Standard",
  },
  {
    label: "Service Director",
    emailLocal: "service-director",
    roleKey: "service_director",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "Minister",
    emailLocal: "minister",
    roleKey: "minister",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Sensitive",
  },
  {
    label: "Pastor",
    emailLocal: "pastor",
    roleKey: "branch_pastor",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Sensitive",
  },
  {
    label: "Safeguarding Officer",
    emailLocal: "safeguarding",
    roleKey: "safeguarding_officer",
    scopeType: "church",
    scopeTarget: "church",
    sensitivity: "Highly sensitive",
  },
  {
    label: "Welfare Officer",
    emailLocal: "welfare-officer",
    roleKey: "welfare_officer",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Sensitive",
  },
  {
    label: "Welfare Approver",
    emailLocal: "welfare-approver",
    roleKey: "welfare_approver",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Sensitive",
  },
  {
    label: "Finance Director",
    emailLocal: "finance-director",
    roleKey: "finance_director",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Highly sensitive",
  },
  {
    label: "Finance Officer",
    emailLocal: "finance-officer",
    roleKey: "finance_officer",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Sensitive",
  },
  {
    label: "Finance Approver",
    emailLocal: "finance-approver",
    roleKey: "finance_approver",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Highly sensitive",
  },
  {
    label: "Communications Officer",
    emailLocal: "comms",
    roleKey: "communications_officer",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "Website Editor",
    emailLocal: "website-editor",
    roleKey: "website_editor",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "Website Publisher",
    emailLocal: "website-publisher",
    roleKey: "website_publisher",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Highly sensitive",
  },
  {
    label: "Auditor",
    emailLocal: "auditor",
    roleKey: "auditor",
    scopeType: "organisation",
    scopeTarget: "organisation",
    sensitivity: "Highly sensitive",
  },
  {
    label: "Member",
    emailLocal: "member",
    roleKey: "member",
    scopeType: "church",
    scopeTarget: "church",
    sensitivity: "Standard",
  },
  {
    label: "No-Permission Staff User",
    emailLocal: "noperm",
    roleKey: null,
    scopeType: null,
    scopeTarget: "none",
    sensitivity: "Standard",
  },
  {
    label: "Expired-Assignment User",
    emailLocal: "expired",
    roleKey: "website_editor",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "Revoked-Assignment User",
    emailLocal: "revoked",
    roleKey: "website_editor",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "Cross-Branch Test User",
    emailLocal: "cross-branch",
    roleKey: "branch_administrator",
    scopeType: "branch",
    scopeTarget: "ndola",
    sensitivity: "Standard",
  },
  {
    label: "Multi-Role User",
    emailLocal: "multi-role",
    roleKey: "communications_officer",
    scopeType: "branch",
    scopeTarget: "lusaka",
    sensitivity: "Standard",
  },
  {
    label: "Legacy Compatibility HQ",
    emailLocal: "legacy-hq",
    roleKey: null,
    scopeType: null,
    scopeTarget: "legacy",
    sensitivity: "Compatibility-only",
    legacy: true,
  },
]);

function fixtureEmail(emailLocal, domain) {
  return `${FIXTURE_PREFIX}${emailLocal}@${domain}`;
}

/**
 * @param {{ query: Function }} pool
 * @param {{ organizationKey?: string, allowCreate?: boolean }} [opts]
 */
async function assertTestingIdentity(pool, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const identity = await checkDatabaseIdentity(pool, {
    identityKey: "blessboard-platform-v5",
    allowCreate: options.allowCreate === true,
  });
  if (!identity.ok) {
    return { ok: false, reason: "identity_guard", identity };
  }
  if (String(identity.row.identity_key) !== "blessboard-platform-v5") {
    return { ok: false, reason: "identity_key", identity };
  }
  if (String(identity.row.environment_code) !== "testing") {
    return { ok: false, reason: "environment_code", identity };
  }
  const dep = await pool.query(
    `SELECT deployment_code, environment_code, canonical_domain
       FROM platform.deployments
      WHERE deployment_code = $1
      LIMIT 1`,
    [process.env.PLATFORM_DEPLOYMENT_CODE || "blessboard-org-v5"]
  );
  const deployment = dep.rows[0] || null;
  if (
    !deployment ||
    deployment.environment_code !== "testing" ||
    deployment.canonical_domain !== "blessboard.org"
  ) {
    return { ok: false, reason: "deployment", identity, deployment };
  }
  return { ok: true, identity, deployment };
}

/**
 * Discover canonical demo-church (or override organizationKey).
 * @param {{ query: Function }} pool
 * @param {{ organizationKey?: string }} [opts]
 */
async function discoverCanonicalRecords(pool, opts) {
  const organizationKey = String(
    (opts && opts.organizationKey) || CANONICAL_ORG_KEY
  ).trim();
  const org = await pool.query(
    `SELECT o.id AS organization_id, o.organization_key, o.status AS org_status,
            o.data_environment,
            c.id AS church_id, c.church_key, c.status AS church_status,
            c.display_name
       FROM platform.organizations o
       JOIN blessboard.churches c ON c.organization_id = o.id
      WHERE o.organization_key = $1
      ORDER BY c.church_key
      LIMIT 1`,
    [organizationKey]
  );
  if (!org.rows[0]) {
    return { ok: false, reason: "organization_not_found", organizationKey };
  }
  const row = org.rows[0];
  const branches = await pool.query(
    `SELECT id, branch_key, display_name, status, is_primary, branch_type
       FROM blessboard.branches
      WHERE church_id = $1
      ORDER BY is_primary DESC, branch_key`,
    [row.church_id]
  );
  const byKey = {};
  for (const b of branches.rows) byKey[b.branch_key] = b;

  const missing = [];
  const inactive = [];
  for (const key of CANONICAL_BRANCH_KEYS) {
    if (organizationKey !== CANONICAL_ORG_KEY) break;
    if (!byKey[key]) missing.push(key);
    else if (String(byKey[key].status) !== "active") inactive.push(key);
  }

  const domains = await pool.query(
    `SELECT hostname, domain_type, status, is_primary
       FROM platform.domains
      WHERE organization_id = $1
      ORDER BY is_primary DESC, hostname`,
    [row.organization_id]
  );

  return {
    ok: missing.length === 0 && inactive.length === 0,
    reason:
      missing.length || inactive.length
        ? "branch_gap"
        : "ok",
    organizationKey,
    organizationId: row.organization_id,
    churchId: row.church_id,
    churchKey: row.church_key,
    orgStatus: row.org_status,
    churchStatus: row.church_status,
    dataEnvironment: row.data_environment,
    websiteStatus: null,
    displayName: row.display_name,
    branches: branches.rows,
    branchByKey: byKey,
    missingBranches: missing,
    inactiveBranches: inactive,
    domains: domains.rows,
  };
}

async function findOrCreateUser(pool, email, displayName) {
  const existing = await pool.query(
    `SELECT id, email_normalized, display_name, status
       FROM blessboard.users
      WHERE email_normalized = $1
      LIMIT 1`,
    [String(email).toLowerCase()]
  );
  if (existing.rows[0]) {
    return {
      ok: true,
      created: false,
      user: {
        id: existing.rows[0].id,
        email: existing.rows[0].email_normalized,
        displayName: existing.rows[0].display_name,
        status: existing.rows[0].status,
      },
    };
  }
  const created = await createBlessBoardUser(pool, {
    email,
    displayName,
    password: PASSWORD,
  });
  if (!created.ok && created.status === "already_exists") {
    const again = await pool.query(
      `SELECT id, email_normalized, display_name, status
         FROM blessboard.users WHERE email_normalized = $1 LIMIT 1`,
      [String(email).toLowerCase()]
    );
    if (again.rows[0]) {
      return {
        ok: true,
        created: false,
        user: {
          id: again.rows[0].id,
          email: again.rows[0].email_normalized,
          displayName: again.rows[0].display_name,
          status: again.rows[0].status,
        },
      };
    }
  }
  if (!created.ok) {
    return { ok: false, reason: created.message || created.reason || created.status };
  }
  return { ok: true, created: true, user: created.user };
}

async function ensureMinistry(pool, ctx, ministryKey, name, ministryType) {
  const found = await pool.query(
    `SELECT id, ministry_key, name, status
       FROM blessboard.ministries
      WHERE church_id = $1 AND ministry_key = $2
      LIMIT 1`,
    [ctx.churchId, ministryKey]
  );
  if (found.rows[0]) return found.rows[0];
  const ins = await pool.query(
    `INSERT INTO blessboard.ministries (
       organization_id, church_id, branch_id, ministry_key, name,
       ministry_type, status, summary
     ) VALUES ($1,$2,$3,$4,$5,$6,'published',$7)
     RETURNING id, ministry_key, name, status`,
    [
      ctx.organizationId,
      ctx.churchId,
      ctx.lusakaId,
      ministryKey,
      name,
      ministryType,
      `${FIXTURE_PREFIX}${ministryKey}`,
    ]
  );
  return ins.rows[0];
}

async function ensureCell(pool, ctx, cellKey, displayName) {
  const found = await pool.query(
    `SELECT id, cell_key, display_name, status
       FROM blessboard.cells
      WHERE church_id = $1 AND cell_key = $2
      LIMIT 1`,
    [ctx.churchId, cellKey]
  );
  if (found.rows[0]) return found.rows[0];
  const ins = await pool.query(
    `INSERT INTO blessboard.cells (
       organization_id, church_id, branch_id, cell_key, display_name, status
     ) VALUES ($1,$2,$3,$4,$5,'active')
     RETURNING id, cell_key, display_name, status`,
    [ctx.organizationId, ctx.churchId, ctx.lusakaId, cellKey, displayName]
  );
  return ins.rows[0];
}

async function ensureDepartment(pool, ctx, departmentKey, displayName) {
  const found = await pool.query(
    `SELECT id, department_key, display_name, status
       FROM blessboard.departments
      WHERE church_id = $1 AND department_key = $2
      LIMIT 1`,
    [ctx.churchId, departmentKey]
  );
  if (found.rows[0]) return found.rows[0];
  const ins = await pool.query(
    `INSERT INTO blessboard.departments (
       organization_id, church_id, branch_id, department_key, display_name, status
     ) VALUES ($1,$2,$3,$4,$5,'active')
     RETURNING id, department_key, display_name, status`,
    [ctx.organizationId, ctx.churchId, ctx.lusakaId, departmentKey, displayName]
  );
  return ins.rows[0];
}

async function ensureClassProgram(pool, ctx, programKey, displayName, programType) {
  const found = await pool.query(
    `SELECT id, program_key, display_name, status
       FROM blessboard.class_programs
      WHERE church_id = $1 AND program_key = $2
      LIMIT 1`,
    [ctx.churchId, programKey]
  );
  if (found.rows[0]) return found.rows[0];
  const ins = await pool.query(
    `INSERT INTO blessboard.class_programs (
       organization_id, church_id, program_key, display_name,
       program_type, status
     ) VALUES ($1,$2,$3,$4,$5,'active')
     RETURNING id, program_key, display_name, status`,
    [ctx.organizationId, ctx.churchId, programKey, displayName, programType]
  );
  return ins.rows[0];
}

async function ensureClassCohort(pool, ctx, programId, cohortKey, displayName) {
  const found = await pool.query(
    `SELECT id, cohort_key, display_name, status
       FROM blessboard.class_cohorts
      WHERE church_id = $1 AND cohort_key = $2
      LIMIT 1`,
    [ctx.churchId, cohortKey]
  );
  if (found.rows[0]) return found.rows[0];
  const ins = await pool.query(
    `INSERT INTO blessboard.class_cohorts (
       organization_id, church_id, branch_id, program_id, cohort_key,
       display_name, status
     ) VALUES ($1,$2,$3,$4,$5,$6,'active')
     RETURNING id, cohort_key, display_name, status`,
    [
      ctx.organizationId,
      ctx.churchId,
      ctx.lusakaId,
      programId,
      cohortKey,
      displayName,
    ]
  );
  return ins.rows[0];
}

async function findActiveFixtureAssignment(pool, userId, organizationId, roleId) {
  const r = await pool.query(
    `SELECT id, status, expires_at, scope_type, scope_id
       FROM blessboard.user_role_assignments
      WHERE user_id = $1
        AND organization_id = $2
        AND role_id = $3
        AND assignment_reason = $4
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, organizationId, roleId, ASSIGNMENT_REASON]
  );
  return r.rows[0] || null;
}

/**
 * Seed users, structures, and RBAC assignments for Prompt 8.
 * @param {{ query: Function }} pool
 * @param {{
 *   organizationKey?: string,
 *   emailDomain?: string,
 *   lusakaBranchKey?: string,
 *   ndolaBranchKey?: string,
 *   skipIdentityGuard?: boolean,
 * }} [opts]
 */
async function seedRbacE2eFixtures(pool, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  if (!options.skipIdentityGuard) {
    const guard = await assertTestingIdentity(pool, { allowCreate: false });
    if (!guard.ok) return { ok: false, stage: "identity", ...guard };
  }

  const discovered = await discoverCanonicalRecords(pool, {
    organizationKey: options.organizationKey || CANONICAL_ORG_KEY,
  });
  if (!discovered.ok && discovered.organizationKey === CANONICAL_ORG_KEY) {
    return { ok: false, stage: "discover", discovered };
  }
  if (!discovered.organizationId) {
    return { ok: false, stage: "discover", discovered };
  }

  const lusakaKey =
    options.lusakaBranchKey ||
    (discovered.branchByKey["demo-church-lusaka"]
      ? "demo-church-lusaka"
      : discovered.branches.find((b) => !b.is_primary)?.branch_key ||
        discovered.branches[0]?.branch_key);
  const ndolaKey =
    options.ndolaBranchKey ||
    (discovered.branchByKey["demo-church-ndola"]
      ? "demo-church-ndola"
      : discovered.branches.find(
          (b) => b.branch_key !== lusakaKey && !b.is_primary
        )?.branch_key || lusakaKey);

  const lusaka = discovered.branchByKey[lusakaKey];
  const ndola = discovered.branchByKey[ndolaKey];
  const hq = discovered.branches.find((b) => b.is_primary) || discovered.branches[0];
  if (!lusaka || !hq) {
    return {
      ok: false,
      stage: "branches",
      reason: "required_branch_missing",
      lusakaKey,
      ndolaKey,
      discovered,
    };
  }

  const emailDomain = options.emailDomain || "demo-church.test";
  const ctx = {
    organizationId: discovered.organizationId,
    organizationKey: discovered.organizationKey,
    churchId: discovered.churchId,
    churchKey: discovered.churchKey,
    lusakaId: lusaka.id,
    lusakaKey: lusaka.branch_key,
    ndolaId: ndola ? ndola.id : lusaka.id,
    ndolaKey: ndola ? ndola.branch_key : lusaka.branch_key,
    hqId: hq.id,
    hqKey: hq.branch_key,
    websiteStatus: discovered.websiteStatus,
  };

  const evangelism = await ensureMinistry(
    pool,
    ctx,
    `${STRUCTURE_PREFIX}evangelism`,
    "Evangelism Ministry",
    "evangelism"
  );
  const firstTimers = await ensureMinistry(
    pool,
    ctx,
    `${STRUCTURE_PREFIX}first_timers`,
    "First Timers Ministry",
    "first_timers"
  );
  const orientation = await ensureClassProgram(
    pool,
    ctx,
    `${STRUCTURE_PREFIX}orientation`,
    "Orientation Program",
    "orientation"
  );
  const orientationCohort = await ensureClassCohort(
    pool,
    ctx,
    orientation.id,
    `${STRUCTURE_PREFIX}orientation_cohort`,
    "Orientation Cohort"
  );
  const salvation = await ensureClassProgram(
    pool,
    ctx,
    `${STRUCTURE_PREFIX}salvation`,
    "Salvation Class",
    "salvation"
  );
  const foundation = await ensureClassProgram(
    pool,
    ctx,
    `${STRUCTURE_PREFIX}foundation`,
    "Foundation Class",
    "foundation"
  );
  const establishment = await ensureClassProgram(
    pool,
    ctx,
    `${STRUCTURE_PREFIX}establishment`,
    "Establishment Class",
    "establishment"
  );
  const testCell = await ensureCell(
    pool,
    ctx,
    `${STRUCTURE_PREFIX}test_cell`,
    "Test Cell"
  );
  const testDepartment = await ensureDepartment(
    pool,
    ctx,
    `${STRUCTURE_PREFIX}test_department`,
    "Test Department"
  );

  const scopeIds = {
    organisation: ctx.organizationId,
    church: ctx.churchId,
    lusaka: ctx.lusakaId,
    ndola: ctx.ndolaId,
    evangelism: evangelism.id,
    "first-timers": firstTimers.id,
    "orientation-cohort": orientationCohort.id,
    "test-cell": testCell.id,
    "test-department": testDepartment.id,
    none: null,
    legacy: null,
  };

  /** @type {Record<string, { id: string, email: string, label: string }>} */
  const users = {};
  const assignments = [];
  let createdUsers = 0;
  let createdAssignments = 0;

  // Seed actor for assignment attribution (church system admin or first created).
  const seedActorEmail = fixtureEmail("church-admin", emailDomain);
  const seedActor = await findOrCreateUser(
    pool,
    seedActorEmail,
    "Church System Administrator"
  );
  if (!seedActor.ok) {
    return { ok: false, stage: "seed_actor", reason: seedActor.reason };
  }
  if (seedActor.created) createdUsers += 1;

  for (const persona of PERSONAS) {
    const email = fixtureEmail(persona.emailLocal, emailDomain);
    const userResult = await findOrCreateUser(pool, email, persona.label);
    if (!userResult.ok) {
      return {
        ok: false,
        stage: "user",
        persona: persona.label,
        reason: userResult.reason,
      };
    }
    if (userResult.created) createdUsers += 1;
    users[persona.emailLocal] = {
      id: userResult.user.id,
      email,
      label: persona.label,
    };

    if (persona.legacy) {
      const legacy = await assignBlessBoardRole(pool, {
        email,
        organizationKey: ctx.organizationKey,
        churchKey: ctx.churchKey,
        roleKey: "church_hq_admin",
      });
      assignments.push({
        label: persona.label,
        roleKey: "church_hq_admin",
        source: "legacy_compatibility",
        ok: legacy.ok,
        status: legacy.ok ? "active" : legacy.status || legacy.message,
      });
      continue;
    }

    if (!persona.roleKey) {
      assignments.push({
        label: persona.label,
        roleKey: null,
        source: "none",
        ok: true,
        status: "no_assignment",
      });
      continue;
    }

    const role = await rbacRepo.findRoleByKey(pool, persona.roleKey);
    if (!role) {
      return {
        ok: false,
        stage: "role_missing",
        roleKey: persona.roleKey,
        persona: persona.label,
      };
    }

    let expiresAt = null;
    let forceExpired = false;
    let revokeAfter = false;
    if (persona.emailLocal === "expired") {
      expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      forceExpired = true;
    } else if (persona.emailLocal === "revoked") {
      revokeAfter = true;
    } else if (persona.emailLocal === "website-editor") {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const scopeId = scopeIds[persona.scopeTarget];
    const existing = await findActiveFixtureAssignment(
      pool,
      userResult.user.id,
      ctx.organizationId,
      role.id
    );

    let assignment = existing;
    if (!assignment) {
      assignment = await rbacRepo.insertAssignment(pool, {
        userId: userResult.user.id,
        organizationId: ctx.organizationId,
        churchId:
          persona.scopeType === "organisation" ? null : ctx.churchId,
        roleId: role.id,
        scopeType: persona.scopeType,
        scopeId:
          persona.scopeType === "organisation" || persona.scopeType === "church"
            ? persona.scopeType === "church"
              ? ctx.churchId
              : ctx.organizationId
            : scopeId,
        assignedByUserId: seedActor.user.id,
        assignmentOrigin: "system",
        assignmentReason: ASSIGNMENT_REASON,
        expiresAt,
      });
      createdAssignments += 1;
      await rbacRepo.insertAssignmentEvent(pool, {
        assignmentId: assignment.id,
        organizationId: ctx.organizationId,
        actorUserId: seedActor.user.id,
        eventKey: "rbac.assignment.created",
        previousStatus: null,
        newStatus: "active",
        reason: ASSIGNMENT_REASON,
        metadata: { fixture: FIXTURE_PREFIX, persona: persona.emailLocal },
      });
    }

    if (forceExpired && assignment) {
      await pool.query(
        `UPDATE blessboard.user_role_assignments
            SET expires_at = $2, status = 'expired', updated_at = now()
          WHERE id = $1`,
        [assignment.id, expiresAt]
      );
      assignment.status = "expired";
    }

    if (revokeAfter && assignment && assignment.status === "active") {
      await rbacRepo.revokeAssignment(pool, {
        assignmentId: assignment.id,
        revokedByUserId: seedActor.user.id,
        revocationReason: `${ASSIGNMENT_REASON}:revoked`,
      });
      assignment.status = "revoked";
    }

    assignments.push({
      label: persona.label,
      roleKey: persona.roleKey,
      scopeType: persona.scopeType,
      scopeTarget: persona.scopeTarget,
      source: "rbac",
      status: assignment.status || "active",
      assignmentId: assignment.id,
      sensitivity: persona.sensitivity,
    });

    if (persona.emailLocal === "multi-role") {
      const second = await rbacRepo.findRoleByKey(pool, "website_editor");
      if (second) {
        const existingSecond = await findActiveFixtureAssignment(
          pool,
          userResult.user.id,
          ctx.organizationId,
          second.id
        );
        if (!existingSecond) {
          const a2 = await rbacRepo.insertAssignment(pool, {
            userId: userResult.user.id,
            organizationId: ctx.organizationId,
            churchId: ctx.churchId,
            roleId: second.id,
            scopeType: "branch",
            scopeId: ctx.lusakaId,
            assignedByUserId: seedActor.user.id,
            assignmentOrigin: "system",
            assignmentReason: ASSIGNMENT_REASON,
            expiresAt: null,
          });
          createdAssignments += 1;
          assignments.push({
            label: persona.label,
            roleKey: "website_editor",
            scopeType: "branch",
            scopeTarget: "lusaka",
            source: "rbac",
            status: "active",
            assignmentId: a2.id,
            sensitivity: "Standard",
          });
        }
      }
    }
  }

  return {
    ok: true,
    fixturePrefix: FIXTURE_PREFIX,
    createdUsers,
    createdAssignments,
    context: ctx,
    structures: {
      evangelismMinistryId: evangelism.id,
      firstTimersMinistryId: firstTimers.id,
      orientationProgramId: orientation.id,
      orientationCohortId: orientationCohort.id,
      salvationProgramId: salvation.id,
      foundationProgramId: foundation.id,
      establishmentProgramId: establishment.id,
      testCellId: testCell.id,
      testDepartmentId: testDepartment.id,
    },
    users: Object.fromEntries(
      Object.entries(users).map(([k, v]) => [
        k,
        { id: v.id, email: v.email, label: v.label },
      ])
    ),
    assignments: assignments.map((a) => ({
      label: a.label,
      roleKey: a.roleKey,
      scopeType: a.scopeType || null,
      scopeTarget: a.scopeTarget || null,
      source: a.source,
      status: a.status,
      sensitivity: a.sensitivity || null,
    })),
    // Password never returned.
  };
}

/**
 * Verify fixture users and active/expired/revoked assignment states exist.
 * @param {{ query: Function }} pool
 * @param {{ organizationKey?: string, emailDomain?: string }} [opts]
 */
async function verifyRbacE2eFixtures(pool, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const emailDomain = options.emailDomain || "demo-church.test";
  const discovered = await discoverCanonicalRecords(pool, {
    organizationKey: options.organizationKey || CANONICAL_ORG_KEY,
  });
  if (!discovered.organizationId) {
    return { ok: false, reason: "organization_not_found", checks: [] };
  }

  const checks = [];
  let failed = 0;
  for (const persona of PERSONAS) {
    const email = fixtureEmail(persona.emailLocal, emailDomain);
    const u = await pool.query(
      `SELECT id, status FROM blessboard.users WHERE email_normalized = $1 LIMIT 1`,
      [email.toLowerCase()]
    );
    const userOk = Boolean(u.rows[0]);
    let assignmentOk = true;
    let assignmentStatus = "n/a";
    if (persona.roleKey && userOk) {
      const role = await rbacRepo.findRoleByKey(pool, persona.roleKey);
      const a = await pool.query(
        `SELECT status, expires_at
           FROM blessboard.user_role_assignments
          WHERE user_id = $1
            AND organization_id = $2
            AND role_id = $3
            AND assignment_reason = $4
          ORDER BY created_at DESC
          LIMIT 1`,
        [
          u.rows[0].id,
          discovered.organizationId,
          role.id,
          ASSIGNMENT_REASON,
        ]
      );
      assignmentStatus = a.rows[0] ? a.rows[0].status : "missing";
      if (persona.emailLocal === "expired") {
        assignmentOk = assignmentStatus === "expired";
      } else if (persona.emailLocal === "revoked") {
        assignmentOk = assignmentStatus === "revoked";
      } else if (persona.emailLocal === "noperm") {
        assignmentOk = true;
      } else {
        assignmentOk = assignmentStatus === "active";
      }
    }
    if (persona.legacy && userOk) {
      const legacy = await pool.query(
        `SELECT 1 FROM blessboard.user_roles
          WHERE user_id = $1 AND role_key = 'church_hq_admin' AND status = 'active'
          LIMIT 1`,
        [u.rows[0].id]
      );
      assignmentOk = legacy.rowCount > 0;
      assignmentStatus = assignmentOk ? "legacy_active" : "legacy_missing";
    }
    const ok = userOk && assignmentOk;
    if (!ok) failed += 1;
    checks.push({
      label: persona.label,
      emailLocal: persona.emailLocal,
      userOk,
      assignmentStatus,
      ok,
    });
  }

  const structures = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM blessboard.cells WHERE church_id = $1 AND cell_key LIKE $2) AS cells,
       (SELECT COUNT(*)::int FROM blessboard.departments WHERE church_id = $1 AND department_key LIKE $2) AS departments,
       (SELECT COUNT(*)::int FROM blessboard.class_programs WHERE church_id = $1 AND program_key LIKE $2) AS programs,
       (SELECT COUNT(*)::int FROM blessboard.ministries WHERE church_id = $1 AND ministry_key LIKE $2) AS ministries`,
    [discovered.churchId, `${STRUCTURE_PREFIX}%`]
  );

  return {
    ok: failed === 0,
    failed,
    checks,
    structures: structures.rows[0],
    organizationId: discovered.organizationId,
    churchId: discovered.churchId,
  };
}

/**
 * Revoke fixture RBAC assignments and archive fixture structures.
 * Preserves assignment events / audit history. Does not delete unrelated demo data.
 * @param {{ query: Function }} pool
 * @param {{ organizationKey?: string, emailDomain?: string, deactivateUsers?: boolean }} [opts]
 */
async function resetRbacE2eFixtures(pool, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  if (!options.skipIdentityGuard) {
    const guard = await assertTestingIdentity(pool, { allowCreate: false });
    if (!guard.ok) return { ok: false, stage: "identity", ...guard };
  }
  const discovered = await discoverCanonicalRecords(pool, {
    organizationKey: options.organizationKey || CANONICAL_ORG_KEY,
  });
  if (!discovered.organizationId) {
    return { ok: false, reason: "organization_not_found" };
  }

  const revoked = await pool.query(
    `UPDATE blessboard.user_role_assignments
        SET status = 'revoked',
            revoked_at = COALESCE(revoked_at, now()),
            revocation_reason = COALESCE(revocation_reason, $3),
            updated_at = now()
      WHERE organization_id = $1
        AND assignment_reason = $2
        AND status = 'active'
      RETURNING id`,
    [
      discovered.organizationId,
      ASSIGNMENT_REASON,
      `${ASSIGNMENT_REASON}:reset`,
    ]
  );

  await pool.query(
    `UPDATE blessboard.cells
        SET status = 'archived', updated_at = now()
      WHERE church_id = $1 AND cell_key LIKE $2 AND status = 'active'`,
    [discovered.churchId, `${STRUCTURE_PREFIX}%`]
  );
  await pool.query(
    `UPDATE blessboard.departments
        SET status = 'archived', updated_at = now()
      WHERE church_id = $1 AND department_key LIKE $2 AND status = 'active'`,
    [discovered.churchId, `${STRUCTURE_PREFIX}%`]
  );
  await pool.query(
    `UPDATE blessboard.class_cohorts
        SET status = 'archived', updated_at = now()
      WHERE church_id = $1 AND cohort_key LIKE $2 AND status = 'active'`,
    [discovered.churchId, `${STRUCTURE_PREFIX}%`]
  );
  await pool.query(
    `UPDATE blessboard.class_programs
        SET status = 'archived', updated_at = now()
      WHERE church_id = $1 AND program_key LIKE $2 AND status = 'active'`,
    [discovered.churchId, `${STRUCTURE_PREFIX}%`]
  );
  await pool.query(
    `UPDATE blessboard.ministries
        SET status = 'archived', archived_at = COALESCE(archived_at, now()), updated_at = now()
      WHERE church_id = $1 AND ministry_key LIKE $2 AND status <> 'archived'`,
    [discovered.churchId, `${STRUCTURE_PREFIX}%`]
  );

  let deactivatedUsers = 0;
  if (options.deactivateUsers === true) {
    const emailDomain = options.emailDomain || "demo-church.test";
    const emails = PERSONAS.map((p) =>
      fixtureEmail(p.emailLocal, emailDomain).toLowerCase()
    );
    const r = await pool.query(
      `UPDATE blessboard.users
          SET status = 'inactive', updated_at = now()
        WHERE email_normalized = ANY($1::text[])
          AND status = 'active'
        RETURNING id`,
      [emails]
    );
    deactivatedUsers = r.rowCount;
  }

  return {
    ok: true,
    revokedAssignments: revoked.rowCount,
    deactivatedUsers,
    organizationId: discovered.organizationId,
    churchId: discovered.churchId,
    preserved: [
      "user_role_assignment_events",
      "blessboard audit rows",
      "user accounts (unless deactivateUsers)",
      "non-fixture demo data",
    ],
  };
}

module.exports = {
  FIXTURE_PREFIX,
  STRUCTURE_PREFIX,
  ASSIGNMENT_REASON,
  CANONICAL_ORG_KEY,
  CANONICAL_BRANCH_KEYS,
  PERSONAS,
  assertTestingIdentity,
  discoverCanonicalRecords,
  seedRbacE2eFixtures,
  verifyRbacE2eFixtures,
  resetRbacE2eFixtures,
  fixtureEmail,
};
