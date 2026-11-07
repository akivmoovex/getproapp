"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.PORT || 4185);
const host = process.env.HOST || "127.0.0.1";
const reportPath = process.env.BB_LIFECYCLE_REPORT || path.join(process.cwd(), "bb-lifecycle.log");
const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});
const tlsProxy = process.env.BB_TLS_CERT_DIR
  ? spawn(process.execPath, ["scripts/ci/local-tls-proxy.cjs"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
  : null;
const startedAt = Date.now();
let exitInfo = null;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

function sanitize(value) {
  return String(value)
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/(password|secret|token|cookie|authorization)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
}

function event(name, details = {}) {
  fs.appendFileSync(reportPath, `${new Date().toISOString()} ${name} ${JSON.stringify(details)}\n`);
}

function probe(pathname, label, headers = {}) {
  const request = http.get({ host, port, path: pathname, headers, timeout: 1500 }, (response) => {
    event(label, {
      status: response.statusCode,
      location: response.headers.location || "UNSET",
      hostRequested: headers.host || "UNSET",
      forwardedHost: headers["x-forwarded-host"] || "UNSET",
      forwardedProto: headers["x-forwarded-proto"] || "UNSET",
    });
    response.resume();
  });
  request.on("error", (error) => event(label, { error: error.code || error.message }));
  request.on("timeout", () => request.destroy(new Error("timeout")));
}

if (!fs.existsSync(reportPath)) fs.writeFileSync(reportPath, "");
event("T4_PROCESS_LAUNCH", { pid: child.pid, command: "node server.js", host, port });
child.stdout.on("data", (chunk) => {
  const text = sanitize(chunk.toString()).slice(0, 4000);
  fs.appendFileSync(reportPath, `${new Date().toISOString()} SERVER_STDOUT ${JSON.stringify(text)}\n`);
});
child.stderr.on("data", (chunk) => {
  const text = sanitize(chunk.toString()).slice(0, 4000);
  fs.appendFileSync(reportPath, `${new Date().toISOString()} SERVER_STDERR ${JSON.stringify(text)}\n`);
});
child.on("exit", (code, signal) => {
  exitInfo = { code, signal, aliveMs: Date.now() - startedAt };
  event("SERVER_EXIT", exitInfo);
});
if (tlsProxy) {
  tlsProxy.stdout.on("data", (chunk) => event("TLS_PROXY_STDOUT", sanitize(chunk.toString()).slice(0, 2000)));
  tlsProxy.stderr.on("data", (chunk) => event("TLS_PROXY_STDERR", sanitize(chunk.toString()).slice(0, 2000)));
  tlsProxy.on("exit", (code, signal) => event("TLS_PROXY_EXIT", { code, signal }));
}

const interval = setInterval(() => {
  event("PROCESS_STATE", { pid: child.pid, alive: exitInfo === null });
  probe("/healthz", "HEALTH_PROBE");
  probe("/admin/login", "ADMIN_DIRECT_PROBE");
  probe("/admin/login", "ADMIN_HOST_PROBE", {
    Host: process.env.E2E_PLATFORM_HOST || "admin.local.test",
    "X-Forwarded-Host": process.env.E2E_PLATFORM_HOST || "admin.local.test",
    "X-Forwarded-Proto": "http",
  });
}, 1000);

function shutdown(signal) {
  event("WRAPPER_SIGNAL", { signal, childAlive: exitInfo === null });
  clearInterval(interval);
  if (tlsProxy) tlsProxy.kill(signal);
  if (exitInfo === null) child.kill(signal);
  setTimeout(() => process.exit(exitInfo ? (exitInfo.code || 0) : 1), 2000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("exit", () => {
  if (exitInfo) event("WRAPPER_EXIT", exitInfo);
});
