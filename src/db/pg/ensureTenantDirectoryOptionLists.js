"use strict";

const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const categoriesRepo = require("./categoriesRepo");
const tenantCitiesRepo = require("./tenantCitiesRepo");
const { TENANT_ZM, TENANT_DEMO } = require("../../tenants/tenantIds");

const FALLBACK_SERVICE_NAMES = ["Electrician", "Plumber", "Carpenter", "Painter", "Cleaner", "HVAC technician"];
const FALLBACK_CITY_NAMES = ["Lusaka", "Ndola", "Kitwe", "Kabwe", "Livingstone"];

const BIG_CITY_HINTS = new Set(["Lusaka", "Ndola", "Kitwe", "Kabwe", "Livingstone", "Chipata", "Solwezi", "Chingola"]);

/**
 * Seed `public.categories` for Zambia from `public/data/search-lists.json` `services` when empty.
 * @param {import("pg").Pool} pool
 */
async function seedZmCategoriesIfEmpty(pool) {
  const n = await categoriesRepo.countForTenant(pool, TENANT_ZM);
  if (n > 0) return;

  let serviceNames = [];
  const jsonPath = path.join(__dirname, "../../../public/data/search-lists.json");
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw);
    serviceNames = Array.isArray(parsed.services) ? parsed.services : [];
  } catch {
    serviceNames = [];
  }
  if (!serviceNames.length) {
    serviceNames = FALLBACK_SERVICE_NAMES.slice();
  }

  let inserted = 0;
  for (const rawName of serviceNames) {
    const clean = String(rawName || "").trim();
    if (!clean) continue;
    let baseSlug = slugify(clean, { lower: true, strict: true, trim: true }).slice(0, 120) || "service";
    for (let attempt = 0; attempt < 15; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
      const r = await pool.query(
        `INSERT INTO public.categories (tenant_id, slug, name) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, slug) DO NOTHING`,
        [TENANT_ZM, slug.slice(0, 120), clean]
      );
      if (r.rowCount > 0) {
        inserted += r.rowCount;
        break;
      }
    }
  }
  if (inserted > 0) {
    // eslint-disable-next-line no-console
    console.log(`[getpro] Seeded ${inserted} Zambia categories from search-lists (fallback where needed).`);
  }
}

/**
 * Seed `public.tenant_cities` for Zambia from `public/data/search-lists.json` `cities` when empty.
 * @param {import("pg").Pool} pool
 */
async function seedZmTenantCitiesIfEmpty(pool) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM public.tenant_cities WHERE tenant_id = $1`, [
    TENANT_ZM,
  ]);
  if ((rows[0]?.n ?? 0) > 0) return;

  let cityNames = [];
  const jsonPath = path.join(__dirname, "../../../public/data/search-lists.json");
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw);
    cityNames = Array.isArray(parsed.cities) ? parsed.cities : [];
  } catch {
    cityNames = [];
  }
  if (!cityNames.length) {
    cityNames = FALLBACK_CITY_NAMES.slice();
  }

  let inserted = 0;
  for (const raw of cityNames) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const big = BIG_CITY_HINTS.has(name);
    try {
      await tenantCitiesRepo.insert(pool, {
        tenantId: TENANT_ZM,
        name,
        enabled: true,
        bigCity: big,
      });
      inserted += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[getpro] seedZmTenantCitiesIfEmpty: skip city "${name}": ${e.message}`);
    }
  }
  if (inserted > 0) {
    // eslint-disable-next-line no-console
    console.log(`[getpro] Seeded ${inserted} Zambia cities from search-lists (fallback where needed).`);
  }
}

/**
 * Idempotent: ensure Zambia has categories + cities from legacy JSON when empty, then copy to Demo when empty.
 * @param {import("pg").Pool} pool
 */
async function ensureTenantDirectoryOptionLists(pool) {
  await seedZmCategoriesIfEmpty(pool);
  await categoriesRepo.copyFromTenantIfDestEmpty(pool, TENANT_DEMO, TENANT_ZM);
  await seedZmTenantCitiesIfEmpty(pool);
  await tenantCitiesRepo.copyFromTenantIfDestEmpty(pool, TENANT_DEMO, TENANT_ZM);
}

module.exports = { ensureTenantDirectoryOptionLists };
