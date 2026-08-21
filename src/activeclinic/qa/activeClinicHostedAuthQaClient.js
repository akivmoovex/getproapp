"use strict";

/**
 * Cookie-aware HTTPS client for hosted ActiveClinic QA. Never logs cookie values.
 */

const { CSRF_FIELD } = require("../../platform/http/v5Csrf");

const SESSION_COOKIE = "activeclinic_pronline_sid";
const CSRF_COOKIE = "activeclinic_pronline_csrf";

class CookieJar {
  constructor() {
    this.map = new Map();
  }

  absorb(setCookieHeaders) {
    const headers = [].concat(setCookieHeaders || []);
    for (const raw of headers) {
      const part = String(raw).split(";")[0];
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!name) continue;
      this.map.set(name, value);
    }
  }

  header() {
    return Array.from(this.map.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  has(name) {
    return this.map.has(name);
  }

  names() {
    return Array.from(this.map.keys()).sort();
  }

  csrf() {
    return this.map.get(CSRF_COOKIE) || "";
  }

  sessionPresent() {
    return this.has(SESSION_COOKIE);
  }
}

function extractCsrfField(html) {
  const match = String(html || "").match(
    new RegExp(`name=["']${CSRF_FIELD}["'][^>]*value=["']([^"']+)["']`, "i")
  );
  if (match) return match[1];
  const alt = String(html || "").match(
    new RegExp(`value=["']([^"']+)["'][^>]*name=["']${CSRF_FIELD}["']`, "i")
  );
  return alt ? alt[1] : "";
}

function extractMatch(html, re) {
  const m = String(html || "").match(re);
  return m ? m[1] : "";
}

/**
 * @param {string} baseUrl
 */
function createHostedClient(baseUrl) {
  const origin = String(baseUrl || "").replace(/\/$/, "");
  const jar = new CookieJar();

  async function request(method, path, opts) {
    const options = opts || {};
    const url = path.startsWith("http") ? path : `${origin}${path}`;
    const headers = {
      "User-Agent": "ActiveClinicHostedAuthQa/1.0",
      ...(options.headers || {}),
    };
    const cookie = jar.header();
    if (cookie) headers.Cookie = cookie;
    const init = {
      method,
      headers,
      redirect: "manual",
    };
    if (options.body != null) {
      init.body = options.body;
    }
    const res = await fetch(url, init);
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
          ? [res.headers.get("set-cookie")]
          : [];
    jar.absorb(setCookies);
    const location = res.headers.get("location") || "";
    let text = "";
    const contentType = res.headers.get("content-type") || "";
    if (/text|json|html/i.test(contentType) || res.status >= 400) {
      text = await res.text();
    } else {
      await res.arrayBuffer();
    }
    return {
      status: res.status,
      location,
      text,
      cookieNames: jar.names(),
      sessionPresent: jar.sessionPresent(),
    };
  }

  async function get(path) {
    return request("GET", path);
  }

  async function postForm(path, fields) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields || {})) {
      if (value == null) continue;
      body.set(key, String(value));
    }
    return request("POST", path, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  }

  async function follow(res) {
    if (res.status >= 300 && res.status < 400 && res.location) {
      const loc = res.location.startsWith("http")
        ? res.location.replace(origin, "")
        : res.location;
      return get(loc);
    }
    return res;
  }

  return { origin, jar, get, postForm, follow, extractCsrfField, extractMatch };
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  CSRF_FIELD,
  CookieJar,
  extractCsrfField,
  extractMatch,
  createHostedClient,
};
