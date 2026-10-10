#!/usr/bin/env node
"use strict";

/**
 * QA-only, side-effect-free Express route inventory.
 *
 * This creates the V8 application in memory and walks Express' mounted
 * router tree. It never listens, opens a database connection, or invokes a
 * route handler. Express does not retain the original mount string on a
 * router layer, so mountPrefix is reported as UNKNOWN when only the compiled
 * regexp is available.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = process.env.V208_ADMIN_INVENTORY_OUT || path.join(ROOT, "docs", "qa");

function instrumentExpress() {
  const express = require("express");
  const routerIds = new WeakMap();
  const routers = new Map();
  const mounts = [];
  const routes = [];
  let nextId = 0;
  const idFor = (router) => {
    if (!router || (typeof router !== "function" && typeof router !== "object")) return null;
    if (!routerIds.has(router)) {
      const id = `router-${++nextId}`;
      routerIds.set(router, id);
      routers.set(id, router);
    }
    return routerIds.get(router);
  };
  const appProto = express.application;
  let routerProto = express.Router ? Object.getPrototypeOf(express.Router()) : null;
  while (routerProto && typeof routerProto.get !== "function") {
    routerProto = Object.getPrototypeOf(routerProto);
  }
  const wrapUse = (proto) => {
    if (!proto || proto.__v208InventoryUse) return;
    const original = proto.use;
    if (typeof original !== "function") return;
    proto.use = function instrumentedUse(...args) {
      let mountPath = "/";
      let handlers = args;
      if (typeof args[0] === "string" || Array.isArray(args[0])) {
        mountPath = Array.isArray(args[0]) ? args[0].join(",") : args[0];
        handlers = args.slice(1);
      }
      const parentId = idFor(this);
      for (const handler of handlers.flat()) {
        if (handler && (routerIds.has(handler) || Array.isArray(handler.stack))) {
          mounts.push({
            parentRouterId: parentId,
            childRouterId: idFor(handler),
            mountPath: String(mountPath),
            registrationOrder: mounts.length,
          });
        }
      }
      return original.apply(this, args);
    };
    proto.__v208InventoryUse = true;
  };
  wrapUse(appProto);
  wrapUse(routerProto);
  const captureRouteMethod = (target, method, routePath, routerId) => {
    if (!target || typeof target[method] !== "function") return;
    const original = target[method];
    if (original.__v208InventoryRouteMethod) return;
    target[method] = function instrumentedRouteMethod(...handlers) {
      routes.push({
        routerId,
        method: method.toUpperCase(),
        localPath: routePath,
        handlerCount: handlers.length,
        middlewareCount: handlers.length,
        registrationOrder: routes.length,
        handlerNames: handlers.map((handler) => handler && handler.name ? handler.name : "anonymous"),
      });
      return original.apply(this, handlers);
    };
    target[method].__v208InventoryRouteMethod = true;
  };
  const originalRouterFactory = express.Router;
  express.Router = function instrumentedRouterFactory(...args) {
    const router = originalRouterFactory(...args);
    const routerId = idFor(router);
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options", "all"]) {
      const original = router[method];
      if (typeof original !== "function" || original.__v208InventoryInstanceMethod) continue;
      router[method] = function instrumentedInstanceRoute(pathValue, ...handlers) {
        routes.push({
          routerId,
          method: method.toUpperCase(),
          localPath: String(pathValue),
          handlerCount: handlers.length,
          middlewareCount: handlers.length,
          registrationOrder: routes.length,
          handlerNames: handlers.map((handler) => handler && handler.name ? handler.name : "anonymous"),
        });
        return original.call(this, pathValue, ...handlers);
      };
      router[method].__v208InventoryInstanceMethod = true;
    }
    const originalRoute = router.route;
    if (typeof originalRoute === "function" && !originalRoute.__v208InventoryInstanceMethod) {
      router.route = function instrumentedInstanceRoute(pathValue) {
        const route = originalRoute.call(this, pathValue);
        for (const method of ["get", "post", "put", "patch", "delete", "head", "options", "all"]) {
          captureRouteMethod(route, method, String(pathValue), routerId);
        }
        return route;
      };
      router.route.__v208InventoryInstanceMethod = true;
    }
    return router;
  };
  for (const target of [routerProto, appProto]) {
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options", "all", "route"]) {
      if (!target || typeof target[method] !== "function" || target[method][`__v208Inventory${method}`]) continue;
      const original = target[method];
      target[method] = function instrumentedRoute(...args) {
      const localPath = Array.isArray(args[0]) ? args[0].join(",") : String(args[0]);
      const routerId = idFor(this);
      if (method === "route") {
        const route = original.apply(this, args);
        for (const routeMethod of ["get", "post", "put", "patch", "delete", "head", "options", "all"]) {
          captureRouteMethod(route, routeMethod, localPath, routerId);
        }
        return route;
      }
      routes.push({
        routerId,
        method: method.toUpperCase(),
        localPath,
        handlerCount: Math.max(0, args.length - 1),
        middlewareCount: Math.max(0, args.length - 1),
        registrationOrder: routes.length,
        handlerNames: args.slice(1).map((handler) => handler && handler.name ? handler.name : "anonymous"),
      });
      return original.apply(this, args);
      };
      target[method][`__v208Inventory${method}`] = true;
    }
  }
  return { idFor, routers, mounts, routes };
}

function routeMethod(route) {
  return Object.keys(route.methods || {})
    .filter((method) => route.methods[method])
    .map((method) => method.toUpperCase());
}

function classify(method, routePath) {
  if (method === "GET") return routePath.includes(":id") ? "DETAIL" : "READ_SCREEN";
  const pathText = String(routePath).toLowerCase();
  if (pathText.includes("publish")) return "PUBLISH";
  if (pathText.includes("unpublish")) return "UNPUBLISH";
  if (pathText.includes("restore")) return "RESTORE";
  if (pathText.includes("archive")) return "ARCHIVE";
  if (pathText.includes("reset")) return "RESET";
  if (pathText.includes("retry")) return "RETRY";
  if (pathText.includes("upload")) return "UPLOAD";
  if (pathText.includes("download")) return "DOWNLOAD";
  return "OTHER";
}

function joinPath(prefix, localPath) {
  return `/${[prefix, localPath].join("/").split("/").filter(Boolean).join("/")}`;
}

function walk(stack, records, context = {}) {
  for (const layer of stack || []) {
    if (layer.route) {
      for (const method of routeMethod(layer.route)) {
        const routePath = String(layer.route.path);
        if (!context.adminFamily && !/^\/(admin|hq|branch-admin)(?:\/|$)/.test(routePath)) continue;
        records.push({
          routeId: `${method} ${routePath}`,
          method,
          path: routePath,
        mountPrefix: context.mountPrefix || "UNKNOWN",
          sourceRouter: context.sourceRouter || "UNKNOWN",
          handlerCount: Array.isArray(layer.route.stack) ? layer.route.stack.length : 0,
          middlewareCount: Array.isArray(layer.route.stack) ? layer.route.stack.length : 0,
          classification: classify(method, routePath),
          mutation: method !== "GET" && method !== "HEAD",
          mountStatus: "MOUNTED_ACTIVE",
        });
      }
      continue;
    }
    if (layer.name === "router" && layer.handle && Array.isArray(layer.handle.stack)) {
      walk(layer.handle.stack, records, {
        mountPrefix: context.mountPrefix || "UNKNOWN",
        sourceRouter: layer.handle.name || "router",
        adminFamily: context.adminFamily || false,
      });
    }
  }
}

function buildApp(instrumentation) {
  process.env.NODE_ENV = "test";
  process.env.PLATFORM_DEPLOYMENT_CODE = "moovex-platform-v8-testing";
  process.env.DEPLOYMENT_ENV = "testing";
  process.env.BASE_DOMAIN = "neuniversity.org";
  process.env.SESSION_SECRET = "v208-inventory-only-not-a-runtime-secret";
  const { createV5FoundationApp } = require("../../src/platform/http/v5FoundationServer");
  const app = createV5FoundationApp({
    env: process.env,
    getPool: () => null,
    allowPlatformRuntimeChild: true,
    enableDiagnosticHostContext: true,
    log: () => {},
    errorLog: () => {},
  });
  instrumentation.idFor(app);
  return app;
}

function main() {
  const instrumentation = instrumentExpress();
  const app = buildApp(instrumentation);
  const appId = instrumentation.idFor(app);
  const pathsFor = (routerId, seen = new Set()) => {
    if (seen.has(routerId)) return [];
    const nextSeen = new Set(seen).add(routerId);
    const parents = instrumentation.mounts.filter((mount) => mount.childRouterId === routerId);
    if (!parents.length) return routerId === appId ? ["/"] : [];
    return parents.flatMap((mount) =>
      pathsFor(mount.parentRouterId, nextSeen).map((prefix) => `${prefix === "/" ? "" : prefix}${mount.mountPath}`)
    );
  };
  const allMountedRecords = instrumentation.routes.flatMap((route) =>
      pathsFor(route.routerId).map((mountPrefix) => ({
      routeId: `${route.method} ${joinPath(mountPrefix, route.localPath)}`,
      method: route.method,
      path: joinPath(mountPrefix, route.localPath),
      localPath: route.localPath,
      mountPrefix,
      sourceRouter: route.routerId,
      handlerCount: route.handlerCount,
      middlewareCount: route.middlewareCount,
      classification: classify(route.method, route.localPath),
      mutation: route.method !== "GET" && route.method !== "HEAD",
      mountStatus: "MOUNTED_ACTIVE",
      sharedImplementationKey: `${route.routerId}:${route.method}:${route.localPath}`,
      product: joinPath(mountPrefix, route.localPath).startsWith("/admin") ? "platform" : "blessboard",
      surface: joinPath(mountPrefix, route.localPath).startsWith("/admin") ? "platform-admin" : joinPath(mountPrefix, route.localPath).startsWith("/hq") ? "hq-admin" : "branch-admin",
      handlerSource: "UNKNOWN",
      viewFile: "UNKNOWN",
      authMiddleware: "UNKNOWN",
      csrf: "UNKNOWN",
      tenantScope: joinPath(mountPrefix, route.localPath).startsWith("/admin") ? "platform" : "tenant",
      productScope: joinPath(mountPrefix, route.localPath).startsWith("/admin") ? "platform" : "blessboard",
      dbDependent: "UNKNOWN",
    }))
  );
  const records = allMountedRecords.filter((route) => /^\/(admin|hq|branch-admin)(?:\/|$)/.test(route.path));
  const knownRoutes = [
    ["GET", "/admin"], ["GET", "/admin/organizations"], ["GET", "/admin/domains"],
    ["GET", "/admin/system/deployments"], ["GET", "/admin/websites"], ["GET", "/admin/registrations"],
    ["GET", "/admin/forms"], ["GET", "/hq/forms"], ["GET", "/branch-admin/forms"],
    ["POST", "/admin/organizations/:organizationKey/website/publish"],
    ["POST", "/admin/organizations/:organizationKey/website/unpublish"],
    ["POST", "/admin/organizations/:organizationKey/website/versions/:versionId/restore"],
    ["POST", "/admin/organizations/:organizationKey/website/policy"],
    ["POST", "/admin/registrations/:product/:id/retry-provision"],
    ["POST", "/hq/forms"], ["POST", "/branch-admin/forms"],
  ];
  const routeKeys = new Set(records.map((record) => `${record.method} ${record.path}`));
  const knownRoutesMissing = knownRoutes
    .filter(([method, routePath]) => !routeKeys.has(`${method} ${routePath}`))
    .map(([method, routePath]) => `${method} ${routePath}`);
  const unique = new Map(records.map((record) => [`${record.method} ${record.path}`, record]));
  const output = {
    generatedAt: new Date().toISOString(),
    safety: {
      listened: false,
      databaseAccessed: false,
      handlersInvoked: false,
    },
    mountedRouteActions: [...unique.values()],
    counts: {
      appRouterId: appId,
      firstMount: instrumentation.mounts[0] || null,
      firstRoute: instrumentation.routes[0] || null,
      firstRouteMounted: instrumentation.mounts.some((mount) => mount.childRouterId === (instrumentation.routes[0] || {}).routerId),
      allMountedRecords: allMountedRecords.length,
      sampleMountedRoute: allMountedRecords[0] || null,
      instrumentedRouters: instrumentation.routers.size,
      capturedMounts: instrumentation.mounts.length,
      capturedRoutes: instrumentation.routes.length,
      mountedRouteActions: unique.size,
      getScreens: [...unique.values()].filter((r) => r.method === "GET").length,
      mutationActions: [...unique.values()].filter((r) => r.mutation).length,
    },
    knownRouteValidation: {
      checked: knownRoutes.length,
      missing: knownRoutesMissing,
      pass: knownRoutesMissing.length === 0,
    },
    excludedLegacyRuntimeRoutes: [
      { path: "/admin/dashboard", source: "src/routes/admin/adminDashboardContent.js", reason: "legacy admin router is not mounted by the active V8 platform runtime" },
      { path: "/admin/crm", source: "src/routes/admin/adminCrm.js", reason: "legacy admin router is not mounted by the active V8 platform runtime" },
      { path: "/admin/projects", source: "src/routes/admin/adminIntake.js", reason: "legacy admin router is not mounted by the active V8 platform runtime" },
      { path: "/admin/finance/cfo", source: "src/routes/admin/adminFinanceCfo.js", reason: "legacy admin router is not mounted by the active V8 platform runtime" },
      { path: "/admin/db", source: "src/routes/admin/adminDbTools.js", reason: "legacy admin router is not mounted by the active V8 platform runtime" },
    ],
    limitations: [
      "Express exposes compiled mount regexps, not original mount strings, on router layers.",
      "Handler source and middleware semantics require explicit route metadata or static source mapping.",
    ],
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "V208_ADMIN_ROUTE_ACTION_INVENTORY.json"), JSON.stringify(output, null, 2));
  fs.writeFileSync(
    path.join(OUT_DIR, "V208_ADMIN_ROUTE_ACTION_INVENTORY.md"),
    [
      "# V2.08 Admin Route Action Inventory",
      "",
      "Status: PRELIMINARY_ROUTE_INVENTORY",
      "",
      `Mounted route actions: ${output.counts.mountedRouteActions}`,
      `GET routes: ${output.counts.getScreens}`,
      `Mutation routes: ${output.counts.mutationActions}`,
      `Known-route validation: ${output.knownRouteValidation.pass ? "PASS" : "FAIL"}`,
      "",
      "## EXCLUDED_LEGACY_RUNTIME_ROUTES",
      "",
      ...output.excludedLegacyRuntimeRoutes.map((route) => `- ${route.path} — ${route.source} — ${route.reason}`),
      "",
      ...output.mountedRouteActions.map((route) => `- ${route.method} ${route.path} (${route.classification})`),
    ].join("\n")
  );
  console.log(JSON.stringify(output.counts, null, 2));
}

main();
