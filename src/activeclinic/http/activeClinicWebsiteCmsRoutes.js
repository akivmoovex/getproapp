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
const libraryService = require("../website/clinicWebsiteLibraryService");
const catalogueService = require("../website/clinicWebsiteCatalogueService");
const { PAGE_TEMPLATES, SECTION_TYPES, BLOCK_TYPES, boolValue, isAddableBlockType } = require("../website/clinicWebsiteCms");
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
    healthcareOrganizationId:
      (req.activeClinicAuth.healthcareOrganization && req.activeClinicAuth.healthcareOrganization.id) ||
      null,
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
  if (code === "invalid_hex") return "Use a 6-digit colour like #0d9488.";
  if (code === "already_exists") return "That content is already in the library or already used on that page.";
  if (code === "record_not_found") return "That clinic record was not found. Choose an existing doctor, service, or location.";
  if (code === "inactive") return "Inactive staff and services cannot appear on the website.";
  if (code === "needs_profile") return "This doctor needs a name in clinic records before they can appear on the website.";
  if (code === "validation_failed") return "Check those details and try again. Use a full website address starting with https://.";
  return "Unable to save website changes.";
}

function textOrNull(body, name) {
  const text = String((body && body[name]) || "").trim();
  return text || null;
}

function clinicProfileName(req) {
  const auth = req.activeClinicAuth || {};
  const hco = auth.healthcareOrganization || {};
  return hco.publicName || (auth.organization && (auth.organization.name || auth.organization.publicName)) || "";
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
              blockTypes: BLOCK_TYPES.filter((type) => type.key !== "library"),
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
        if (!isAddableBlockType(req.body && req.body.type)) {
          return deny(res, 400, "Add block", "Choose a heading, text, button, or image block.");
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

  async function websiteSummaryFor(req) {
    const loaded = await loadActiveClinicWebsiteSettingsScreen(getPool(), {
      auth: req.activeClinicAuth,
      env,
      origin: `${req.protocol}://${req.get("host")}`,
    });
    return loaded.ok ? loaded.website : {};
  }

  async function renderSettingsPage(req, res, options) {
    const keys = options.keys || [];
    const loaded = await cmsService.loadSiteSettings(getPool(), cmsInput(req), keys);
    if (!loaded.ok) return deny(res, 403, options.title, slugErrorMessage(loaded.code));
    const website = options.includeWebsite ? await websiteSummaryFor(req) : null;
    return renderShell(req, res, {
      content: options.content,
      cmsActive: options.cmsActive,
      pageHeader: { title: options.title, description: options.description },
      breadcrumbs: breadcrumbs([{ label: options.title }]),
      pageData: {
        cms: {
          values: loaded.values,
          website: website || {},
          clinicName: clinicProfileName(req),
          canEdit: hasWebsitePermission(cmsInput(req).grantedPermissions, PERMISSIONS.EDIT),
          mediaListUrl: `/clinics/${cmsInput(req).clinicKey}/website/media`,
          error: options.error || "",
          saved: options.saved === true,
        },
      },
    });
  }

  app.get(
    "/app/settings/website/settings",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        return await renderSettingsPage(req, res, {
          keys: cmsService.SETTINGS_KEYS.website,
          content: "app/website-cms-settings.ejs",
          cmsActive: "settings",
          title: "Website Settings",
          description: "Name, contact, hours, and website status.",
          includeWebsite: true,
          saved: String(req.query.saved || "") === "1",
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/settings",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const saved = await cmsService.saveSiteSettings(getPool(), cmsInput(req), [
          { key: "site.name", value: textOrNull(req.body, "siteName") },
          { key: "contact.phone", value: textOrNull(req.body, "phone") },
          { key: "contact.email", value: textOrNull(req.body, "email") },
          { key: "location.hours", value: textOrNull(req.body, "hours") },
        ]);
        if (!saved.ok) {
          return await renderSettingsPage(req, res, {
            keys: cmsService.SETTINGS_KEYS.website,
            content: "app/website-cms-settings.ejs",
            cmsActive: "settings",
            title: "Website Settings",
            description: "Name, contact, hours, and website status.",
            includeWebsite: true,
            error: slugErrorMessage(saved.code),
          });
        }
        return res.redirect(303, "/app/settings/website/settings?saved=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/branding",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        return await renderSettingsPage(req, res, {
          keys: cmsService.SETTINGS_KEYS.branding,
          content: "app/website-cms-branding.ejs",
          cmsActive: "branding",
          title: "Branding Settings",
          description: "Logo, colours, and cover image.",
          saved: String(req.query.saved || "") === "1",
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/branding",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const primary = cmsService.normalizeHexColor(req.body && req.body.primaryColor);
        const accent = cmsService.normalizeHexColor(req.body && req.body.accentColor);
        if (!primary.ok || !accent.ok) {
          return await renderSettingsPage(req, res, {
            keys: cmsService.SETTINGS_KEYS.branding,
            content: "app/website-cms-branding.ejs",
            cmsActive: "branding",
            title: "Branding Settings",
            description: "Logo, colours, and cover image.",
            error: slugErrorMessage("invalid_hex"),
          });
        }
        const saved = await cmsService.saveSiteSettings(getPool(), cmsInput(req), [
          {
            key: "home.logo",
            value: cmsService.imageValueFromParts(
              req.body && req.body.logoSrc,
              req.body && req.body.logoAlt,
              req.body && req.body.logoMediaId
            ),
          },
          { key: "brand.primary_color", value: primary.value },
          { key: "brand.accent_color", value: accent.value },
          {
            key: "home.hero.image",
            value: cmsService.imageValueFromParts(
              req.body && req.body.heroSrc,
              req.body && req.body.heroAlt,
              req.body && req.body.heroMediaId
            ),
          },
        ]);
        if (!saved.ok) {
          return await renderSettingsPage(req, res, {
            keys: cmsService.SETTINGS_KEYS.branding,
            content: "app/website-cms-branding.ejs",
            cmsActive: "branding",
            title: "Branding Settings",
            description: "Logo, colours, and cover image.",
            error: slugErrorMessage(saved.code),
          });
        }
        return res.redirect(303, "/app/settings/website/branding?saved=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/chrome",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        return await renderSettingsPage(req, res, {
          keys: cmsService.SETTINGS_KEYS.chrome.concat(["home.logo"]),
          content: "app/website-cms-chrome.ejs",
          cmsActive: "chrome",
          title: "Header & Footer Settings",
          description: "Logo, navigation, contact, social links, and footer text.",
          saved: String(req.query.saved || "") === "1",
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/chrome",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const saved = await cmsService.saveSiteSettings(getPool(), cmsInput(req), [
          { key: "header.show_logo", value: boolValue(req.body && req.body.showLogo, false) },
          { key: "header.show_nav", value: boolValue(req.body && req.body.showNav, false) },
          { key: "header.show_phone", value: boolValue(req.body && req.body.showPhone, false) },
          { key: "footer.show_contact", value: boolValue(req.body && req.body.showContact, false) },
          { key: "footer.tagline", value: textOrNull(req.body, "tagline") },
          { key: "footer.legal", value: textOrNull(req.body, "legal") },
          { key: "social.facebook_url", value: textOrNull(req.body, "facebookUrl") },
          { key: "social.instagram_url", value: textOrNull(req.body, "instagramUrl") },
          { key: "social.whatsapp_url", value: textOrNull(req.body, "whatsappUrl") },
          { key: "social.x_url", value: textOrNull(req.body, "xUrl") },
        ]);
        if (!saved.ok) {
          return await renderSettingsPage(req, res, {
            keys: cmsService.SETTINGS_KEYS.chrome.concat(["home.logo"]),
            content: "app/website-cms-chrome.ejs",
            cmsActive: "chrome",
            title: "Header & Footer Settings",
            description: "Logo, navigation, contact, social links, and footer text.",
            error: slugErrorMessage(saved.code),
          });
        }
        return res.redirect(303, "/app/settings/website/chrome?saved=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/seo",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        return await renderSettingsPage(req, res, {
          keys: cmsService.SETTINGS_KEYS.seo,
          content: "app/website-cms-seo.ejs",
          cmsActive: "seo",
          title: "SEO & Social Settings",
          description: "Page title, description, and sharing image.",
          includeWebsite: true,
          saved: String(req.query.saved || "") === "1",
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/seo",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const saved = await cmsService.saveSiteSettings(getPool(), cmsInput(req), [
          { key: "seo.title", value: textOrNull(req.body, "seoTitle") },
          { key: "seo.description", value: textOrNull(req.body, "seoDescription") },
          {
            key: "seo.image",
            value: cmsService.imageValueFromParts(
              req.body && req.body.seoSrc,
              req.body && req.body.seoAlt,
              req.body && req.body.seoMediaId
            ),
          },
        ]);
        if (!saved.ok) {
          return await renderSettingsPage(req, res, {
            keys: cmsService.SETTINGS_KEYS.seo,
            content: "app/website-cms-seo.ejs",
            cmsActive: "seo",
            title: "SEO & Social Settings",
            description: "Page title, description, and sharing image.",
            includeWebsite: true,
            error: slugErrorMessage(saved.code),
          });
        }
        return res.redirect(303, "/app/settings/website/seo?saved=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  function libraryFormFields(body) {
    return {
      type: body && body.type,
      websiteOnly: body && body.websiteOnly,
      serviceKey: body && body.serviceKey,
      doctorKey: body && body.doctorKey,
      facilityKey: body && body.facilityKey,
      operationalKey: body && body.operationalKey,
      title: body && body.title,
      question: body && body.question,
      summary: body && body.summary,
      body: body && body.body,
      answer: body && body.answer,
      quote: body && body.quote,
      attribution: body && body.attribution,
      visible: body && body.visible,
      featured: body && body.featured,
      imageSrc: body && body.imageSrc,
      imageAlt: body && body.imageAlt,
      imageMediaId: body && body.imageMediaId,
    };
  }

  app.get(
    "/app/settings/website/catalogue",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const loaded = await catalogueService.loadCatalogue(getPool(), cmsInput(req));
        if (!loaded.ok) return deny(res, 403, "Public catalogue", slugErrorMessage(loaded.code));
        const tab = String(req.query.tab || "doctors").trim() === "services" ? "services" : "doctors";
        return renderShell(req, res, {
          content: "app/website-cms-catalogue.ejs",
          cmsActive: "catalogue",
          pageHeader: {
            title: "Public catalogue",
            description: "Choose which doctors and services appear on your clinic website.",
          },
          breadcrumbs: breadcrumbs([{ label: "Public catalogue" }]),
          pageData: {
            cms: {
              tab,
              doctors: loaded.doctors,
              services: loaded.services,
              canEdit: loaded.canEdit,
              emptyDoctors: loaded.emptyDoctors,
              emptyServices: loaded.emptyServices,
              saved: String(req.query.saved || "") === "1",
              error: String(req.query.error || "") === "1" ? slugErrorMessage(req.query.code) : "",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  async function handleCatalogueAction(req, res, next, kind) {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return deny(res, 403, "Invalid request", "Reload the page and try again.");
      }
      const action = String((req.body && req.body.action) || "").trim();
      const tab = kind === "service" ? "services" : "doctors";
      const input = cmsInput(req);
      let result;
      if (kind === "doctor") {
        if (action === "feature" || action === "unfeature") {
          result = await catalogueService.setCatalogueFeatured(getPool(), {
            ...input,
            kind: "doctor",
            staffId: req.params.staffId,
            featured: action === "feature",
          });
        } else {
          result = await catalogueService.setDoctorWebsiteVisibility(getPool(), {
            ...input,
            staffId: req.params.staffId,
            visible: action !== "hide",
          });
        }
      } else if (action === "feature" || action === "unfeature") {
        result = await catalogueService.setCatalogueFeatured(getPool(), {
          ...input,
          kind: "service",
          serviceId: req.params.serviceId,
          featured: action === "feature",
        });
      } else {
        result = await catalogueService.setServiceWebsiteVisibility(getPool(), {
          ...input,
          serviceId: req.params.serviceId,
          visible: action !== "hide",
        });
      }
      if (!result.ok) {
        const status = result.code === "forbidden" ? 403 : result.code === "not_found" ? 404 : 303;
        if (status === 303) {
          return res.redirect(
            303,
            `/app/settings/website/catalogue?tab=${tab}&error=1&code=${encodeURIComponent(result.code || "")}`
          );
        }
        return deny(res, status, "Public catalogue", slugErrorMessage(result.code));
      }
      return res.redirect(303, `/app/settings/website/catalogue?tab=${tab}&saved=1`);
    } catch (err) {
      return next(err);
    }
  }

  app.post(
    "/app/settings/website/catalogue/doctors/:staffId",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    (req, res, next) => handleCatalogueAction(req, res, next, "doctor")
  );

  app.post(
    "/app/settings/website/catalogue/services/:serviceId",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    (req, res, next) => handleCatalogueAction(req, res, next, "service")
  );

  app.get(
    "/app/settings/website/library",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const loaded = await libraryService.loadLibrary(getPool(), cmsInput(req));
        if (!loaded.ok) return deny(res, 403, "Content library", slugErrorMessage(loaded.code));
        const filter = String(req.query.type || "").trim();
        const items = filter
          ? loaded.items.filter((item) => item.type === filter)
          : loaded.items;
        return renderShell(req, res, {
          content: "app/website-cms-library.ejs",
          cmsActive: "library",
          pageHeader: { title: "Content library", description: "Reuse clinic website content across pages." },
          breadcrumbs: breadcrumbs([{ label: "Content library" }]),
          pageData: {
            cms: {
              items,
              types: loaded.types,
              filter,
              canEdit: hasWebsitePermission(cmsInput(req).grantedPermissions, PERMISSIONS.EDIT),
              saved: String(req.query.saved || "") === "1",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/library/reorder",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const ids = [].concat((req.body && req.body.itemIds) || []);
        await libraryService.reorderLibraryItems(getPool(), { ...cmsInput(req), itemIds: ids });
        return res.redirect(303, "/app/settings/website/library?saved=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/library/new",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        const loaded = await libraryService.loadLibrary(getPool(), cmsInput(req));
        if (!loaded.ok) return deny(res, 403, "Add content item", slugErrorMessage(loaded.code));
        return renderShell(req, res, {
          content: "app/website-cms-library-new.ejs",
          cmsActive: "library",
          pageHeader: { title: "Add content item", description: "Create reusable website content." },
          breadcrumbs: breadcrumbs([
            { label: "Content library", href: "/app/settings/website/library" },
            { label: "Add" },
          ]),
          pageData: {
            cms: {
              types: loaded.types,
              operational: loaded.operational,
              selectedType: String(req.query.type || "faq"),
              canEdit: true,
              error: "",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/library",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const created = await libraryService.createLibraryItem(getPool(), {
          ...cmsInput(req),
          ...libraryFormFields(req.body),
        });
        if (!created.ok) {
          const loaded = await libraryService.loadLibrary(getPool(), cmsInput(req));
          return renderShell(req, res, {
            status: 400,
            content: "app/website-cms-library-new.ejs",
            cmsActive: "library",
            pageHeader: { title: "Add content item", description: "Create reusable website content." },
            breadcrumbs: breadcrumbs([
              { label: "Content library", href: "/app/settings/website/library" },
              { label: "Add" },
            ]),
            pageData: {
              cms: {
                types: (loaded.ok && loaded.types) || [],
                operational: (loaded.ok && loaded.operational) || { services: [], doctors: [], facilities: [] },
                selectedType: String((req.body && req.body.type) || "faq"),
                title: req.body && req.body.title,
                question: req.body && req.body.question,
                summary: req.body && req.body.summary,
                body: req.body && req.body.body,
                answer: req.body && req.body.answer,
                quote: req.body && req.body.quote,
                attribution: req.body && req.body.attribution,
                canEdit: true,
                error: slugErrorMessage(created.code),
              },
            },
          });
        }
        return res.redirect(303, `/app/settings/website/library/${created.item.id}?saved=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/library/:itemId/use",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const loaded = await libraryService.getLibraryItem(getPool(), {
          ...cmsInput(req),
          itemId: req.params.itemId,
        });
        if (!loaded.ok) return deny(res, loaded.code === "not_found" ? 404 : 403, "Use content on page", slugErrorMessage(loaded.code));
        return renderShell(req, res, {
          content: "app/website-cms-library-use.ejs",
          cmsActive: "library",
          pageHeader: { title: "Use content on page", description: "Reuse this item without duplicating it." },
          breadcrumbs: breadcrumbs([
            { label: "Content library", href: "/app/settings/website/library" },
            { label: loaded.item.title || "Item", href: `/app/settings/website/library/${loaded.item.id}` },
            { label: "Use on page" },
          ]),
          pageData: {
            cms: {
              item: loaded.item,
              pages: loaded.pages,
              canEdit: hasWebsitePermission(cmsInput(req).grantedPermissions, PERMISSIONS.EDIT),
              saved: String(req.query.saved || "") === "1",
              error: String(req.query.error || "") === "1" ? slugErrorMessage(req.query.code) : "",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/library/:itemId/use",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const placed = await libraryService.placeLibraryItem(getPool(), {
          ...cmsInput(req),
          itemId: req.params.itemId,
          pageId: req.body && req.body.pageId,
        });
        if (!placed.ok) {
          return res.redirect(
            303,
            `/app/settings/website/library/${req.params.itemId}/use?error=1&code=${encodeURIComponent(placed.code || "")}`
          );
        }
        return res.redirect(303, `/app/settings/website/library/${req.params.itemId}/use?saved=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/library/:itemId/placements/:placementId/delete",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        await libraryService.removePlacement(getPool(), {
          ...cmsInput(req),
          itemId: req.params.itemId,
          placementId: req.params.placementId,
        });
        return res.redirect(303, `/app/settings/website/library/${req.params.itemId}/use?saved=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/library/:itemId/delete",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const removed = await libraryService.deleteLibraryItem(getPool(), {
          ...cmsInput(req),
          itemId: req.params.itemId,
        });
        if (!removed.ok) return deny(res, 400, "Remove content", slugErrorMessage(removed.code));
        return res.redirect(303, "/app/settings/website/library?saved=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/website/library/:itemId",
    requireAuth,
    requirePermission(viewOrEdit),
    async (req, res, next) => {
      try {
        const loaded = await libraryService.getLibraryItem(getPool(), {
          ...cmsInput(req),
          itemId: req.params.itemId,
        });
        if (!loaded.ok) return deny(res, loaded.code === "not_found" ? 404 : 403, "Edit content item", slugErrorMessage(loaded.code));
        return renderShell(req, res, {
          content: "app/website-cms-library-edit.ejs",
          cmsActive: "library",
          pageHeader: { title: "Edit content item", description: "Update reusable website content." },
          breadcrumbs: breadcrumbs([
            { label: "Content library", href: "/app/settings/website/library" },
            { label: loaded.item.title || "Item" },
          ]),
          pageData: {
            cms: {
              item: loaded.item,
              canEdit: hasWebsitePermission(cmsInput(req).grantedPermissions, PERMISSIONS.EDIT),
              mediaListUrl: `/clinics/${cmsInput(req).clinicKey}/website/media`,
              saved: String(req.query.saved || "") === "1",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/website/library/:itemId",
    requireAuth,
    requirePermission(PERMISSIONS.EDIT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return deny(res, 403, "Invalid request", "Reload the page and try again.");
        }
        const saved = await libraryService.updateLibraryItem(getPool(), {
          ...cmsInput(req),
          itemId: req.params.itemId,
          title: req.body && req.body.title,
          summary: req.body && req.body.summary,
          body: req.body && req.body.body,
          attribution: req.body && req.body.attribution,
          visible: req.body && req.body.visible,
          featured: req.body && req.body.featured,
          imageSrc: req.body && req.body.imageSrc,
          imageAlt: req.body && req.body.imageAlt,
          imageMediaId: req.body && req.body.imageMediaId,
        });
        if (!saved.ok) {
          const loaded = await libraryService.getLibraryItem(getPool(), {
            ...cmsInput(req),
            itemId: req.params.itemId,
          });
          if (!loaded.ok) return deny(res, 400, "Edit content item", slugErrorMessage(saved.code));
          return renderShell(req, res, {
            status: 400,
            content: "app/website-cms-library-edit.ejs",
            cmsActive: "library",
            pageHeader: { title: "Edit content item", description: "Update reusable website content." },
            breadcrumbs: breadcrumbs([
              { label: "Content library", href: "/app/settings/website/library" },
              { label: loaded.item.title || "Item" },
            ]),
            pageData: {
              cms: {
                item: loaded.item,
                canEdit: true,
                mediaListUrl: `/clinics/${cmsInput(req).clinicKey}/website/media`,
                error: slugErrorMessage(saved.code),
              },
            },
          });
        }
        return res.redirect(303, `/app/settings/website/library/${req.params.itemId}?saved=1`);
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
