"use strict";

const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { blessboardCanonicalRedirect } = require("../src/church/blessboardCanonicalRedirect");

function makeRedirectApp() {
  const app = express();
  app.use(blessboardCanonicalRedirect);
  app.get("*path", (req, res) => {
    res.status(200).send(`ok:${req.headers.host}`);
  });
  return app;
}

test("redirects www.blessboard.com to apex with path and query", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "1";
  try {
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/features?ref=home")
      .set("Host", "www.blessboard.com")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.com/features?ref=home");
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});

test("redirects blessboard.org to canonical blessboard.com with path and query", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "1";
  try {
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/pricing?ref=test")
      .set("Host", "blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.com/pricing?ref=test");
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});

test("redirects HTTP to HTTPS on blessboard.com hosts", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "1";
  try {
    const app = makeRedirectApp();
    const res = await request(app).get("/about").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://demo.blessboard.com/about");
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});

test("does not redirect tenant hosts to blessboard.com apex", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "1";
  try {
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/")
      .set("Host", "demo.blessboard.com")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 200);
    assert.match(res.text, /demo\.blessboard\.com/);
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});

test("skips redirects when BLESSBOARD_CANONICAL_REDIRECT=0", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "0";
  try {
    const app = makeRedirectApp();
    const res = await request(app).get("/").set("Host", "www.blessboard.com");
    assert.equal(res.status, 200);
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});
