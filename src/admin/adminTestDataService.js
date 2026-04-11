"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const slugify = require("slugify");
const companiesRepo = require("../db/pg/companiesRepo");
const categoriesRepo = require("../db/pg/categoriesRepo");
const leadsRepo = require("../db/pg/leadsRepo");
const reviewsRepo = require("../db/pg/reviewsRepo");
const fieldAgentsRepo = require("../db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../db/pg/fieldAgentSubmissionsRepo");
const seedRunsRepo = require("../db/pg/seedRunsRepo");
const tenantsRepo = require("../db/pg/tenantsRepo");
const tenantCitiesRepo = require("../db/pg/tenantCitiesRepo");

const AUTHORS = ["Mwansa K.", "Chanda P.", "Banda T.", "Mulenga R.", "Sakala J."];

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} base
 */
async function uniqueSubdomainForTenant(pool, tenantId, base) {
  let sub = slugify(String(base || "listing"), { lower: true, strict: true, trim: true }).slice(0, 60) || "listing";
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await companiesRepo.existsSubdomainForTenant(pool, tenantId, sub)) {
    sub = `${base}-${n++}`.slice(0, 80);
  }
  return sub;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} q
 * @param {{ runId: number, tableName: string, entityId: number }} p
 */
async function recordItem(q, p) {
  await seedRunsRepo.insertItem(q, { runId: p.runId, tableName: p.tableName, entityId: p.entityId });
}

const DELETE_TABLE_ORDER = [
  "leads",
  "field_agent_callback_leads",
  "field_agent_provider_submissions",
  "field_agents",
  "companies",
];

const PG_TABLE = {
  leads: "public.leads",
  companies: "public.companies",
  field_agents: "public.field_agents",
  field_agent_provider_submissions: "public.field_agent_provider_submissions",
  field_agent_callback_leads: "public.field_agent_callback_leads",
};

const TABLES_SEED_TOUCHED = [
  "seed_runs",
  "seed_run_items",
  "companies",
  "reviews",
  "leads",
  "field_agents",
  "field_agent_provider_submissions",
  "field_agent_callback_leads",
];

function tenantSlugFromRow(tenant) {
  return tenant ? String(tenant.slug || "").trim() : "";
}

function isUuidString(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || "").trim());
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function getSeedDataPreview(pool, tenantId) {
  const batchCount = await seedRunsRepo.countRunsForTenant(pool, tenantId);
  const byTable = await seedRunsRepo.countTrackedByTableForTenant(pool, tenantId);
  let totalTrackedRows = 0;
  for (const row of byTable) {
    totalTrackedRows += row.count;
  }
  return { batchCount, byTable, totalTrackedRows };
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} tenantId
 * @param {Record<string, number[]>} byTable
 * @param {Record<string, number>} deleted
 */
async function deleteTrackedEntityRows(client, tenantId, byTable, deleted) {
  for (const tableName of DELETE_TABLE_ORDER) {
    const ids = [...new Set((byTable[tableName] || []).filter((id) => Number.isFinite(id) && id > 0))];
    if (ids.length === 0) continue;
    const pgTable = PG_TABLE[tableName];
    if (!pgTable) continue;
    const res = await client.query(`DELETE FROM ${pgTable} WHERE id = ANY($1::int[]) AND tenant_id = $2`, [
      ids,
      tenantId,
    ]);
    const n = res.rowCount ?? 0;
    if (deleted[tableName] !== undefined) deleted[tableName] = n;
  }
}

function buildTablesTouchedFromDeleted(deleted) {
  const out = [];
  for (const tableName of DELETE_TABLE_ORDER) {
    if ((deleted[tableName] || 0) > 0) out.push(tableName);
  }
  if ((deleted.companies || 0) > 0) out.push("reviews");
  if ((deleted.seed_runs || 0) > 0) {
    out.push("seed_runs");
    out.push("seed_run_items");
  }
  return out;
}

function buildClearSuccessResponse(tenantId, tenant, batchUuids, deleted, trackedRows, message) {
  return {
    ok: true,
    tenantId,
    tenantSlug: tenantSlugFromRow(tenant),
    batchUuids,
    batchUuidsCleared: batchUuids,
    counts: {
      created: {},
      deleted,
    },
    deleted,
    tablesTouched: buildTablesTouchedFromDeleted(deleted),
    trackedRows,
    ...(message ? { message } : {}),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, adminUserId: number }} p
 */
async function createTestData(pool, p) {
  const tenantId = Number(p.tenantId);
  const adminUserId = Number(p.adminUserId);
  if (!Number.isFinite(tenantId) || tenantId < 1) {
    return { ok: false, error: "validation", message: "Invalid tenant id." };
  }
  if (!Number.isFinite(adminUserId) || adminUserId < 1) {
    return { ok: false, error: "validation", message: "Invalid admin user id." };
  }

  const tenant = await tenantsRepo.getById(pool, tenantId);
  if (!tenant) {
    return { ok: false, error: "validation", message: "Tenant not found." };
  }

  const categories = await categoriesRepo.listByTenantId(pool, tenantId);
  const categoryId = categories.length > 0 ? Number(categories[0].id) : null;
  const cityRows = await tenantCitiesRepo.listByTenantIdOrderByName(pool, tenantId);
  const cityNames = cityRows.map((r) => String(r.name || "").trim()).filter(Boolean);
  const professionNames = categories.map((c) => String(c.name || "").trim()).filter(Boolean);
  const professionPool = professionNames.length ? professionNames : ["Service"];
  const cityPool = cityNames.length ? cityNames : ["City"];

  const batchUuid = crypto.randomUUID();
  const batchShort = batchUuid.replace(/-/g, "").slice(0, 12);

  const counts = {
    companies: 0,
    reviews: 0,
    leads: 0,
    fieldAgents: 0,
    fieldAgentSubmissions: 0,
    fieldAgentCallbackLeads: 0,
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const runId = await seedRunsRepo.insertRun(client, {
      batchUuid,
      tenantId,
      createdByAdminUserId: adminUserId,
    });

    for (let i = 0; i < 30; i += 1) {
      const sub = await uniqueSubdomainForTenant(client, tenantId, `seed-${batchShort}-co-${i}`);
      const name = `Seed Service Co ${batchShort.slice(0, 6)} ${i + 1}`;
      const phoneDigits = `26097${String(1000000 + tenantId * 100 + i).padStart(7, "0").slice(-9)}`;
      const phone = `+${phoneDigits}`;
      const dup = await fieldAgentSubmissionsRepo.duplicateExistsCompaniesOrSignups(client, tenantId, [phoneDigits]);
      if (dup.duplicate) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          error: "validation",
          message: `Phone collision with existing data (${dup.source}). Try clear first.`,
        };
      }

      const row = await companiesRepo.insertFull(client, {
        tenantId,
        subdomain: sub,
        name,
        categoryId,
        headline: `Trusted ${professionPool[i % professionPool.length].toLowerCase()} — ${cityPool[i % cityPool.length]}`,
        about: `Full profile text for testing search and detail pages. Established provider ${i + 1} serving ${cityPool[i % cityPool.length]} and nearby areas.`,
        services: `${professionPool[i % professionPool.length]}, maintenance, installations, call-outs.`,
        phone,
        email: `seed-${batchShort}-${i}@example.test`,
        location: `${cityPool[i % cityPool.length]}, Zambia`,
        featuredCtaLabel: "Call us",
        featuredCtaPhone: phone,
        yearsExperience: 3 + (i % 15),
        serviceAreas: `${cityPool[i % cityPool.length]}, surrounding`,
        hoursText: "Mon–Sat 08:00–18:00",
        galleryJson: "[]",
        logoUrl: "",
      });
      const companyId = Number(row.id);
      await recordItem(client, { runId, tableName: "companies", entityId: companyId });
      counts.companies += 1;

      for (let r = 0; r < 2; r += 1) {
        const rid = await reviewsRepo.insertOne(client, {
          companyId,
          rating: 3 + ((i + r) % 3),
          body: `Quality work and fair pricing. Would recommend for ${professionPool[i % professionPool.length].toLowerCase()} jobs.`,
          authorName: AUTHORS[(i + r) % AUTHORS.length],
        });
        await recordItem(client, { runId, tableName: "reviews", entityId: rid });
        counts.reviews += 1;
      }

      const leadId = await leadsRepo.insertPublicLead(client, {
        companyId,
        tenantId,
        name: `Lead Contact ${i + 1}`,
        phone: `+26096${String(2000000 + i).slice(-7)}`,
        email: `lead-${batchShort}-${i}@example.test`,
        message: "Interested in a quote for upcoming work.",
      });
      await recordItem(client, { runId, tableName: "leads", entityId: leadId });
      counts.leads += 1;
    }

    const passwordHash = await bcrypt.hash("seed1234", 12);

    const agentIds = [];
    for (let i = 0; i < 20; i += 1) {
      const username = `seed_fa_${batchShort}_${i}`;
      const existing = await fieldAgentsRepo.getByUsernameAndTenant(client, username, tenantId);
      if (existing) {
        await client.query("ROLLBACK");
        return { ok: false, error: "validation", message: `Field agent username exists: ${username}` };
      }
      const aid = await fieldAgentsRepo.insertAgent(client, {
        tenantId,
        username,
        passwordHash,
        displayName: `Seed Agent ${i + 1}`,
        phone: `+26095${String(3000000 + tenantId * 10 + i).slice(-7)}`,
      });
      agentIds.push(aid);
      await recordItem(client, { runId, tableName: "field_agents", entityId: aid });
      counts.fieldAgents += 1;

      const phoneNorm = `26094${String(4000000 + tenantId * 100 + i).padStart(7, "0").slice(-9)}`;
      const waNorm = phoneNorm;
      const dupS = await fieldAgentSubmissionsRepo.duplicateExistsAgainstSubmissions(
        client,
        tenantId,
        phoneNorm,
        waNorm,
        null
      );
      if (dupS.duplicate) {
        await client.query("ROLLBACK");
        return { ok: false, error: "validation", message: "Submission phone duplicate in tenant." };
      }
      const dupC = await fieldAgentSubmissionsRepo.duplicateExistsCompaniesOrSignups(client, tenantId, [
        phoneNorm,
        waNorm,
      ]);
      if (dupC.duplicate) {
        await client.query("ROLLBACK");
        return { ok: false, error: "validation", message: `Submission blocked (${dupC.source}).` };
      }

      const sid = await fieldAgentSubmissionsRepo.insertSubmission(client, null, {
        tenantId,
        fieldAgentId: aid,
        phoneRaw: `+${phoneNorm}`,
        phoneNorm,
        whatsappRaw: `+${waNorm}`,
        whatsappNorm: waNorm,
        firstName: "Seed",
        lastName: `Provider${i}`,
        profession: professionPool[i % professionPool.length],
        city: cityPool[i % cityPool.length],
        pacra: "",
        addressStreet: `${10 + i} Test Rd`,
        addressLandmarks: "Near central market",
        addressNeighbourhood: "Riverside",
        addressCity: cityPool[i % cityPool.length],
        nrcNumber: "",
        photoProfileUrl: "",
        workPhotosJson: "[]",
      });
      await recordItem(client, { runId, tableName: "field_agent_provider_submissions", entityId: sid });
      counts.fieldAgentSubmissions += 1;
    }

    for (let c = 0; c < 10; c += 1) {
      const faId = agentIds[c % agentIds.length];
      const r = await client.query(
        `INSERT INTO public.field_agent_callback_leads (
          tenant_id, field_agent_id, first_name, last_name, phone, email, location_city
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          tenantId,
          faId,
          "Callback",
          `Lead${c}`,
          `+26093${String(5000000 + c).slice(-7)}`,
          `cb-${batchShort}-${c}@example.test`,
          cityPool[c % cityPool.length],
        ]
      );
      const cid = Number(r.rows[0].id);
      await recordItem(client, { runId, tableName: "field_agent_callback_leads", entityId: cid });
      counts.fieldAgentCallbackLeads += 1;
    }

    await client.query("COMMIT");

    // eslint-disable-next-line no-console
    console.log(
      `[getpro] adminTestData: seeded batch ${batchUuid} tenant=${tenantId} admin=${adminUserId} counts=${JSON.stringify(counts)}`
    );

    return {
      ok: true,
      tenantId,
      tenantSlug: tenantSlugFromRow(tenant),
      batchUuids: [batchUuid],
      batchUuid,
      counts: {
        created: {
          companies: counts.companies,
          reviews: counts.reviews,
          leads: counts.leads,
          field_agents: counts.fieldAgents,
          field_agent_provider_submissions: counts.fieldAgentSubmissions,
          field_agent_callback_leads: counts.fieldAgentCallbackLeads,
        },
        deleted: {},
      },
      tablesTouched: TABLES_SEED_TOUCHED,
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    const msg = e && e.message ? String(e.message) : "Seed failed.";
    // eslint-disable-next-line no-console
    console.error("[getpro] adminTestData createTestData:", msg);
    return { ok: false, error: "server", message: msg };
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, confirmSlug: string, batchUuid?: string }} p
 */
async function clearTestData(pool, p) {
  const tenantId = Number(p.tenantId);
  const confirmSlug = String(p.confirmSlug || "").trim();
  const batchUuidOpt = p.batchUuid != null ? String(p.batchUuid).trim() : "";

  if (!Number.isFinite(tenantId) || tenantId < 1) {
    return { ok: false, error: "validation", message: "Invalid tenant id." };
  }

  const tenant = await tenantsRepo.getById(pool, tenantId);
  if (!tenant) {
    return { ok: false, error: "validation", message: "Tenant not found." };
  }
  if (confirmSlug !== String(tenant.slug || "").trim()) {
    return { ok: false, error: "validation", message: "Confirmation does not match tenant slug." };
  }

  if (batchUuidOpt && !isUuidString(batchUuidOpt)) {
    return { ok: false, error: "validation", message: "Invalid batch UUID." };
  }

  const batchUuidRows = await pool.query(
    `SELECT batch_uuid::text AS batch_uuid FROM public.seed_runs WHERE tenant_id = $1 ORDER BY id ASC`,
    [tenantId]
  );
  const allBatchUuids = batchUuidRows.rows.map((row) => String(row.batch_uuid));

  if (batchUuidOpt) {
    const runId = await seedRunsRepo.getRunIdByTenantAndBatchUuid(pool, tenantId, batchUuidOpt);
    if (runId == null) {
      return { ok: false, error: "validation", message: "Seed batch not found for this tenant." };
    }
    const tracked = await seedRunsRepo.listTrackedEntitiesForRun(pool, runId);
    const byTable = {};
    for (const row of tracked) {
      const t = row.table_name;
      if (!byTable[t]) byTable[t] = [];
      byTable[t].push(row.entity_id);
    }

    const deleted = {
      leads: 0,
      companies: 0,
      field_agents: 0,
      field_agent_provider_submissions: 0,
      field_agent_callback_leads: 0,
      seed_runs: 0,
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (tracked.length > 0) {
        await deleteTrackedEntityRows(client, tenantId, byTable, deleted);
      }
      const runRes = await client.query(`DELETE FROM public.seed_runs WHERE id = $1 AND tenant_id = $2`, [
        runId,
        tenantId,
      ]);
      deleted.seed_runs = runRes.rowCount ?? 0;

      await client.query("COMMIT");

      // eslint-disable-next-line no-console
      console.log(`[getpro] adminTestData: cleared seed batch ${batchUuidOpt} tenant=${tenantId} deleted=${JSON.stringify(deleted)}`);

      return buildClearSuccessResponse(tenantId, tenant, [batchUuidOpt], deleted, tracked.length, undefined);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        /* ignore */
      }
      const msg = e && e.message ? String(e.message) : "Clear failed.";
      // eslint-disable-next-line no-console
      console.error("[getpro] adminTestData clearTestData:", msg);
      return { ok: false, error: "server", message: msg };
    } finally {
      client.release();
    }
  }

  const tracked = await seedRunsRepo.listTrackedEntitiesForTenant(pool, tenantId);
  if (tracked.length === 0) {
    const clientOrphan = await pool.connect();
    try {
      await clientOrphan.query("BEGIN");
      const runRes = await clientOrphan.query(`DELETE FROM public.seed_runs WHERE tenant_id = $1`, [tenantId]);
      await clientOrphan.query("COMMIT");
      const n = runRes.rowCount ?? 0;
      const userMessage =
        n > 0
          ? "No tracked seed rows; removed orphan seed registry entries for this tenant."
          : "No seeded rows registered for this tenant.";
      return buildClearSuccessResponse(
        tenantId,
        tenant,
        allBatchUuids,
        { leads: 0, companies: 0, field_agents: 0, field_agent_provider_submissions: 0, field_agent_callback_leads: 0, seed_runs: n },
        0,
        userMessage
      );
    } catch (e) {
      try {
        await clientOrphan.query("ROLLBACK");
      } catch (_) {
        /* ignore */
      }
      const errMsg = e && e.message ? String(e.message) : "Clear failed.";
      return { ok: false, error: "server", message: errMsg };
    } finally {
      clientOrphan.release();
    }
  }

  const byTable = {};
  for (const row of tracked) {
    const t = row.table_name;
    if (!byTable[t]) byTable[t] = [];
    byTable[t].push(row.entity_id);
  }

  const client = await pool.connect();
  const deleted = {
    leads: 0,
    companies: 0,
    field_agents: 0,
    field_agent_provider_submissions: 0,
    field_agent_callback_leads: 0,
    seed_runs: 0,
  };

  try {
    await client.query("BEGIN");

    await deleteTrackedEntityRows(client, tenantId, byTable, deleted);

    const runRes = await client.query(`DELETE FROM public.seed_runs WHERE tenant_id = $1`, [tenantId]);
    deleted.seed_runs = runRes.rowCount ?? 0;

    await client.query("COMMIT");

    // eslint-disable-next-line no-console
    console.log(`[getpro] adminTestData: cleared seed data tenant=${tenantId} deleted=${JSON.stringify(deleted)}`);

    return buildClearSuccessResponse(tenantId, tenant, allBatchUuids, deleted, tracked.length, undefined);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    const msg = e && e.message ? String(e.message) : "Clear failed.";
    // eslint-disable-next-line no-console
    console.error("[getpro] adminTestData clearTestData:", msg);
    return { ok: false, error: "server", message: msg };
  } finally {
    client.release();
  }
}

module.exports = {
  createTestData,
  clearTestData,
  getSeedDataPreview,
};
