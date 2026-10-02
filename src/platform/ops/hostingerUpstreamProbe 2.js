"use strict";

/**
 * Classify Hostinger / hCDN responses for V8 hosted diagnostics.
 * Distinguishes edge-layer 503 (no Node upstream) from application JSON errors.
 *
 * Evidence pattern for V8-BUG-002 (neuniversity.org):
 * - HTTP 503
 * - text/html body with Hostinger stock "503 Service Unavailable"
 * - headers: platform=hostinger, server=hcdn
 * - missing application markers: x-request-id, x-hcdn-upstream-rt, application/json
 */

/**
 * @typedef {{
 *   status?: number|null,
 *   headers?: Record<string, string|string[]|undefined>|null,
 *   body?: string|null,
 * }} HostingerProbeInput
 */

/**
 * @typedef {{
 *   layer: "hostinger_edge_no_upstream" | "application" | "unknown",
 *   code: string,
 *   message: string,
 *   evidence: string[],
 * }} HostingerProbeClassification
 */

/**
 * @param {HostingerProbeInput} input
 * @returns {Record<string, string>}
 */
function normalizeHeaders(input) {
  const raw = input && input.headers ? input.headers : {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    const joined = Array.isArray(value) ? value.join(", ") : String(value);
    out[String(key).toLowerCase()] = joined;
  }
  return out;
}

/**
 * @param {HostingerProbeInput} input
 * @returns {HostingerProbeClassification}
 */
function classifyHostingerHttpResponse(input) {
  const status = Number(input && input.status) || 0;
  const headers = normalizeHeaders(input || {});
  const body = String((input && input.body) || "");
  const evidence = [];

  const platform = headers.platform || "";
  const server = headers.server || "";
  const contentType = headers["content-type"] || "";
  const upstreamRt = headers["x-hcdn-upstream-rt"];
  const requestId = headers["x-request-id"];
  const panel = headers.panel || "";

  if (platform === "hostinger") evidence.push("header:platform=hostinger");
  if (server === "hcdn") evidence.push("header:server=hcdn");
  if (panel === "hpanel") evidence.push("header:panel=hpanel");
  if (upstreamRt != null && String(upstreamRt).trim() !== "") {
    evidence.push(`header:x-hcdn-upstream-rt=${upstreamRt}`);
  }
  if (requestId) evidence.push("header:x-request-id=present");

  const looksLikeHostingerStock503Html =
    status === 503 &&
    /text\/html/i.test(contentType || "text/html") &&
    /503\s*Service Unavailable/i.test(body) &&
    (/The server is temporarily busy/i.test(body) ||
      /try again later/i.test(body));

  const reachedNodeUpstream =
    Boolean(upstreamRt && String(upstreamRt).trim() !== "") ||
    Boolean(requestId) ||
    /application\/json/i.test(contentType);

  if (looksLikeHostingerStock503Html && !reachedNodeUpstream) {
    evidence.push("body:hostinger-stock-503-html");
    evidence.push("missing:application-upstream-markers");
    return {
      layer: "hostinger_edge_no_upstream",
      code: "HOSTINGER_EDGE_NO_UPSTREAM",
      message:
        "Hostinger hCDN returned stock HTTP 503 HTML without Node upstream markers. " +
        "The domain/SSL may exist, but the V8 Node.js application is not running or not bound.",
      evidence,
    };
  }

  if (reachedNodeUpstream || /application\/json/i.test(contentType)) {
    evidence.push("reached:application-or-json");
    return {
      layer: "application",
      code: status >= 500 ? "APPLICATION_HTTP_ERROR" : "APPLICATION_HTTP_OK",
      message:
        status >= 500
          ? `Application (or upstream) responded with HTTP ${status}.`
          : `Application responded with HTTP ${status}.`,
      evidence,
    };
  }

  return {
    layer: "unknown",
    code: "HOSTINGER_RESPONSE_UNCLASSIFIED",
    message: `Unclassified HTTP ${status} response.`,
    evidence,
  };
}

/**
 * True when both V8 hosts show Hostinger-edge 503 (shared deployment missing).
 * @param {HostingerProbeClassification} a
 * @param {HostingerProbeClassification} b
 */
function isSharedV8DeploymentUnavailable(a, b) {
  return (
    a &&
    b &&
    a.layer === "hostinger_edge_no_upstream" &&
    b.layer === "hostinger_edge_no_upstream"
  );
}

module.exports = {
  classifyHostingerHttpResponse,
  isSharedV8DeploymentUnavailable,
  normalizeHeaders,
};
