"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { createStaticAssetCacheOptions } = require("../src/platform/http/staticAssetCacheHeaders");

describe("static asset cache headers", () => {
  it("uses long-lived immutable cache for versioned and font assets in production", () => {
    const opts = createStaticAssetCacheOptions(true);
    assert.equal(opts.maxAge, "1d");
    const headers = {};
    const res = {
      req: { originalUrl: "/blessboard/v5/apex.css?v=20" },
      setHeader(k, v) {
        headers[k] = v;
      },
    };
    opts.setHeaders(res, "/tmp/apex.css");
    assert.equal(headers["Cache-Control"], "public, max-age=31536000, immutable");

    const fontHeaders = {};
    const fontRes = {
      req: { originalUrl: "/fonts/inter-7.woff2" },
      setHeader(k, v) {
        fontHeaders[k] = v;
      },
    };
    opts.setHeaders(fontRes, "/tmp/inter-7.woff2");
    assert.equal(fontHeaders["Cache-Control"], "public, max-age=31536000, immutable");
  });

  it("does not mark unversioned CSS immutable", () => {
    const opts = createStaticAssetCacheOptions(true);
    const headers = {};
    const res = {
      req: { originalUrl: "/blessboard/v5/apex.css" },
      setHeader(k, v) {
        headers[k] = v;
      },
    };
    opts.setHeaders(res, "/tmp/apex.css");
    assert.equal(headers["Cache-Control"], undefined);
  });
});
