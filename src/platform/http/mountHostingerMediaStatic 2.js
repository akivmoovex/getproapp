"use strict";

/**
 * Serve Hostinger media files under MEDIA_PUBLIC_MOUNT_PATH (default /media).
 * Immutable cache headers — keys are unique per upload.
 */

const express = require("express");
const { resolveHostingerMediaConfig } = require("../media/hostingerMediaConfig");

/**
 * @param {import('express').Application} app
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean} whether the mount was registered
 */
function mountHostingerMediaStatic(app, env) {
  const cfg = resolveHostingerMediaConfig(env || process.env);
  if (!cfg.enabled || !cfg.storageRoot) return false;

  const mountPath = cfg.publicMountPath || "/media";
  app.use(
    mountPath,
    express.static(cfg.storageRoot, {
      fallthrough: true,
      index: false,
      redirect: false,
      maxAge: "365d",
      immutable: true,
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    })
  );
  return true;
}

module.exports = {
  mountHostingerMediaStatic,
};
