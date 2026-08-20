"use strict";

const {
  validateCsrf,
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { createRequireActiveClinicAuth } = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
  renderSimpleState,
} = require("./activeClinicPermissionMiddleware");
const { buildActiveClinicShellViewModel } = require("../services/buildActiveClinicShellViewModel");
const { renderActiveClinicAppPage } = require("./renderActiveClinicShell");
const { loadActiveClinicWebsiteSettingsScreen } = require("../services/loadActiveClinicSettingsScreens");
const cmsService = require("../website/clinicWebsiteCmsService");
const { PAGE_TEMPLATES, SECTION_TYPES, BLOCK_TYPES, boolValue } = require("../website/clinicWebsiteCms");
const { PERMISSIONS, hasWebsitePermission } = require("../../platform/website/permissions");
const contentService = require("../../platform/website/contentService");
const mediaService = require("../../platform/website/mediaService");
const instanceRepo = require("../../platform/website/instanceRepository");
const {
  PRODUCT_CODE,
  buildPublicWebsiteEditPath,
  buildPublicWebsiteHistoryPath,
} = require("../../platform/website/publicWebsiteUrl");

function clinicKeyFromAuth(auth) {
  return (
    (auth &&
      auth.organization &&
      (auth.organization.organizationKey || auth.organization.key)) ||
    ""
  );
}

function actorId(req) {
  return (
    (req.activeClinicAuth &&
      req.activeClinicAuth.platformIdentity &&
      req.activeClinicAuth.platformIdentity.id) ||
    null
  );
}

function cmsInput(req) {
  return {
    organizationId: req.activeClinicAuth.organization.id,
    clinicKey: clinicKeyFromAuth(req.activeClinicAuth),
    actorIdentityId: actorId(req),
    grantedPermissions: req.activeClinicAuth.permissions || [],
  };
}

function slugErrorMessage(code) {
  if (code === "reserved_slug") return "That URL is reserved for clinic pages. Choose another slug.";
  if (code === "duplicate_slug") return "That URL is already used by another page.";
  if (code === "invalid_slug") return "Use a lowercase slug with letters, numbers, or hyphens.";
  if (code === "locked_item") return "That item cannot be changed or deleted.";
  if (code === "forbidden") return "You do not have permission to edit the website.";
  if (code === "not_found") return "That item was not found.";
  return "Unable to save website changes.";
}

function registerActiveClinicWebsiteCmsRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction === true;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });

  function issuePageCsrf(res, req) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env, req });
    return token;
  }

  async function renderShell(req, res, options) {
    const csrfToken = issuePageCsrf(res, req);
    const shell = await buildActiveClinicShellViewModel(getPool(), {
      req,
      auth: req.activeClinicAuth,
      csrfToken,
      activeNav: "website",
      pageHeader: options.pageHeader,
      breadcrumbs: options.breadcrumbs,
      flash: options.flash || null,
    });
    const clinicKey = clinicKeyFromAuth(req.activeClinicAuth);
    const cmsNav = {
      active: options.cmsActive || "overview",
      editHref: buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: clinicKey,
      }),
      historyHref: buildPublicWebsiteHistoryPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: clinicKey,
      }),
    };
    shell.pageData = { ...(options.pageData || {}), cmsNav };
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  function deny(res, status, title, message) {
    return res.status(status).type("html").send(
      renderSimpleState(title, message, {
        state: status === 404 ? "not-found" : "access-denied",
        linkHref: "/app/settings/website",
        linkLabel: "Back to website",
      })
    );
  }

  const viewOrEdit = ["website.view", "website.edit"];

  function breadcrumbs(items) {
    return [{ label: "Home", href: "/app" }, { label: "Website", href: "/app/settings/website" }].concat(items || []);
  }

  app.get(
    "/app/settings/website/pages",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const listed = await cmsService.listPages(getPool(), cmsInput(req));
        if (!listed.ok) return deny(res, 403, "Website pages", slugErrorMessage(listed.code));
        return renderShell(req, res, {
          content: "app/website-cms-pages.ejs",
          cmsActive: "pages",
          pageHeader: { title: "Pages", description: "Create and organize clinic website pages." },
          breadcrumbs: breadcrumbs([{ label: "Pages" }]),
          pageData: {
            cms: {
              pages: listed.pages,
              canEdit: hasWebsitePermission(cmsInput(req).grantedPermissions, PERMISSIONS.EDIT),
              editHref: buildPublicWebsiteEditPath({
                product: PRODUCT_CODE.ACTIVECLINIC,
                organizationKey: cmsInput(req).clinicKey,
              }),
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/pages/new",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        return renderShell(req, res, {
          content: "app/website-cms-page-new.ejs",
          cmsActive: "pages",
          pageHeader: { title: "Add page", description: "Create a new clinic website page." },
          breadcrumbs: breadcrumbs([{ label: "Pages", href: "/app/settings/website/pages" }, { label: "Add" }]),
          pageData: { cms: { templates: PAGE_TEMPLATES, canEdit: true } },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/pages",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const created = await cmsService.createPage(getPool(), {
          ...cmsInput(req),
          title: req.body && req.body.title,
          slug: req.body && req.body.slug,
          templateKey: req.body && req.body.templateKey,
          inNav: Boolean(req.body && req.body.inNav),
        });
        if (!created.ok) {
          return renderShell(req, res, {
            status: 400,
            content: "app/website-cms-page-new.ejs",
            cmsActive: "pages",
            pageHeader: { title: "Add page", description: "Create a new clinic website page." },
            breadcrumbs: breadcrumbs([{ label: "Pages", href: "/app/settings/website/pages" }, { label: "Add" }]),
            pageData: {
              cms: {
                templates: PAGE_TEMPLATES,
                canEdit: true,
                error: slugErrorMessage(created.code),
                title: req.body && req.body.title,
                slug: req.body && req.body.slug,
              },
            },
          });
        }
        return res.redirect(303, `/app/settings/website/pages/${created.page.id}/builder`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/pages/reorder",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const ids = [].concat((req.body && req.body.pageIds) || []);
        await cmsService.reorderPages(getPool(), { ...cmsInput(req), pageIds: ids });
        return res.redirect(303, "/app/settings/website/pages");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/pages/:pageId/builder",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const loaded = await cmsService.listBlocks(getPool(), {
          ...cmsInput(req),
          pageId: req.params.pageId,
        });
        if (!loaded.ok || !loaded.page) return deny(res, 404, "Page not found", "That page was not found.");
        return renderShell(req, res, {
          content: "app/website-cms-builder.ejs",
          cmsActive: "pages",
          pageHeader: { title: loaded.page.title, description: "Page builder" },
          breadcrumbs: breadcrumbs([
            { label: "Pages", href: "/app/settings/website/pages" },
            { label: loaded.page.title },
          ]),
          pageData: {
            cms: {
              page: loaded.page,
              blocks: loaded.blocks,
              blockTypes: BLOCK_TYPES,
              canEdit: hasWebsitePermission(cmsInput(req).grantedPermissions, PERMISSIONS.EDIT),
              clinicKey: cmsInput(req).clinicKey,
              mediaListUrl: `/clinics/${cmsInput(req).clinicKey}/website/media`,
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/pages/:pageId",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const listed = await cmsService.listPages(getPool(), cmsInput(req));
        if (!listed.ok) return deny(res, 403, "Website pages", slugErrorMessage(listed.code));
        const page = listed.pages.find((item) => item.id === req.params.pageId);
        if (!page) return deny(res, 404, "Page not found", "That page was not found.");
        return renderShell(req, res, {
          content: "app/website-cms-page-settings.ejs",
          cmsActive: "pages",
          pageHeader: { title: "Page settings", description: page.title },
          breadcrumbs: breadcrumbs([
            { label: "Pages", href: "/app/settings/website/pages" },
            { label: "Settings" },
          ]),
          pageData: { cms: { page, canEdit: true } },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/pages/:pageId",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const updated = await cmsService.updatePage(getPool(), {
          ...cmsInput(req),
          pageId: req.params.pageId,
          title: req.body && req.body.title,
          navLabel: req.body && req.body.navLabel,
          slug: req.body && req.body.slug,
          status: req.body && req.body.status,
          inNav: Boolean(req.body && req.body.inNav),
          metaTitle: req.body && req.body.metaTitle,
          metaDescription: req.body && req.body.metaDescription,
        });
        if (!updated.ok) {
          return deny(res, 400, "Page settings", slugErrorMessage(updated.code));
        }
        return res.redirect(303, "/app/settings/website/pages");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/pages/:pageId/delete",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const deleted = await cmsService.deletePage(getPool(), {
          ...cmsInput(req),
          pageId: req.params.pageId,
        });
        if (!deleted.ok) return deny(res, 400, "Delete page", slugErrorMessage(deleted.code));
        return res.redirect(303, "/app/settings/website/pages");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/pages/:pageId/blocks",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const added = await cmsService.addBlock(getPool(), {
          ...cmsInput(req),
          pageId: req.params.pageId,
          type: req.body && req.body.type,
        });
        if (!added.ok) return deny(res, 400, "Add block", slugErrorMessage(added.code));
        return res.redirect(303, `/app/settings/website/pages/${req.params.pageId}/builder`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/pages/:pageId/blocks/reorder",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        await cmsService.reorderBlocks(getPool(), {
          ...cmsInput(req),
          pageId: req.params.pageId,
          blockIds: [].concat((req.body && req.body.blockIds) || []),
        });
        return res.redirect(303, `/app/settings/website/pages/${req.params.pageId}/builder`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/blocks/:blockId",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const image =
          req.body && (req.body.mediaId || req.body.imageSrc)
            ? {
                mediaId: req.body.mediaId || null,
                src: req.body.imageSrc || null,
                alt: req.body.imageAlt || "",
              }
            : null;
        const updated = await cmsService.updateBlock(getPool(), {
          ...cmsInput(req),
          blockId: req.params.blockId,
          type: req.body && req.body.type,
          heading: req.body && req.body.heading,
          body: req.body && req.body.body,
          buttonLabel: req.body && req.body.buttonLabel,
          buttonUrl: req.body && req.body.buttonUrl,
          image,
        });
        if (!updated.ok) return deny(res, 400, "Save block", slugErrorMessage(updated.code));
        const pageId = (req.body && req.body.pageId) || (updated.block && updated.block.page_id);
        return res.redirect(303, `/app/settings/website/pages/${pageId}/builder`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/blocks/:blockId/duplicate",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const duplicated = await cmsService.duplicateBlock(getPool(), {
          ...cmsInput(req),
          blockId: req.params.blockId,
        });
        if (!duplicated.ok) return deny(res, 400, "Duplicate block", slugErrorMessage(duplicated.code));
        return res.redirect(303, `/app/settings/website/pages/${duplicated.block.page_id}/builder`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/blocks/:blockId/delete",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const deleted = await cmsService.deleteBlock(getPool(), {
          ...cmsInput(req),
          blockId: req.params.blockId,
        });
        if (!deleted.ok) return deny(res, 400, "Delete block", slugErrorMessage(deleted.code));
        const referer = String(req.get("referer") || "/app/settings/website/pages");
        return res.redirect(303, referer.includes("/builder") ? referer : "/app/settings/website/pages");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/sections",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const listed = await cmsService.listSections(getPool(), { ...cmsInput(req), pageId: "tpl_home" });
        if (!listed.ok) return deny(res, 403, "Sections", slugErrorMessage(listed.code));
        return renderShell(req, res, {
          content: "app/website-cms-sections.ejs",
          cmsActive: "sections",
          pageHeader: { title: "Sections", description: "Manage homepage sections." },
          breadcrumbs: breadcrumbs([{ label: "Sections" }]),
          pageData: {
            cms: {
              sections: listed.sections,
              sectionTypes: SECTION_TYPES.filter((item) => item.addable),
              canEdit: hasWebsitePermission(cmsInput(req).grantedPermissions, PERMISSIONS.EDIT),
              previewHref: `/clinics/${cmsInput(req).clinicKey}?website_mode=draft`,
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/sections",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const added = await cmsService.addSection(getPool(), {
          ...cmsInput(req),
          pageId: (req.body && req.body.pageId) || "tpl_home",
          type: req.body && req.body.type,
        });
        if (!added.ok) return deny(res, 400, "Add section", slugErrorMessage(added.code));
        return res.redirect(303, "/app/settings/website/sections");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/sections/reorder",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        await cmsService.reorderSections(getPool(), {
          ...cmsInput(req),
          pageId: (req.body && req.body.pageId) || "tpl_home",
          sectionIds: [].concat((req.body && req.body.sectionIds) || []),
        });
        return res.redirect(303, "/app/settings/website/sections");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/sections/:sectionId",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const listed = await cmsService.listSections(getPool(), { ...cmsInput(req), pageId: "tpl_home" });
        const section = (listed.sections || []).find((item) => item.id === req.params.sectionId);
        if (!section) return deny(res, 404, "Section not found", "That section was not found.");
        return renderShell(req, res, {
          content: "app/website-cms-section-settings.ejs",
          cmsActive: "sections",
          pageHeader: { title: "Section settings", description: section.title || section.type },
          breadcrumbs: breadcrumbs([
            { label: "Sections", href: "/app/settings/website/sections" },
            { label: "Settings" },
          ]),
          pageData: { cms: { section } },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/sections/:sectionId",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const updated = await cmsService.updateSection(getPool(), {
          ...cmsInput(req),
          sectionId: req.params.sectionId,
          title: req.body && req.body.title,
          heading: req.body && req.body.heading,
          body: req.body && req.body.body,
          buttonLabel: req.body && req.body.buttonLabel,
          buttonUrl: req.body && req.body.buttonUrl,
          visible: boolValue(req.body && req.body.visible, false),
        });
        if (!updated.ok) return deny(res, 400, "Section settings", slugErrorMessage(updated.code));
        return res.redirect(303, "/app/settings/website/sections");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/sections/:sectionId/visibility",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        await cmsService.updateSection(getPool(), {
          ...cmsInput(req),
          sectionId: req.params.sectionId,
          visible: boolValue(req.body && req.body.visible, false),
        });
        return res.redirect(303, "/app/settings/website/sections");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/sections/:sectionId/delete",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const deleted = await cmsService.deleteSection(getPool(), {
          ...cmsInput(req),
          sectionId: req.params.sectionId,
        });
        if (!deleted.ok) return deny(res, 400, "Delete section", slugErrorMessage(deleted.code));
        return res.redirect(303, "/app/settings/website/sections");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/navigation",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const listed = await cmsService.listPages(getPool(), cmsInput(req));
        if (!listed.ok) return deny(res, 403, "Navigation", slugErrorMessage(listed.code));
        return renderShell(req, res, {
          content: "app/website-cms-navigation.ejs",
          cmsActive: "navigation",
          pageHeader: { title: "Navigation", description: "Choose header pages and order." },
          breadcrumbs: breadcrumbs([{ label: "Navigation" }]),
          pageData: { cms: { navPages: listed.pages.filter((page) => page.slug !== "home") } },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/navigation",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const ids = [].concat((req.body && req.body.pageIds) || []);
        await cmsService.reorderPages(getPool(), { ...cmsInput(req), pageIds: ids });
        for (const pageId of ids) {
          await cmsService.updatePage(getPool(), {
            ...cmsInput(req),
            pageId,
            inNav: Boolean(req.body && req.body[`inNav_${pageId}`]),
          });
        }
        return res.redirect(303, "/app/settings/website/navigation");
      } catch (err) {
        return next(err);
      }
    }
  );

  async function renderMediaPage(req, res, selectedId) {
    const input = cmsInput(req);
    const seeded = await cmsService.ensureCmsSeeded(getPool(), input);
    if (!seeded.ok) return deny(res, 403, "Media", slugErrorMessage(seeded.code));
    const listed = await mediaService.listWebsiteMedia(getPool(), {
      organizationId: input.organizationId,
      instanceId: seeded.instance.id,
    });
    const media = (listed.media || []).map((item) => ({
      ...item,
      publicSrc: `/clinics/${input.clinicKey}/website/media/${item.id}`,
    }));
    const selected = selectedId ? media.find((item) => item.id === selectedId) || null : null;
    const selectMode = String(req.query.select || "") === "1";
    return renderShell(req, res, {
      content: "app/website-cms-media.ejs",
      cmsActive: "media",
      pageHeader: {
        title: selectMode ? "Select media" : "Media library",
        description: "Upload and reuse clinic-owned images.",
      },
      breadcrumbs: breadcrumbs([{ label: "Media" }]),
      pageData: {
        cms: {
          media,
          selected,
          selectMode,
          canUpload: hasWebsitePermission(input.grantedPermissions, PERMISSIONS.MEDIA_UPLOAD),
          uploadAction: `/clinics/${input.clinicKey}/website/media`,
        },
      },
    });
  }

  app.get(
    "/app/settings/website/media",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        return await renderMediaPage(req, res, null);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/media/:mediaId",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        return await renderMediaPage(req, res, req.params.mediaId);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/media/:mediaId",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const input = cmsInput(req);
        const updated = await mediaService.updateWebsiteMediaMeta(getPool(), {
          mediaId: req.params.mediaId,
          organizationId: input.organizationId,
          altText: req.body && req.body.altText,
          actorIdentityId: input.actorIdentityId,
        });
        if (!updated.ok) return deny(res, 400, "Media details", "Unable to save media details.");
        return res.redirect(303, `/app/settings/website/media/${req.params.mediaId}`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/publish",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicWebsiteSettingsScreen(getPool(), {
          auth: req.activeClinicAuth,
          env,
          origin: `${req.protocol}://${req.get("host")}`,
        });
        if (!loaded.ok) return deny(res, 403, "Publishing", "You cannot view website publishing.");
        const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(getPool(), {
          organizationId: req.activeClinicAuth.organization.id,
          productCode: PRODUCT_CODE.ACTIVECLINIC,
        });
        const changes = instance
          ? await contentService.listUnpublishedChanges(
              getPool(),
              instance,
              req.activeClinicAuth.organization.id
            )
          : [];
        return renderShell(req, res, {
          content: "app/website-cms-publish.ejs",
          cmsActive: "publish",
          pageHeader: { title: "Publishing", description: "Draft status, preview, and publish." },
          breadcrumbs: breadcrumbs([{ label: "Publishing" }]),
          pageData: { website: loaded.website, changes },
        });
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicWebsiteCmsRoutes,
};
