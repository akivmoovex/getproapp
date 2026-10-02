"use strict";

/**
 * Tests for BlessBoard V5 pilot readiness command (read-only + secret redaction).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");

const {
  runPilotOperationalReadiness,
  redactSecrets,
} = require("../src/services/church/churchPilotOperationalReadinessService");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");

test("redactSecrets strips connection strings and password-like tokens", () => {
  const raw =
    "url=postgresql://user:supersecret@db.example:5432/app password=hunter2 api_key=xyz Bearer tok_abc_def";
  const out = redactSecrets(raw);
  assert.ok(!out.includes("supersecret"));
  assert.ok(!out.includes("hunter2"));
  assert.ok(!out.includes("tok_abc_def"));
  assert.ok(!out.includes("xyz"));
  assert.match(out, /\[redacted\]/);
  // Safe operational labels must survive.
  assert.match(
    redactSecrets("PASS env.session_secret: Session secret env var is set"),
    /env\.session_secret/
  );
});

test("runPilotOperationalReadiness returns structured checks without secrets", async () => {
  const prevSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "x".repeat(40);
  try {
    const result = await runPilotOperationalReadiness({
      pool: isPgConfigured() ? getPgPool() : null,
      expectEnv: null,
    });
    assert.ok(Array.isArray(result.checks));
    assert.ok(result.checks.length >= 5);
    assert.ok(result.reportText.includes("SUMMARY"));
    assert.ok(result.reportText.includes("RESULT:"));
    assert.equal(result.summary.readOnly, true);
    assert.ok(!/postgresql:\/\//i.test(result.reportText));
    assert.ok(!result.reportText.includes(process.env.SESSION_SECRET));
    for (const c of result.checks) {
      assert.ok(["pass", "fail", "warn"].includes(c.status));
      assert.ok(c.id);
      assert.ok(!/postgresql:\/\//i.test(c.message));
    }
  } finally {
    if (prevSecret == null) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
  }
});

test(
  "PG: readiness command report covers identity/migration/tables when schema present",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const prevSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "y".repeat(40);
    try {
      const result = await runPilotOperationalReadiness({ pool });
      const ids = new Set(result.checks.map((c) => c.id));
      assert.ok(ids.has("env.session_secret"));
      assert.ok(ids.has("domains.canonical"));
      assert.ok(ids.has("jobs.enabled"));
      assert.ok(ids.has("demo.visibility_policy"));
      assert.ok(ids.has("db.reachable"));
      assert.ok(ids.has("db.tables") || ids.has("db.identity"));
      assert.ok(!result.reportText.includes("y".repeat(40)));
    } finally {
      if (prevSecret == null) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = prevSecret;
    }
  }
);

test("CLI script exits and prints SUMMARY without leaking DATABASE_URL", () => {
  const script = path.join(__dirname, "../scripts/church-pilot-readiness.js");
  const env = {
    ...process.env,
    SESSION_SECRET: "z".repeat(40),
  };
  // Force a recognizable secret into env that must never appear in stdout.
  const poison = "postgresql://poison_user:poison_pass@127.0.0.1:5432/poison_db";
  env.GETPRO_DIAG_POISON_URL = poison;

  const ran = spawnSync(process.execPath, [script], {
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  const out = `${ran.stdout || ""}\n${ran.stderr || ""}`;
  assert.ok(out.includes("SUMMARY") || out.includes("FATAL") || out.includes("Error"));
  assert.ok(!out.includes("poison_pass"));
  assert.ok(!out.includes(poison));
  // Exit 0 or 1 both acceptable depending on local DB identity; must not be crash without report.
  assert.ok(ran.status === 0 || ran.status === 1);
});
