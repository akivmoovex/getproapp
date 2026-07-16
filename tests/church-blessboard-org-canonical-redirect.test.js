"use strict";

/**
 * BlessBoard.org V5 canonical redirect behaviour (env-driven).
 * V4 defaults (unset env) still map .org → .com.
 */

const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { blessboardCanonicalRedirect } = require("../src/church/blessboardCanonicalRedirect");
const {
  getBlessBoardCanonicalDomain,
  getBlessBoardApexDomainSet,
  getChurchHostDomain,
} = require("../src/church/blessBoardEnv");

const ENV_KEYS = [
  "BLESSBOARD_CANONICAL_DOMAIN",
  "BLESSBOARD_APEX_DOMAINS",
  "CHURCH_HOST_DOMAIN",
  "BLESSBOARD_PUBLIC_URL",
  "BLESSBOARD_CANONICAL_REDIRECT",
  "BLESSBOARD_FORCE_HTTPS",
];

async function withEnv(overrides, fn) {
  const prev = {};
  for (const key of ENV_KEYS) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

function makeRedirectApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(blessboardCanonicalRedirect);
  app.get("*path", (req, res) => {
    res.status(200).send(`ok:${req.headers.host}`);
  });
  return app;
}

const V5_ORG = {
  BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
  BLESSBOARD_APEX_DOMAINS: "blessboard.org,www.blessboard.org",
  CHURCH_HOST_DOMAIN: "blessboard.org",
  BLESSBOARD_CANONICAL_REDIRECT: "1",
};

test("V5: https blessboard.org does not redirect to blessboard.com", async () => {
  await withEnv(V5_ORG, async () => {
    const res = await request(makeRedirectApp())
      .get("/")
      .set("Host", "blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 200);
    assert.match(res.text, /ok:blessboard\.org/);
    assert.equal(res.headers.location, undefined);
  });
});

test("V5: www.blessboard.org redirects to blessboard.org", async () => {
  await withEnv(V5_ORG, async () => {
    const res = await request(makeRedirectApp())
      .get("/about")
      .set("Host", "www.blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.org/about");
    assert.doesNotMatch(res.headers.location, /blessboard\.com/);
  });
});

test("V5: http blessboard.org redirects to https blessboard.org", async () => {
  await withEnv(V5_ORG, async () => {
    const res = await request(makeRedirectApp()).get("/").set("Host", "blessboard.org");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.org/");
  });
});

test("V5: http www.blessboard.org redirects to https blessboard.org", async () => {
  await withEnv(V5_ORG, async () => {
    const res = await request(makeRedirectApp()).get("/pricing").set("Host", "www.blessboard.org");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.org/pricing");
  });
});

test("V5: path and query are preserved on www → apex redirect", async () => {
  await withEnv(V5_ORG, async () => {
    const res = await request(makeRedirectApp())
      .get("/features?ref=home&utm=1")
      .set("Host", "www.blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.org/features?ref=home&utm=1");
  });
});

test("V5: no cross-TLD redirect when apex list is org-only", async () => {
  await withEnv(V5_ORG, async () => {
    assert.equal(getBlessBoardCanonicalDomain(), "blessboard.org");
    const apex = getBlessBoardApexDomainSet();
    assert.equal(apex.has("blessboard.org"), true);
    assert.equal(apex.has("www.blessboard.org"), true);
    assert.equal(apex.has("blessboard.com"), false);

    const org = await request(makeRedirectApp())
      .get("/x")
      .set("Host", "blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(org.status, 200);

    // blessboard.com is not a product host under org-only apex → no redirect to .org either
    const com = await request(makeRedirectApp())
      .get("/")
      .set("Host", "blessboard.com")
      .set("X-Forwarded-Proto", "https");
    assert.equal(com.status, 200);
    assert.match(com.text, /ok:blessboard\.com/);
  });
});

test("V5: leftover CHURCH_HOST_DOMAIN=.com does not force .org → .com when apex is org-only", async () => {
  await withEnv(
    {
      BLESSBOARD_CANONICAL_DOMAIN: undefined,
      CHURCH_HOST_DOMAIN: "blessboard.com",
      BLESSBOARD_APEX_DOMAINS: "blessboard.org,www.blessboard.org",
      BLESSBOARD_CANONICAL_REDIRECT: "1",
    },
    async () => {
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.org");
      const res = await request(makeRedirectApp())
        .get("/stay")
        .set("Host", "blessboard.org")
        .set("X-Forwarded-Proto", "https");
      assert.equal(res.status, 200);
      assert.equal(res.headers.location, undefined);
    }
  );
});

test("V5: leftover CANONICAL_DOMAIN=.com ignored when apex list is org-only", async () => {
  await withEnv(
    {
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
      BLESSBOARD_APEX_DOMAINS: "blessboard.org,www.blessboard.org",
      CHURCH_HOST_DOMAIN: "blessboard.com",
      BLESSBOARD_PUBLIC_URL: "https://blessboard.org",
      BLESSBOARD_CANONICAL_REDIRECT: "1",
    },
    async () => {
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.org");
      const apex = getBlessBoardApexDomainSet();
      assert.equal(apex.has("blessboard.com"), false);
      assert.equal(apex.has("blessboard.org"), true);

      const res = await request(makeRedirectApp())
        .get("/?fresh=1")
        .set("Host", "blessboard.org")
        .set("X-Forwarded-Proto", "https");
      assert.equal(res.status, 200);
      assert.equal(res.headers.location, undefined);
    }
  );
});

test("V5: quoted env values resolve to blessboard.org", async () => {
  await withEnv(
    {
      BLESSBOARD_CANONICAL_DOMAIN: '"blessboard.org"',
      BLESSBOARD_APEX_DOMAINS: '"blessboard.org","www.blessboard.org"',
      CHURCH_HOST_DOMAIN: "'blessboard.org'",
      BLESSBOARD_PUBLIC_URL: '"https://blessboard.org"',
      BLESSBOARD_CANONICAL_REDIRECT: "1",
    },
    async () => {
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.org");
      assert.equal(getBlessBoardApexDomainSet().has("www.blessboard.org"), true);
      const res = await request(makeRedirectApp())
        .get("/")
        .set("Host", "blessboard.org")
        .set("X-Forwarded-Proto", "https");
      assert.equal(res.status, 200);
    }
  );
});

test("V5: BLESSBOARD_CANONICAL_REDIRECT=false disables host remap but keeps HTTPS", async () => {
  await withEnv(
    {
      ...V5_ORG,
      BLESSBOARD_CANONICAL_REDIRECT: "false",
    },
    async () => {
      const wwwHttps = await request(makeRedirectApp())
        .get("/keep-www")
        .set("Host", "www.blessboard.org")
        .set("X-Forwarded-Proto", "https");
      assert.equal(wwwHttps.status, 200);

      const httpApex = await request(makeRedirectApp()).get("/secure-me").set("Host", "blessboard.org");
      assert.equal(httpApex.status, 301);
      assert.equal(httpApex.headers.location, "https://blessboard.org/secure-me");
    }
  );
});

test("domain getters read live process.env after module load (no require-time capture)", async () => {
  await withEnv(
    {
      BLESSBOARD_CANONICAL_DOMAIN: undefined,
      BLESSBOARD_APEX_DOMAINS: undefined,
      CHURCH_HOST_DOMAIN: undefined,
      BLESSBOARD_PUBLIC_URL: undefined,
    },
    async () => {
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.com");
      process.env.BLESSBOARD_CANONICAL_DOMAIN = "blessboard.org";
      process.env.BLESSBOARD_APEX_DOMAINS = "blessboard.org,www.blessboard.org";
      process.env.CHURCH_HOST_DOMAIN = "blessboard.org";
      process.env.BLESSBOARD_PUBLIC_URL = "https://blessboard.org";
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.org");
      assert.equal(getChurchHostDomain(), "blessboard.org");
      assert.equal(getBlessBoardApexDomainSet().has("blessboard.com"), false);
    }
  );
});

test("server.js loads bootstrap before church canonical redirect", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const bootIdx = src.indexOf("runBootstrap");
  const redirectIdx = src.indexOf("blessboardCanonicalRedirect");
  assert.ok(bootIdx >= 0 && redirectIdx >= 0);
  assert.ok(bootIdx < redirectIdx, "bootstrap must run before canonical redirect middleware is required");
});

test("V5: BLESSBOARD_CANONICAL_REDIRECT=0 disables host remap but keeps HTTPS", async () => {
  await withEnv(
    {
      ...V5_ORG,
      BLESSBOARD_CANONICAL_REDIRECT: "0",
    },
    async () => {
      const wwwHttps = await request(makeRedirectApp())
        .get("/keep-www")
        .set("Host", "www.blessboard.org")
        .set("X-Forwarded-Proto", "https");
      assert.equal(wwwHttps.status, 200);
      assert.match(wwwHttps.text, /ok:www\.blessboard\.org/);

      const httpApex = await request(makeRedirectApp()).get("/secure-me").set("Host", "blessboard.org");
      assert.equal(httpApex.status, 301);
      assert.equal(httpApex.headers.location, "https://blessboard.org/secure-me");
    }
  );
});

test("V4 default: blessboard.org still redirects to blessboard.com", async () => {
  await withEnv(
    {
      BLESSBOARD_CANONICAL_DOMAIN: undefined,
      BLESSBOARD_APEX_DOMAINS: undefined,
      CHURCH_HOST_DOMAIN: undefined,
      BLESSBOARD_CANONICAL_REDIRECT: "1",
    },
    async () => {
      assert.equal(getBlessBoardCanonicalDomain(), "blessboard.com");
      const res = await request(makeRedirectApp())
        .get("/pricing?ref=test")
        .set("Host", "blessboard.org")
        .set("X-Forwarded-Proto", "https");
      assert.equal(res.status, 301);
      assert.equal(res.headers.location, "https://blessboard.com/pricing?ref=test");
    }
  );
});

test("tenant host behaviour unchanged under V5 org config", async () => {
  await withEnv(V5_ORG, async () => {
    const res = await request(makeRedirectApp())
      .get("/login")
      .set("Host", "demo.blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 200);
    assert.match(res.text, /ok:demo\.blessboard\.org/);
    assert.equal(res.headers.location, undefined);
  });
});
