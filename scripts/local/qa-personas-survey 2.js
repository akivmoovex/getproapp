#!/usr/bin/env node
"use strict";

/**
 * Read-only survey of hosted TESTING tenants and candidate website QA personas.
 * Writes nothing, prints no secrets (password hashes are reduced to a boolean).
 */

const { Pool } = require("pg");
const { readIdentityRow } = require("../../db/scripts/lib/databaseIdentity");

async function main() {
  const env = process.env;
  if (String(env.DEPLOYMENT_ENV || "") !== "testing") {
    console.error("refusing: DEPLOYMENT_ENV must be testing");
    process.exit(2);
  }
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.GETPRO_PG_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined,
    max: 3,
    application_name: "qa-personas-survey",
  });

  const identity = await readIdentityRow(pool);
  if (!identity || identity.identity_key !== "moovex-platform-v7" || identity.environment_code !== "testing") {
    console.error(`refusing: not the V7 testing database (${identity && identity.identity_key}/${identity && identity.environment_code})`);
    await pool.end();
    process.exit(2);
  }
  console.log(`identity: ${identity.identity_key} / ${identity.environment_code} / ${identity.host_fingerprint}`);

  console.log("\n===== deployments =====");
  const dep = await pool.query(
    `SELECT deployment_code, application_code, environment_code, status, canonical_domain, session_cookie_name
       FROM platform.deployments ORDER BY environment_code, deployment_code`
  );
  for (const r of dep.rows) {
    console.log(`  ${r.deployment_code} | app=${r.application_code} | env=${r.environment_code} | ${r.status} | ${r.canonical_domain} | cookie=${r.session_cookie_name || "(default)"}`);
  }

  console.log("\n===== BlessBoard churches (testing orgs) =====");
  const bb = await pool.query(
    `SELECT o.organization_key, o.status AS org_status, c.id AS church_id, c.church_key, c.display_name,
            (SELECT count(*) FROM blessboard.branches b WHERE b.church_id = c.id AND b.status='active') AS active_branches,
            (SELECT string_agg(b.branch_key || (CASE WHEN b.is_primary THEN '*' ELSE '' END), ',' ORDER BY b.is_primary DESC, b.branch_key)
               FROM blessboard.branches b WHERE b.church_id = c.id AND b.status='active') AS branches,
            (SELECT string_agg(d.hostname, ',' ORDER BY d.is_primary DESC, d.hostname)
               FROM platform.domains d WHERE d.organization_id = o.id AND d.status='active') AS hostnames
       FROM blessboard.churches c
       JOIN platform.organizations o ON o.id = c.organization_id
      WHERE o.data_environment = 'testing'
      ORDER BY active_branches DESC, o.organization_key`
  );
  for (const r of bb.rows) {
    console.log(`  org=${r.organization_key} (${r.org_status}) church=${r.church_key} "${r.display_name}"`);
    console.log(`     branches(${r.active_branches})=${r.branches || "-"}  hosts=${r.hostnames || "-"}`);
  }

  console.log("\n===== BlessBoard website-capable role assignments =====");
  const roles = await pool.query(
    `SELECT o.organization_key, c.church_key, r.role_key, ura.scope_type, ura.status,
            b.branch_key,
            u.email_display, u.status AS user_status,
            (u.password_hash IS NOT NULL) AS has_password,
            (u.platform_identity_id IS NOT NULL) AS has_platform_identity,
            u.sign_in_locked_until
       FROM blessboard.user_role_assignments ura
       JOIN blessboard.users u ON u.id = ura.user_id
       JOIN blessboard.roles r ON r.id = ura.role_id
       JOIN blessboard.churches c ON c.id = ura.church_id
       JOIN platform.organizations o ON o.id = ura.organization_id
       LEFT JOIN blessboard.branches b ON b.id = ura.scope_id
      WHERE o.data_environment = 'testing'
        AND ura.status = 'active'
      ORDER BY o.organization_key, r.role_key, u.email_display`
  );
  for (const r of roles.rows) {
    console.log(`  ${r.organization_key}/${r.church_key} ${r.role_key} scope=${r.scope_type}${r.branch_key ? ":" + r.branch_key : ""} user=${r.email_display} status=${r.user_status} pw=${r.has_password} pid=${r.has_platform_identity} locked=${r.sign_in_locked_until ? "YES" : "no"}`);
  }

  console.log("\n===== ActiveClinic testing orgs =====");
  const ac = await pool.query(
    `SELECT o.organization_key, o.status AS org_status, o.test_cleanup_eligible,
            (SELECT count(*) FROM activeclinic.facilities f WHERE f.organization_id=o.id) AS facilities,
            (SELECT string_agg(f.facility_key || (CASE WHEN f.is_primary THEN '*' ELSE '' END), ',' ORDER BY f.is_primary DESC, f.facility_key)
               FROM activeclinic.facilities f WHERE f.organization_id=o.id) AS facility_keys,
            (SELECT string_agg(d.hostname, ',' ORDER BY d.is_primary DESC, d.hostname)
               FROM platform.domains d WHERE d.organization_id=o.id AND d.status='active') AS hostnames
       FROM platform.organizations o
      WHERE o.data_environment='testing'
        AND EXISTS (SELECT 1 FROM activeclinic.facilities f2 WHERE f2.organization_id=o.id)
      ORDER BY o.organization_key`
  );
  for (const r of ac.rows) {
    console.log(`  org=${r.organization_key} (${r.org_status}) cleanup_eligible=${r.test_cleanup_eligible} facilities(${r.facilities})=${r.facility_keys || "-"}`);
    console.log(`     hosts=${r.hostnames || "-"}`);
  }

  console.log("\n===== ActiveClinic staff role assignments (testing) =====");
  const acStaff = await pool.query(
    `SELECT o.organization_key, sra.scope_type, sra.status, f.facility_key,
            pi.primary_email AS email_display, pi.status AS identity_status,
            (pi.password_hash IS NOT NULL) AS has_password
       FROM activeclinic.staff_role_assignments sra
       JOIN platform.organizations o ON o.id = sra.organization_id
       LEFT JOIN activeclinic.facilities f ON f.id = sra.facility_id
       LEFT JOIN activeclinic.staff_members sm ON sm.id = sra.staff_member_id
       LEFT JOIN platform.identities pi ON pi.id = sm.platform_identity_id
      WHERE o.data_environment='testing' AND sra.status='active'
      ORDER BY o.organization_key, pi.primary_email`
  );
  for (const r of acStaff.rows) {
    console.log(`  ${r.organization_key} scope=${r.scope_type}${r.facility_key ? ":" + r.facility_key : ""} identity=${r.email_display || "(unlinked)"} status=${r.identity_status} pw=${r.has_password}`);
  }

  console.log("\n===== website instances (testing) =====");
  const wi = await pool.query(
    `SELECT o.organization_key, wi.product_code, wi.slug, wi.status, wi.lifecycle_status,
            wi.scope_kind, wi.last_published_at IS NOT NULL AS ever_published,
            wi.edit_locked, wi.publish_locked
       FROM platform.website_instances wi
       JOIN platform.organizations o ON o.id = wi.organization_id
      WHERE o.data_environment='testing'
      ORDER BY wi.product_code, o.organization_key`
  );
  for (const r of wi.rows) {
    console.log(`  ${r.organization_key} [${r.product_code}] slug=${r.slug} status=${r.status} lifecycle=${r.lifecycle_status} scope=${r.scope_kind} published=${r.ever_published} editLock=${r.edit_locked} pubLock=${r.publish_locked}`);
  }

  console.log("\n===== BlessBoard publication versions (testing) =====");
  const pv = await pool.query(
    `SELECT o.organization_key, c.church_key, count(*) AS versions,
            count(*) FILTER (WHERE wpv.status='published') AS published,
            max(wpv.version_number) AS latest
       FROM blessboard.website_publication_versions wpv
       JOIN platform.organizations o ON o.id = wpv.organization_id
       JOIN blessboard.churches c ON c.id = wpv.church_id
      WHERE o.data_environment='testing'
      GROUP BY o.organization_key, c.church_key
      ORDER BY versions DESC`
  );
  for (const r of pv.rows) {
    console.log(`  ${r.organization_key}/${r.church_key} versions=${r.versions} published=${r.published} latest=#${r.latest}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
