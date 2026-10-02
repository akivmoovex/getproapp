"use strict";

/**
 * PROMPT 32 — Prepare disposable V8 QA church for path-public surfaces.
 * Publishes website + visitor activity form for bb-v8qa-mub23a6v6a6b only.
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v8-qa-church-public-prepare.js --dry-run
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v8-qa-church-public-prepare.js --confirm
 */

const {
  parseWriteMode,
  resolveDatabaseUrlSafe,
  createProvisionPool,
  requireMatchedIdentity,
  assertDeploymentTarget,
  redactSecretsDeep,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
} = require("../../src/platform/config/canonicalDeploymentProfiles");
const {
  publishInitialFoundationWebsite,
} = require("../../src/blessboard/services/churchWebsitePublishService");
const {
  publishActivityRegistrationForm,
} = require("../../src/blessboard/services/activityRegistrationService");

const EXPECTED_IDENTITY = "moovex-platform-v7";
const EXPECTED_ENV = "testing";
const DEPLOYMENT = CODE_MOOVEX_PLATFORM_V8_TESTING;
const QA_ORG_KEY = "bb-v8qa-mub23a6v6a6b";

function emit(obj) {
  const text = JSON.stringify(redactSecretsDeep(obj), null, 2);
  assertNoSecretsInText(text);
  // eslint-disable-next-line no-console
  console.log(text);
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  let pool = null;
  try {
    const dbUrl = resolveDatabaseUrlSafe();
    if (!dbUrl.ok) {
      emit({ ok: false, code: "DATABASE_URL_required", message: dbUrl.message });
      process.exitCode = 2;
      return;
    }
    pool = createProvisionPool(dbUrl.connectionString, { max: 4 });

    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      emit({ ok: false, code: "identity_refused", message: identity.message });
      process.exitCode = 2;
      return;
    }
    if (
      String(identity.identityKey) !== EXPECTED_IDENTITY ||
      String(identity.environmentCode) !== EXPECTED_ENV
    ) {
      emit({
        ok: false,
        code: "identity_mismatch",
        expected: { identityKey: EXPECTED_IDENTITY, environmentCode: EXPECTED_ENV },
        actual: {
          identityKey: identity.identityKey,
          environmentCode: identity.environmentCode,
        },
      });
      process.exitCode = 2;
      return;
    }

    const dep = await assertDeploymentTarget(pool, DEPLOYMENT);
    if (!dep.ok) {
      emit({ ok: false, code: "deployment_refused", message: dep.message, detail: dep });
      process.exitCode = 2;
      return;
    }

    const orgRes = await pool.query(
      `SELECT o.id AS organization_id, o.organization_key, o.test_cleanup_eligible,
              c.id AS church_id, c.display_name,
              cs.website_status, cs.public_name
         FROM platform.organizations o
         INNER JOIN blessboard.churches c ON c.organization_id = o.id
         LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
        WHERE o.organization_key = $1
        LIMIT 1`,
      [QA_ORG_KEY]
    );
    if (!orgRes.rowCount) {
      emit({ ok: false, code: "qa_church_missing", organizationKey: QA_ORG_KEY });
      process.exitCode = 2;
      return;
    }
    const row = orgRes.rows[0];
    if (!row.test_cleanup_eligible) {
      emit({ ok: false, code: "not_disposable", organizationKey: QA_ORG_KEY });
      process.exitCode = 2;
      return;
    }

    emit({
      ok: true,
      dryRun: mode.dryRun,
      organizationKey: row.organization_key,
      websiteStatusBefore: row.website_status,
      publicHome: `https://blessboard.neuniversity.org/c/${row.organization_key}`,
      planned: [
        "publishInitialFoundationWebsite(publish:true)",
        "publishActivityRegistrationForm(visitor)",
      ],
    });
    if (mode.dryRun) {
      emit({ ok: true, note: "Dry-run only. Re-run with --confirm to apply." });
      return;
    }

    const client = await pool.connect();
    let published;
    try {
      await client.query("BEGIN");
      published = await publishInitialFoundationWebsite(client, {
        churchId: row.church_id,
        organizationId: row.organization_id,
        organizationKey: row.organization_key,
        publicName: row.public_name || row.display_name || "V8 QA Church",
        publish: true,
        source: "v8-qa-church-public-prepare",
      });
      if (!published.ok) {
        throw new Error(`website publish failed: ${published.reason || published.status}`);
      }
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }

    const visitor = await publishActivityRegistrationForm(pool, {
      kind: "visitor",
      organizationId: row.organization_id,
      churchId: row.church_id,
      authz: async () => ({ ok: true }),
    });
    if (!visitor.ok) {
      emit({
        ok: false,
        code: "visitor_form_failed",
        reason: visitor.reason || visitor.status,
      });
      process.exitCode = 2;
      return;
    }

    const after = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [row.church_id]
    );
    emit({
      ok: true,
      organizationKey: row.organization_key,
      websiteStatus: after.rows[0] && after.rows[0].website_status,
      websitePublish: {
        alreadyPublished: Boolean(published.alreadyPublished),
        publicPath: published.publicPath,
        pageCount: published.pageCount,
      },
      visitorFormPublished: true,
      publicUrls: {
        home: `/c/${row.organization_key}`,
        register: `/c/${row.organization_key}/register`,
        visit: `/c/${row.organization_key}/visit`,
        announcements: `/c/${row.organization_key}/hq/announcements`,
      },
    });
  } catch (err) {
    emit({
      ok: false,
      code: "prepare_failed",
      message: String(err && err.message ? err.message : err),
    });
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

main();
