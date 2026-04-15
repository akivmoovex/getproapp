"use strict";

// In-memory timing + counters for /admin/field-agent-analytics only. Logs must stay PII-safe; see docs/field-agent-analytics-runbook.md §9.
const SLOW_QUERY_MS = Math.max(Number(process.env.FA_ANALYTICS_SLOW_QUERY_MS || 200), 1);
const SLOW_ENDPOINT_MS = Math.max(Number(process.env.FA_ANALYTICS_SLOW_ENDPOINT_MS || 500), 1);
const LOG_PREFIX = "[FA_ANALYTICS]";

const counters = {
  endpointRequests: Object.create(null),
  slowQueries: 0,
  slowEndpoints: 0,
  queryErrors: 0,
  endpointErrors: 0,
};

function nowMs() {
  return Date.now();
}

function safeLog(level, payload) {
  const t = payload && payload.type ? String(payload.type) : "";
  if (t === "query_error") counters.queryErrors += 1;
  if (t === "endpoint_error") counters.endpointErrors += 1;
  const fn = level === "error" ? console.error : level === "info" ? console.info : console.warn;
  fn(`${LOG_PREFIX} ${JSON.stringify(payload)}`);
}

function summarizeFilters(filters) {
  const f = filters || {};
  return {
    bucket: f.bucket || null,
    record_type: f.record_type || null,
    has_search: Boolean(f.q),
    has_status: Boolean(f.status),
    has_from: Boolean(f.from),
    has_to: Boolean(f.to),
    has_agent: Boolean(f.agent || f.fieldAgentId),
    page_size: f.page_size != null ? Number(f.page_size) : null,
    page: f.page != null ? Number(f.page) : null,
  };
}

function queryContext(req, endpoint, filters) {
  return {
    endpoint,
    tenant_id: req && req.session && req.session.adminUser ? Number(req.session.adminUser.tenantId) || null : null,
    filters: summarizeFilters(filters),
  };
}

async function observeQuery(meta, fn) {
  const start = nowMs();
  let result;
  try {
    result = await fn();
  } catch (err) {
    safeLog("error", {
      type: "query_error",
      query: meta && meta.query ? meta.query : "unknown",
      endpoint: meta && meta.obs ? meta.obs.endpoint : null,
      tenant_id: meta && meta.obs ? meta.obs.tenant_id : null,
      duration_ms: nowMs() - start,
      error_name: err && err.name ? err.name : "Error",
      error_message: err && err.message ? String(err.message).slice(0, 200) : "Query failed",
    });
    throw err;
  }
  const duration = nowMs() - start;
  if (duration > SLOW_QUERY_MS) {
    counters.slowQueries += 1;
    safeLog("warn", {
      type: "slow_query",
      query: meta && meta.query ? meta.query : "unknown",
      duration_ms: duration,
      tenant_id: meta && meta.obs ? meta.obs.tenant_id : null,
      endpoint: meta && meta.obs ? meta.obs.endpoint : null,
      row_count:
        result && Array.isArray(result.rows)
          ? result.rows.length
          : result && Number.isFinite(result.rowCount)
            ? Number(result.rowCount)
            : null,
      filters: meta && meta.obs ? meta.obs.filters : null,
    });
  }
  return result;
}

function endpointMiddleware() {
  return function fieldAgentAnalyticsEndpointObserver(req, res, next) {
    const start = nowMs();
    const endpointKey = `${req.method} ${req.baseUrl || ""}${req.path || ""}`;
    counters.endpointRequests[endpointKey] = (counters.endpointRequests[endpointKey] || 0) + 1;
    res.on("finish", function onFinish() {
      const duration = nowMs() - start;
      if (duration > SLOW_ENDPOINT_MS) {
        counters.slowEndpoints += 1;
        safeLog("warn", {
          type: "slow_endpoint",
          endpoint: endpointKey,
          duration_ms: duration,
          tenant_id: req && req.session && req.session.adminUser ? Number(req.session.adminUser.tenantId) || null : null,
          status: res.statusCode,
          request_count: counters.endpointRequests[endpointKey],
        });
      }
    });
    return next();
  };
}

function errorMiddleware() {
  return function fieldAgentAnalyticsErrorObserver(err, req, res, next) {
    safeLog("error", {
      type: "endpoint_error",
      endpoint: `${req.method} ${req.baseUrl || ""}${req.path || ""}`,
      tenant_id: req && req.session && req.session.adminUser ? Number(req.session.adminUser.tenantId) || null : null,
      status: res && res.statusCode ? res.statusCode : 500,
      error_name: err && err.name ? err.name : "Error",
      error_message: err && err.message ? String(err.message).slice(0, 200) : "Unhandled error",
    });
    return next(err);
  };
}

function getConfig() {
  return {
    slow_query_ms: SLOW_QUERY_MS,
    slow_endpoint_ms: SLOW_ENDPOINT_MS,
  };
}

function getCounters() {
  return {
    endpointRequests: { ...counters.endpointRequests },
    slowQueries: counters.slowQueries,
    slowEndpoints: counters.slowEndpoints,
    queryErrors: counters.queryErrors,
    endpointErrors: counters.endpointErrors,
  };
}

module.exports = {
  queryContext,
  observeQuery,
  endpointMiddleware,
  errorMiddleware,
  summarizeFilters,
  getConfig,
  getCounters,
};
