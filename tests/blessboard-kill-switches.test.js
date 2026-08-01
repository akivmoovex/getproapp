"use strict";

/**
 * Critical V5 kill-switch tests — no Hostinger / production env flips.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseMediaUploadsEnabled,
  areMediaUploadsEnabled,
  formatMediaUploadsEnabledLog,
  ENV_KEY,
} = require("../src/blessboard/config/mediaUploadsEnabled");
const { createMediaUploadService } = require("../src/blessboard/media/mediaUploadService");
const { createLocalFilesystemStorage } = require("../src/blessboard/media/storage/localFilesystemStorage");
const { parseBlessBoardJobsEnabled } = require("../src/platform/config/v5EnvValidation");
const { V5_FOUNDATION_DEPLOYMENT_CODE } = require("../src/platform/config/v5FoundationMode");
const { areBlessBoardJobsEnabled } = require("../src/church/blessBoardEnv");

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("media uploads kill switch", () => {
  it("defaults disabled; invalid tokens fail closed", () => {
    assert.equal(parseMediaUploadsEnabled({}).enabled, false);
    assert.equal(parseMediaUploadsEnabled({}).reason, "default_disabled");
    assert.equal(parseMediaUploadsEnabled({ [ENV_KEY]: "0" }).enabled, false);
    assert.equal(parseMediaUploadsEnabled({ [ENV_KEY]: "1" }).enabled, true);
    assert.equal(parseMediaUploadsEnabled({ [ENV_KEY]: "weird" }).enabled, false);
    assert.equal(parseMediaUploadsEnabled({ [ENV_KEY]: "weird" }).ok, false);
    assert.equal(areMediaUploadsEnabled({ [ENV_KEY]: "yes" }), true);
    assert.match(formatMediaUploadsEnabledLog({}), /BLESSBOARD_MEDIA_UPLOADS_ENABLED=0/);
    assert.doesNotMatch(formatMediaUploadsEnabledLog({ [ENV_KEY]: "1" }), /supabase|secret|postgres/i);
  });

  it("uploadMediaAsset refuses when disabled (service enforcement)", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "bb-media-kill-"));
    try {
      const storage = createLocalFilesystemStorage({ rootDir, bucket: "local" });
      const disabled = createMediaUploadService(
        { BLESSBOARD_MEDIA_UPLOADS_ENABLED: "0", BLESSBOARD_MEDIA_FORCE_LOCAL: "1" },
        { storage }
      );
      const blocked = await disabled.uploadMediaAsset(
        { query: async () => ({ rows: [] }) },
        {
          churchId: "11111111-1111-4111-8111-111111111111",
          uploadedByUserId: "22222222-2222-4222-8222-222222222222",
          buffer: PNG_1X1,
          originalFilename: "x.png",
          claimedMime: "image/png",
          dedupeByHash: false,
        }
      );
      assert.equal(blocked.ok, false);
      assert.equal(blocked.reason, "media_uploads_disabled");

      const enabled = createMediaUploadService(
        { BLESSBOARD_MEDIA_UPLOADS_ENABLED: "1", BLESSBOARD_MEDIA_FORCE_LOCAL: "1" },
        { storage }
      );
      // DB insert will fail without real pool — only assert kill switch path is not taken.
      const attempt = await enabled.uploadMediaAsset(
        {
          query: async () => {
            throw new Error("expected_db_path");
          },
          connect: async () => {
            throw new Error("expected_db_path");
          },
        },
        {
          churchId: "11111111-1111-4111-8111-111111111111",
          uploadedByUserId: "22222222-2222-4222-8222-222222222222",
          buffer: PNG_1X1,
          originalFilename: "x.png",
          claimedMime: "image/png",
          dedupeByHash: false,
        }
      );
      assert.notEqual(attempt.reason, "media_uploads_disabled");
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe("V5 jobs kill switch fail-closed", () => {
  it("blessboard-org-staging unset disables without foundation testing pairing", () => {
    const parsed = parseBlessBoardJobsEnabled({
      PLATFORM_DEPLOYMENT_CODE: V5_FOUNDATION_DEPLOYMENT_CODE,
      DEPLOYMENT_ENV: "production",
    });
    assert.equal(parsed.enabled, false);
    assert.equal(parsed.reason, "v5_default_disabled");
  });

  it("V4 unset remains enabled; V4 unsupported still enables", () => {
    assert.equal(
      parseBlessBoardJobsEnabled({
        PLATFORM_DEPLOYMENT_CODE: "blessboard-com-production",
        DEPLOYMENT_ENV: "production",
      }).enabled,
      true
    );
    const bad = parseBlessBoardJobsEnabled({
      PLATFORM_DEPLOYMENT_CODE: "blessboard-com-production",
      DEPLOYMENT_ENV: "production",
      BLESSBOARD_JOBS_ENABLED: "maybe",
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.enabled, true);
  });

  it("areBlessBoardJobsEnabled delegates to parser", () => {
    const prevCode = process.env.PLATFORM_DEPLOYMENT_CODE;
    const prevDep = process.env.DEPLOYMENT_ENV;
    const prevJobs = process.env.BLESSBOARD_JOBS_ENABLED;
    try {
      process.env.PLATFORM_DEPLOYMENT_CODE = V5_FOUNDATION_DEPLOYMENT_CODE;
      process.env.DEPLOYMENT_ENV = "testing";
      delete process.env.BLESSBOARD_JOBS_ENABLED;
      assert.equal(areBlessBoardJobsEnabled(), false);
    } finally {
      if (prevCode === undefined) delete process.env.PLATFORM_DEPLOYMENT_CODE;
      else process.env.PLATFORM_DEPLOYMENT_CODE = prevCode;
      if (prevDep === undefined) delete process.env.DEPLOYMENT_ENV;
      else process.env.DEPLOYMENT_ENV = prevDep;
      if (prevJobs === undefined) delete process.env.BLESSBOARD_JOBS_ENABLED;
      else process.env.BLESSBOARD_JOBS_ENABLED = prevJobs;
    }
  });
});
