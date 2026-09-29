#!/usr/bin/env node
"use strict";

/**
 * Read-only production inspection for BB_PRODUCTION_REGISTRATION_INTERMITTENT_P1.
 * Never prints DATABASE_URL, passwords, emails, phones, cookie/CSRF values.
 *
 *   scripts/local/run-with-blessboard-env.sh production \
 *     node scripts/local/v7-bb-prod-reg-inspect.js
 */

const { Pool } = require("pg");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { checkDatabaseIdentity } = require("../../db/scripts/lib/databaseIdentity");

function maskEmail(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s || !s.includes("@")) return s ? "present" : null;
  const [local, domain] = s.split("@");
  const keep = local.slice(0, 2);
  return `${keep}***@${domain}`;
}

function maskPhone(value) {
  const s = String(value || "").replace(/\D/g, "");
  if (!s) return null;
  return `***${s.slice(-4)}`;
}

async function main() {
  const pool = new Pool(buildFoundationPoolConfig(requireDatabaseUrl(), { max: 2 }));
  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: "moovex-platform-v7" });
    const identityRow = identity.row || {};
    console.log(
      JSON.stringify(
        {
          dbIdentity: {
            ok: identity.ok,
            identity_key: identityRow.identity_key || null,
            environment_code: identityRow.environment_code || null,
            database_name: identityRow.database_name || null,
          },
        },
        null,
        2
      )
    );

    async function qCount(sql) {
      try {
        const r = await pool.query(sql);
        return r.rows[0].n;
      } catch (err) {
        return { error: String(err.code || err.message).slice(0, 80) };
      }
    }
    const counts = {
      organizations: await qCount(`SELECT count(*)::int AS n FROM platform.organizations`),
      identities: await qCount(`SELECT count(*)::int AS n FROM platform.identities`),
      bb_users: await qCount(`SELECT count(*)::int AS n FROM blessboard.users`),
      bb_branches: await qCount(`SELECT count(*)::int AS n FROM blessboard.branches`),
      bb_registration_applications: await qCount(
        `SELECT count(*)::int AS n FROM blessboard.platform_church_registration_applications`
      ),
      bb_website_instances: await qCount(
        `SELECT count(*)::int AS n FROM platform.website_instances WHERE product_code = 'blessboard'`
      ),
      active_sessions: await qCount(
        `SELECT count(*)::int AS n FROM platform.deployment_sessions WHERE revoked_at IS NULL`
      ),
      deployments: await qCount(`SELECT count(*)::int AS n FROM platform.deployments`),
    };
    console.log(JSON.stringify({ counts }, null, 2));

    const deployments = await pool.query(`
      SELECT deployment_code, status, application_code, canonical_domain, session_cookie_name
        FROM platform.deployments
       ORDER BY deployment_code
    `);
    console.log(
      JSON.stringify(
        {
          deployments: deployments.rows,
          hasMoovexPlatformProduction: deployments.rows.some(
            (r) => r.deployment_code === "moovex-platform-production"
          ),
        },
        null,
        2
      )
    );

    const recent = await pool.query(`
      SELECT
        a.id,
        a.created_at,
        a.updated_at,
        a.application_status,
        a.provisioning_status,
        a.provisioning_error_code,
        a.last_provision_stage,
        a.public_registration_reference,
        a.selected_plan,
        a.church_name,
        a.organization_id,
        a.contact_email,
        a.contact_phone_normalized,
        a.risk_decision,
        a.risk_reason_codes
      FROM blessboard.platform_church_registration_applications a
      ORDER BY a.created_at DESC
      LIMIT 25
    `);

    const apps = [];
    for (const row of recent.rows) {
      let org = null;
      let userCount = 0;
      let branchCount = 0;
      let websiteCount = 0;
      let membershipCount = 0;
      if (row.organization_id) {
        const orgRow = await pool.query(
          `SELECT id, organization_key, display_name, status, data_environment, created_at
             FROM platform.organizations WHERE id = $1`,
          [row.organization_id]
        );
        org = orgRow.rows[0] || null;
        userCount = (
          await pool.query(
            `SELECT count(*)::int AS n FROM blessboard.user_roles ur WHERE ur.organization_id = $1`,
            [row.organization_id]
          )
        ).rows[0].n;
        branchCount = (
          await pool.query(
            `SELECT count(*)::int AS n FROM blessboard.branches b
               JOIN blessboard.churches c ON c.id = b.church_id
              WHERE c.organization_id = $1`,
            [row.organization_id]
          )
        ).rows[0].n;
        websiteCount = (
          await pool.query(
            `SELECT count(*)::int AS n FROM platform.website_instances
              WHERE organization_id = $1 AND product_code = 'blessboard'`,
            [row.organization_id]
          )
        ).rows[0].n;
        try {
          // V7: there is no blessboard.memberships table. Canonical branch
          // membership rows live on blessboard.member_branch_memberships.
          membershipCount = (
            await pool.query(
              `SELECT count(*)::int AS n
                 FROM blessboard.member_branch_memberships m
                 JOIN blessboard.members mb ON mb.id = m.member_id
                 JOIN blessboard.churches c ON c.id = mb.church_id
                WHERE c.organization_id = $1`,
              [row.organization_id]
            )
          ).rows[0].n;
        } catch {
          membershipCount = null;
        }
      }
      apps.push({
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        application_status: row.application_status,
        provisioning_status: row.provisioning_status,
        provisioning_error_code: row.provisioning_error_code,
        last_provision_stage: row.last_provision_stage,
        public_registration_reference: row.public_registration_reference,
        selected_plan: row.selected_plan,
        church_name: row.church_name,
        organization_id: row.organization_id,
        email: maskEmail(row.contact_email),
        phone: maskPhone(row.contact_phone_normalized),
        risk_decision: row.risk_decision,
        risk_reason_codes: row.risk_reason_codes,
        org: org
          ? {
              organization_key: org.organization_key,
              display_name: org.display_name,
              status: org.status,
              data_environment: org.data_environment,
              created_at: org.created_at,
            }
          : null,
        user_roles: userCount,
        branches: branchCount,
        websites: websiteCount,
        memberships: membershipCount,
      });
    }
    console.log(JSON.stringify({ recentApplications: apps }, null, 2));

    const failed = await pool.query(`
      SELECT application_status, provisioning_status, provisioning_error_code, count(*)::int AS n
        FROM blessboard.platform_church_registration_applications
       GROUP BY 1, 2, 3
       ORDER BY n DESC
    `);
    console.log(JSON.stringify({ applicationStatusHistogram: failed.rows }, null, 2));

    const orgs = await pool.query(`
      SELECT organization_key, display_name, status, data_environment, created_at
        FROM platform.organizations
       ORDER BY created_at DESC
       LIMIT 20
    `);
    console.log(JSON.stringify({ recentOrganizations: orgs.rows }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: String(err && err.message ? err.message : err).slice(0, 200),
      code: err && err.code ? String(err.code).slice(0, 40) : null,
    })
  );
  process.exit(1);
});
