#!/usr/bin/env node
"use strict";

/**
 * Idempotent fixtures for Playwright public visual regression (tests/ui.spec.js).
 * Requires GETPRO_TEST_DB=1 and TEST_DATABASE_URL — never touches DATABASE_URL.
 *
 * Ensures demo tenant company id=1 so /company/1 resolves under X-Forwarded-Host demo.*.
 */

const { runBootstrap } = require("../src/startup/bootstrap");
runBootstrap();

const { requireSafeTestDatabaseUrl } = require("../src/db/pg/requireSafeTestDatabase");
const { getPgPool, closePgPool } = require("../src/db/pg/pool");
const { ensureCanonicalTenantsForTests } = require("../tests/helpers/pgTestSeed");
const { TENANT_DEMO } = require("../src/tenants/tenantIds");

async function ensureDemoCompanyOne(pool) {
  const existing = await pool.query(
    `SELECT id, tenant_id, listing_disabled
       FROM public.companies
      WHERE id = 1`
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (Number(row.tenant_id) !== Number(TENANT_DEMO) || row.listing_disabled === true) {
      await pool.query(
        `UPDATE public.companies
            SET tenant_id = $1,
                listing_disabled = false,
                name = COALESCE(NULLIF(name, ''), 'Playwright Visual Co'),
                subdomain = CASE
                  WHEN subdomain IS NULL OR subdomain = '' THEN 'pw-visual-demo'
                  ELSE subdomain
                END,
                updated_at = now()
          WHERE id = 1`,
        [TENANT_DEMO]
      );
    }
    return { id: 1, action: "ensured" };
  }

  await pool.query(
    `INSERT INTO public.companies (
       id, tenant_id, subdomain, name, category_id, headline, about, services,
       phone, email, location, featured_cta_label, featured_cta_phone,
       years_experience, service_areas, hours_text, gallery_json, logo_url,
       portal_lead_credits_balance, directory_featured, is_premium, listing_disabled
     ) VALUES (
       1, $1, 'pw-visual-demo', 'Playwright Visual Co', NULL, '', '', '',
       '', '', '', 'Call us', '',
       NULL, '', '', '[]', '',
       0, false, false, false
     )`,
    [TENANT_DEMO]
  );

  await pool.query(
    `SELECT setval(
       pg_get_serial_sequence('public.companies', 'id'),
       GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.companies), 1),
       true
     )`
  );

  return { id: 1, action: "inserted" };
}

async function main() {
  requireSafeTestDatabaseUrl({ label: "seed-playwright-visual-fixtures" });
  const pool = getPgPool();
  try {
    await ensureCanonicalTenantsForTests(pool);
    const company = await ensureDemoCompanyOne(pool);
    // eslint-disable-next-line no-console
    console.log(
      `[getpro] seed-playwright-visual-fixtures: demo company id=1 ${company.action} (tenant=${TENANT_DEMO}).`
    );
  } finally {
    await closePgPool();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[getpro] seed-playwright-visual-fixtures: FAILED —", err && err.message ? err.message : err);
  process.exit(1);
});
