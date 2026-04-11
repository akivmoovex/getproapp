"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, describe, test } = require("node:test");
const express = require("express");
const request = require("supertest");

const {
  isJoinEmbedGet,
  joinEmbedFrameAncestors,
  createJoinEmbedHelmetMiddleware,
} = require("../src/http/joinEmbedHelmet");
const { PLATFORM_REGION_SLUGS } = require("../src/tenants");

describe("join embed Helmet (regression)", () => {
  const saved = {};

  beforeEach(() => {
    saved.BASE_DOMAIN = process.env.BASE_DOMAIN;
    saved.PUBLIC_SCHEME = process.env.PUBLIC_SCHEME;
  });

  afterEach(() => {
    if (saved.BASE_DOMAIN !== undefined) process.env.BASE_DOMAIN = saved.BASE_DOMAIN;
    else delete process.env.BASE_DOMAIN;
    if (saved.PUBLIC_SCHEME !== undefined) process.env.PUBLIC_SCHEME = saved.PUBLIC_SCHEME;
    else delete process.env.PUBLIC_SCHEME;
  });

  test("isJoinEmbedGet: true only for GET/HEAD /join with embed=1 or embed=true", () => {
    assert.equal(
      isJoinEmbedGet({
        method: "GET",
        path: "/join",
        originalUrl: "/join?embed=1",
      }),
      true
    );
    assert.equal(
      isJoinEmbedGet({
        method: "GET",
        path: "/join",
        originalUrl: "/join?embed=true",
      }),
      true
    );
    assert.equal(
      isJoinEmbedGet({
        method: "HEAD",
        path: "/join",
        originalUrl: "/join?embed=1",
      }),
      true
    );
    assert.equal(
      isJoinEmbedGet({
        method: "GET",
        path: "/join",
        originalUrl: "/join?other=1&embed=1",
      }),
      true
    );
    assert.equal(
      isJoinEmbedGet({ method: "GET", path: "/join", originalUrl: "/join" }),
      false
    );
    assert.equal(
      isJoinEmbedGet({
        method: "GET",
        path: "/join",
        originalUrl: "/join?embed=0",
      }),
      false
    );
    assert.equal(
      isJoinEmbedGet({
        method: "POST",
        path: "/join",
        originalUrl: "/join?embed=1",
      }),
      false
    );
    assert.equal(
      isJoinEmbedGet({
        method: "GET",
        path: "/directory",
        originalUrl: "/directory?embed=1",
      }),
      false
    );
  });

  test("joinEmbedFrameAncestors: apex, www, every PLATFORM_REGION_SLUGS host, no duplicates", () => {
    process.env.BASE_DOMAIN = "verify-embed.example";
    process.env.PUBLIC_SCHEME = "https";
    const list = joinEmbedFrameAncestors();
    assert.equal(list.length, new Set(list).size, "duplicate frame-ancestor tokens");
    assert.ok(list.includes("'self'"));
    assert.ok(list.includes("https://verify-embed.example"));
    assert.ok(list.includes("https://www.verify-embed.example"));
    for (const slug of PLATFORM_REGION_SLUGS) {
      assert.ok(
        list.includes(`https://${slug}.verify-embed.example`),
        `missing regional host ${slug}`
      );
    }
    // Israel + DEFAULT_OPS (zm/demo/…) iframe targets are covered by regional list + marketing tests
    assert.ok(list.includes("https://il.verify-embed.example"));
    assert.ok(list.includes("https://zm.verify-embed.example"));
    assert.ok(list.includes("https://demo.verify-embed.example"));
  });

  test("joinEmbedFrameAncestors: unset BASE_DOMAIN → localhost:3000 and 127.0.0.1:3000 only", () => {
    delete process.env.BASE_DOMAIN;
    delete process.env.PUBLIC_SCHEME;
    const list = joinEmbedFrameAncestors();
    assert.deepEqual(list, ["'self'", "http://localhost:3000", "http://127.0.0.1:3000"]);
  });

  test("middleware: /join?embed=1 uses expanded frame-ancestors and omits X-Frame-Options", async () => {
    process.env.BASE_DOMAIN = "mw-embed.example";
    process.env.PUBLIC_SCHEME = "https";
    const app = express();
    app.use(createJoinEmbedHelmetMiddleware());
    app.get("/join", (_req, res) => res.send("join"));
    app.get("/", (_req, res) => res.send("home"));

    const embedRes = await request(app).get("/join?embed=1");
    assert.equal(embedRes.status, 200);
    const csp = embedRes.headers["content-security-policy"];
    assert.ok(typeof csp === "string" && csp.includes("frame-ancestors"));
    assert.ok(csp.includes("https://zm.mw-embed.example"));
    assert.ok(csp.includes("https://il.mw-embed.example"));
    assert.equal(embedRes.headers["x-frame-options"], undefined);

    const plainJoin = await request(app).get("/join");
    assert.equal(plainJoin.status, 200);
    assert.ok(plainJoin.headers["x-frame-options"]);
    const plainCsp = plainJoin.headers["content-security-policy"];
    assert.ok(plainCsp && plainCsp.includes("frame-ancestors 'self'"));

    const home = await request(app).get("/");
    assert.equal(home.status, 200);
    assert.ok(home.headers["x-frame-options"]);
  });
});
