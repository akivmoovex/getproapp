"use strict";

/**
 * Prepare sparse BlessBoard V5 minimum demo content for one org/church/deployment.
 * Never creates passwords/users. Never touches legacy V4 tenant/session tables.
 */

const content = require("./publicContentAdminService");
const contentRepo = require("../repositories/publicContentRepository");
const catalogueRepo = require("../repositories/blessBoardCatalogueRepository");
const authRepo = require("../repositories/blessBoardAuthRepository");
const announcements = require("./announcementsService");
const announcementsRepo = require("../repositories/announcementsRepository");
const attendance = require("./attendanceService");
const attendanceRepo = require("../repositories/attendanceRepository");
const giving = require("./givingService");
const givingRepo = require("../repositories/givingRepository");
const formsRequests = require("./formsRequestsService");
const formsRepo = require("../repositories/formsRequestsRepository");
const { provisionPlatformTenant } = require("../../platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("./provisionBlessBoardChurch");
const spec = require("./demoMinimumDatasetSpec");

const STATUS = Object.freeze({
  PLANNED: "planned",
  APPLIED: "applied",
  ALREADY_PRESENT: "already_present",
  SKIPPED: "skipped",
  CONFLICT: "conflict",
  BLOCKED: "blocked",
  ERROR: "error",
});

const DEFAULT_PAGE_TITLES = new Set([
  "Home",
  "About",
  "Leadership",
  "Ministries",
  "Events",
  "Sermons",
  "Contact",
  "Giving",
]);

function act(record, status, detail, extra) {
  return {
    record,
    status,
    detail: detail || null,
    cleanup: { marker: spec.DEMO_TAG, tool: spec.DEMO_TOOL, demo_key: record },
    ...(extra || {}),
  };
}

function pageIsDemoOwned(page) {
  return Boolean(
    page && (spec.isDemoMarkedText(page.title) || spec.isDemoMetadata(page.layoutMetadata))
  );
}

function pageConflicts(page) {
  if (!page) return false;
  if (pageIsDemoOwned(page)) return false;
  if (DEFAULT_PAGE_TITLES.has(String(page.title || "")) && page.status === "draft") return false;
  if (page.status === "published" || page.status === "archived") return true;
  if (page.title && !spec.isDemoMarkedText(page.title) && !DEFAULT_PAGE_TITLES.has(String(page.title))) {
    return true;
  }
  return false;
}

function findByExact(items, field, value) {
  const v = String(value || "");
  return (items || []).find((it) => String(it[field] || "") === v) || null;
}

async function withClient(db, fn) {
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

function buildCleanupIndex(actions) {
  return (actions || [])
    .filter(
      (a) =>
        a &&
        (a.status === STATUS.APPLIED ||
          a.status === STATUS.ALREADY_PRESENT ||
          a.status === STATUS.PLANNED)
    )
    .map((a) => ({
      record: a.record,
      status: a.status,
      marker: spec.DEMO_TAG,
      tool: spec.DEMO_TOOL,
      id: a.id || null,
      detail: a.detail,
    }));
}

function resultBase(partial) {
  return {
    notes: [
      "Credentials/users are not created by this tool — use blessboard:user:create / role:assign.",
      "Member registration and member requests are omitted (smoke / UI workflow).",
      "Media binaries omitted — upload via media picker for T18–T19.",
      "Cleanup: titles containing [Demo], section_key demo_body, layout_metadata.bb_demo, reference bb-demo-v5:*.",
    ],
    ...partial,
    cleanupIndex: buildCleanupIndex(partial.actions || []),
  };
}

async function prepareDemoMinimumDataset(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const dryRun = Boolean(raw.dryRun);
  const organizationKey = String(raw.organizationKey || "").trim().toLowerCase();
  const churchKey = String(raw.churchKey || "").trim().toLowerCase();
  const deploymentCode = String(raw.deploymentCode || "").trim().toLowerCase();
  const hostname = String(raw.hostname || "").trim().toLowerCase();
  const hqBranchKey = String(raw.hqBranchKey || "hq").trim().toLowerCase() || "hq";
  const hqBranchName = String(raw.hqBranchName || "Headquarters").trim() || "Headquarters";
  const displayName =
    String(raw.displayName || "").trim() || "BlessBoard Diagnostic Church [Demo]";
  const dataEnvironment = String(raw.dataEnvironment || "testing").trim().toLowerCase() || "testing";
  const actorEmail = String(raw.actorEmail || "").trim().toLowerCase();
  const productTenantKey = String(raw.productTenantKey || churchKey).trim() || churchKey;
  const actions = [];
  const dates = spec.relativeDates(raw.d0 ? new Date(raw.d0) : undefined);

  if (!organizationKey || !churchKey || !deploymentCode) {
    return resultBase({
      ok: false,
      status: STATUS.BLOCKED,
      message: "organization_key_church_key_deployment_required",
      dryRun,
      actions,
      dates,
    });
  }

  try {
    let organization = await withClient(db, (c) =>
      catalogueRepo.findOrganizationByKey(c, organizationKey)
    );
    let church = null;
    let hqBranch = null;

    if (!organization) {
      if (!hostname) {
        actions.push(act("catalogue.organization", STATUS.BLOCKED, "hostname_required_to_provision"));
        return resultBase({
          ok: false,
          status: STATUS.BLOCKED,
          message: "hostname_required_when_organization_missing",
          dryRun,
          actions,
          dates,
        });
      }
      const plat = await provisionPlatformTenant(db, {
        organizationKey,
        displayName,
        dataEnvironment,
        productKey: "blessboard",
        productTenantKey,
        hostname,
        domainType: "canonical",
        deploymentCode,
        isPrimary: true,
        dryRun,
      });
      if (!plat.ok) {
        actions.push(act("catalogue.platform", STATUS.ERROR, plat.message || plat.status));
        return resultBase({
          ok: false,
          status: STATUS.ERROR,
          message: plat.message || "platform_provision_failed",
          dryRun,
          actions,
          dates,
        });
      }
      const already =
        String(plat.status || "").includes("already") ||
        String(plat.status || "") === "dry_run_already_provisioned";
      actions.push(
        act("catalogue.platform", dryRun ? (already ? STATUS.ALREADY_PRESENT : STATUS.PLANNED) : already ? STATUS.ALREADY_PRESENT : STATUS.APPLIED, plat.status, {
          planned: plat.planned || null,
        })
      );
      if (!dryRun) {
        organization = await withClient(db, (c) =>
          catalogueRepo.findOrganizationByKey(c, organizationKey)
        );
      }
    } else {
      actions.push(act("catalogue.organization", STATUS.ALREADY_PRESENT, organizationKey));
    }

    if (organization) {
      church = await withClient(db, (c) => catalogueRepo.findChurchByKey(c, churchKey));
      if (church && String(church.organization_id) !== String(organization.id)) {
        actions.push(act("catalogue.church", STATUS.CONFLICT, "church_owned_by_other_organization"));
        return resultBase({
          ok: false,
          status: STATUS.CONFLICT,
          message: "church_organization_mismatch",
          dryRun,
          actions,
          dates,
        });
      }
      if (!church) {
        const ch = await provisionBlessBoardChurch(db, {
          organizationKey,
          churchKey,
          displayName,
          dataEnvironment,
          hqBranchKey,
          hqBranchDisplayName: hqBranchName,
          timezone: "UTC",
          dryRun,
        });
        if (!ch.ok) {
          actions.push(act("catalogue.church", STATUS.ERROR, ch.message || ch.status));
          return resultBase({
            ok: false,
            status: STATUS.ERROR,
            message: ch.message || "church_provision_failed",
            dryRun,
            actions,
            dates,
          });
        }
        const already = String(ch.status || "").includes("already");
        actions.push(
          act(
            "catalogue.church",
            dryRun ? (already ? STATUS.ALREADY_PRESENT : STATUS.PLANNED) : already ? STATUS.ALREADY_PRESENT : STATUS.APPLIED,
            ch.status,
            { planned: ch.planned || null }
          )
        );
        if (!dryRun) {
          church = await withClient(db, (c) => catalogueRepo.findChurchByKey(c, churchKey));
        }
      } else {
        actions.push(act("catalogue.church", STATUS.ALREADY_PRESENT, churchKey));
      }
    }

    if (church) {
      hqBranch =
        (await withClient(db, (c) => catalogueRepo.findHqBranch(c, church.id))) ||
        (await withClient(db, (c) =>
          catalogueRepo.findBranchByChurchAndKey(c, church.id, hqBranchKey)
        ));
      if (hqBranch) {
        actions.push(act("catalogue.hq_branch", STATUS.ALREADY_PRESENT, hqBranch.branch_key || hqBranchKey));
      } else if (dryRun) {
        actions.push(act("catalogue.hq_branch", STATUS.PLANNED, hqBranchKey));
      } else {
        actions.push(act("catalogue.hq_branch", STATUS.ERROR, "hq_branch_missing"));
        return resultBase({
          ok: false,
          status: STATUS.ERROR,
          message: "hq_branch_missing",
          dryRun,
          actions,
          dates,
        });
      }
    }

    if (!church || !hqBranch) {
      if (dryRun) {
        for (const p of spec.PAGES) {
          actions.push(act(`page.${p.pageKey}`, STATUS.PLANNED, p.title));
          actions.push(act(`section.${p.pageKey}.${spec.SECTION_KEY}`, STATUS.PLANNED, p.sectionHeading));
        }
        actions.push(act("leader", STATUS.PLANNED, spec.LEADER.displayName));
        actions.push(act("ministry", STATUS.PLANNED, spec.MINISTRY.name));
        actions.push(act("event", STATUS.PLANNED, spec.EVENT.title));
        actions.push(act("sermon", STATUS.PLANNED, spec.SERMON.title));
        actions.push(act("contact_channel", STATUS.PLANNED, spec.CONTACT_CHANNEL.label));
        actions.push(act("giving_method", STATUS.PLANNED, spec.GIVING_METHOD.label));
        actions.push(
          act(
            "ops.actor_dependent",
            actorEmail ? STATUS.PLANNED : STATUS.SKIPPED,
            actorEmail || "actor_email_required_for_ops"
          )
        );
        return resultBase({
          ok: true,
          status: STATUS.PLANNED,
          message: "dry_run_catalogue_and_content_planned",
          dryRun: true,
          actions,
          dates,
          keys: {
            organization_key: organizationKey,
            church_key: churchKey,
            deployment: deploymentCode,
          },
        });
      }
      return resultBase({
        ok: false,
        status: STATUS.BLOCKED,
        message: "church_or_hq_unresolved",
        dryRun,
        actions,
        dates,
      });
    }

    const churchId = church.id;
    const branchId = hqBranch.id;

    if (!dryRun) {
      const shells = await content.provisionEmptyPublicPages(db, { churchId, branchId: null });
      if (!shells.ok) {
        actions.push(act("pages.provision_shells", STATUS.ERROR, shells.reason || shells.status));
        return resultBase({
          ok: false,
          status: STATUS.ERROR,
          message: "page_shell_provision_failed",
          dryRun,
          actions,
          dates,
        });
      }
    }

    for (const pageSpec of spec.PAGES) {
      const bundle = await content.getAdminPageBundle(db, {
        churchId,
        branchId: null,
        pageKey: pageSpec.pageKey,
      });
      const page = bundle.page;
      if (page && pageConflicts(page)) {
        actions.push(
          act(`page.${pageSpec.pageKey}`, STATUS.CONFLICT, "non_demo_page_present", {
            existing_title: page.title,
            existing_status: page.status,
          })
        );
        return resultBase({
          ok: false,
          status: STATUS.CONFLICT,
          message: `non_demo_content:${pageSpec.pageKey}`,
          dryRun,
          actions,
          dates,
        });
      }

      if (dryRun) {
        const sectionExisting =
          page &&
          (await withClient(db, (c) =>
            contentRepo.findSectionByPageAndKey(c, page.id, spec.SECTION_KEY)
          ));
        actions.push(
          act(
            `page.${pageSpec.pageKey}`,
            page && pageIsDemoOwned(page) && page.status === "published"
              ? STATUS.ALREADY_PRESENT
              : STATUS.PLANNED,
            pageSpec.title
          )
        );
        actions.push(
          act(
            `section.${pageSpec.pageKey}.${spec.SECTION_KEY}`,
            sectionExisting &&
              (spec.isDemoMarkedText(sectionExisting.heading) ||
                spec.isDemoMarkedText(sectionExisting.bodyText) ||
                spec.isDemoMetadata(sectionExisting.layoutMetadata))
              ? STATUS.ALREADY_PRESENT
              : STATUS.PLANNED,
            pageSpec.sectionHeading
          )
        );
        continue;
      }

      let pageId = page && page.id;
      if (!pageId) {
        const ensured = await withClient(db, (c) =>
          contentRepo.ensureDraftPage(c, {
            churchId,
            branchId: null,
            pageKey: pageSpec.pageKey,
            title: pageSpec.title,
          })
        );
        pageId = ensured.page && ensured.page.id;
      }
      const updated = await content.updatePublicPage(db, pageId, {
        title: pageSpec.title,
        status: "published",
        confirmPublish: true,
        allowPublishedWrite: true,
      });
      if (!updated.ok) {
        actions.push(act(`page.${pageSpec.pageKey}`, STATUS.ERROR, updated.reason || updated.status));
        return resultBase({
          ok: false,
          status: STATUS.ERROR,
          message: `page_update_failed:${pageSpec.pageKey}`,
          dryRun,
          actions,
          dates,
        });
      }
      await withClient(db, (c) =>
        contentRepo.updatePage(c, pageId, {
          layoutMetadata: spec.demoLayoutMetadata(`page:${pageSpec.pageKey}`),
        })
      );
      actions.push(
        act(
          `page.${pageSpec.pageKey}`,
          pageIsDemoOwned(page) && page.status === "published" ? STATUS.ALREADY_PRESENT : STATUS.APPLIED,
          pageSpec.title
        )
      );

      const existingSection = await withClient(db, (c) =>
        contentRepo.findSectionByPageAndKey(c, pageId, spec.SECTION_KEY)
      );
      if (existingSection) {
        await content.updatePageSection(db, existingSection.id, {
          heading: pageSpec.sectionHeading,
          bodyText: pageSpec.sectionBody,
          status: "published",
          confirmPublish: true,
          allowPublishedWrite: true,
        });
        if (typeof contentRepo.updateSection === "function") {
          await withClient(db, (c) =>
            contentRepo.updateSection(c, existingSection.id, {
              layoutMetadata: spec.demoLayoutMetadata(`section:${pageSpec.pageKey}`),
            })
          );
        }
        actions.push(
          act(`section.${pageSpec.pageKey}.${spec.SECTION_KEY}`, STATUS.ALREADY_PRESENT, pageSpec.sectionHeading)
        );
      } else {
        const created = await content.createPageSection(db, {
          pageId,
          sectionKey: spec.SECTION_KEY,
          sectionType: "body",
          heading: pageSpec.sectionHeading,
          bodyText: pageSpec.sectionBody,
          status: "published",
          confirmPublish: true,
          allowPublishedWrite: true,
          sortOrder: 10,
        });
        if (!created.ok) {
          actions.push(
            act(`section.${pageSpec.pageKey}.${spec.SECTION_KEY}`, STATUS.ERROR, created.reason || created.status)
          );
          return resultBase({
            ok: false,
            status: STATUS.ERROR,
            message: `section_create_failed:${pageSpec.pageKey}`,
            dryRun,
            actions,
            dates,
          });
        }
        if (created.section && created.section.id && typeof contentRepo.updateSection === "function") {
          await withClient(db, (c) =>
            contentRepo.updateSection(c, created.section.id, {
              layoutMetadata: spec.demoLayoutMetadata(`section:${pageSpec.pageKey}`),
            })
          );
        }
        actions.push(
          act(`section.${pageSpec.pageKey}.${spec.SECTION_KEY}`, STATUS.APPLIED, pageSpec.sectionHeading)
        );
      }
    }

    async function ensureEntity(record, listCall, matchField, matchValue, createCall) {
      const listed = await listCall();
      const items = listed.items || [];
      const existing = findByExact(items, matchField, matchValue);
      if (existing) {
        actions.push(act(record, STATUS.ALREADY_PRESENT, matchValue, { id: existing.id }));
        return { ok: true };
      }
      if (dryRun) {
        actions.push(act(record, STATUS.PLANNED, matchValue));
        return { ok: true };
      }
      const created = await createCall();
      if (!created.ok) {
        actions.push(act(record, STATUS.ERROR, created.reason || created.status));
        return { ok: false };
      }
      actions.push(act(record, STATUS.APPLIED, matchValue, { id: created.item && created.item.id }));
      return { ok: true };
    }

    let r = await ensureEntity(
      "leader",
      () => content.listAdminLeaders(db, { churchId }),
      "displayName",
      spec.LEADER.displayName,
      () =>
        content.createLeader(db, {
          churchId,
          branchId: null,
          displayName: spec.LEADER.displayName,
          roleTitle: spec.LEADER.roleTitle,
          biography: spec.LEADER.biography,
          status: "published",
          confirmPublish: true,
        })
    );
    if (!r.ok) return resultBase({ ok: false, status: STATUS.ERROR, message: "leader_failed", dryRun, actions, dates });

    r = await ensureEntity(
      "ministry",
      () => content.listAdminMinistries(db, { churchId, branchId }),
      "name",
      spec.MINISTRY.name,
      () =>
        content.createMinistry(db, {
          churchId,
          branchId,
          name: spec.MINISTRY.name,
          summary: spec.MINISTRY.summary,
          joinPolicy: spec.MINISTRY.joinPolicy,
          status: "published",
          confirmPublish: true,
        })
    );
    if (!r.ok) return resultBase({ ok: false, status: STATUS.ERROR, message: "ministry_failed", dryRun, actions, dates });

    r = await ensureEntity(
      "event",
      () => content.listAdminEvents(db, { churchId, branchId }),
      "title",
      spec.EVENT.title,
      () =>
        content.createEvent(db, {
          churchId,
          branchId,
          title: spec.EVENT.title,
          summary: spec.EVENT.summary,
          startsAt: dates.eventStartsAt,
          timezone: spec.EVENT.timezone,
          status: "published",
          confirmPublish: true,
        })
    );
    if (!r.ok) return resultBase({ ok: false, status: STATUS.ERROR, message: "event_failed", dryRun, actions, dates });

    r = await ensureEntity(
      "sermon",
      () => content.listAdminSermons(db, { churchId }),
      "title",
      spec.SERMON.title,
      () =>
        content.createSermon(db, {
          churchId,
          branchId: null,
          title: spec.SERMON.title,
          speakerName: spec.SERMON.speakerName,
          preachedAt: dates.sermonPreachedAt,
          summary: spec.SERMON.summary,
          status: "published",
          confirmPublish: true,
        })
    );
    if (!r.ok) return resultBase({ ok: false, status: STATUS.ERROR, message: "sermon_failed", dryRun, actions, dates });

    {
      const listed = await content.listAdminContactChannels(db, { churchId });
      const existing = (listed.items || []).find(
        (it) =>
          String(it.label) === spec.CONTACT_CHANNEL.label ||
          String(it.value) === spec.CONTACT_CHANNEL.value
      );
      if (existing) {
        actions.push(act("contact_channel", STATUS.ALREADY_PRESENT, spec.CONTACT_CHANNEL.label, { id: existing.id }));
      } else if (dryRun) {
        actions.push(act("contact_channel", STATUS.PLANNED, spec.CONTACT_CHANNEL.label));
      } else {
        const created = await content.createContactChannel(db, {
          churchId,
          branchId: null,
          channelType: spec.CONTACT_CHANNEL.channelType,
          label: spec.CONTACT_CHANNEL.label,
          value: spec.CONTACT_CHANNEL.value,
          status: "published",
          confirmPublish: true,
        });
        if (!created.ok) {
          actions.push(act("contact_channel", STATUS.ERROR, created.reason || created.status));
          return resultBase({ ok: false, status: STATUS.ERROR, message: "contact_failed", dryRun, actions, dates });
        }
        actions.push(act("contact_channel", STATUS.APPLIED, spec.CONTACT_CHANNEL.label, { id: created.item && created.item.id }));
      }
    }

    r = await ensureEntity(
      "giving_method",
      () => content.listAdminGivingMethods(db, { churchId }),
      "label",
      spec.GIVING_METHOD.label,
      () =>
        content.createGivingMethod(db, {
          churchId,
          branchId: null,
          methodType: spec.GIVING_METHOD.methodType,
          label: spec.GIVING_METHOD.label,
          instructions: spec.GIVING_METHOD.instructions,
          status: "published",
          confirmPublish: true,
        })
    );
    if (!r.ok) return resultBase({ ok: false, status: STATUS.ERROR, message: "giving_method_failed", dryRun, actions, dates });

    let actorUserId = null;
    if (actorEmail) {
      const user = await withClient(db, (c) => authRepo.findUserByEmail(c, actorEmail));
      if (!user) {
        actions.push(act("ops.actor", STATUS.BLOCKED, "actor_email_not_found"));
        if (!dryRun) {
          return resultBase({
            ok: false,
            status: STATUS.BLOCKED,
            message: "actor_email_not_found",
            dryRun,
            actions,
            dates,
          });
        }
      } else {
        actorUserId = user.id;
        actions.push(act("ops.actor", STATUS.ALREADY_PRESENT, actorEmail, { userId: actorUserId }));
      }
    } else {
      actions.push(
        act(
          "ops.actor",
          STATUS.SKIPPED,
          "Provide --actor-email of an existing staff user (blessboard:user:*). No passwords created here."
        )
      );
    }

    if (actorUserId || dryRun) {
      await applyOps(db, { dryRun, churchId, branchId, actorUserId, dates, actions });
    }

    const conflicted = actions.some((a) => a.status === STATUS.CONFLICT);
    const errored = actions.some((a) => a.status === STATUS.ERROR || a.status === STATUS.BLOCKED);
    return resultBase({
      ok: !conflicted && !errored,
      status: conflicted ? STATUS.CONFLICT : dryRun ? STATUS.PLANNED : STATUS.APPLIED,
      message: dryRun ? "dry_run_complete" : "apply_complete",
      dryRun,
      actions,
      dates,
      keys: {
        organization_key: organizationKey,
        church_key: churchKey,
        hq_branch_key: hqBranchKey,
        deployment: deploymentCode,
      },
    });
  } catch (err) {
    return resultBase({
      ok: false,
      status: STATUS.ERROR,
      message: "dataset_tool_failure",
      detail: err && err.message ? String(err.message).slice(0, 200) : null,
      dryRun,
      actions,
      dates,
    });
  }
}

async function applyOps(db, ctx) {
  const { dryRun, churchId, branchId, actorUserId, dates, actions } = ctx;

  const annRows = actorUserId
    ? await withClient(db, (c) => announcementsRepo.listAnnouncements(c, { churchId, branchId, limit: 50 }))
    : [];
  const annList = Array.isArray(annRows) ? annRows : annRows.items || [];
  const annExisting = findByExact(annList, "title", spec.ANNOUNCEMENT.title);
  if (annExisting) {
    actions.push(act("announcement", STATUS.ALREADY_PRESENT, spec.ANNOUNCEMENT.title, { id: annExisting.id }));
  } else if (dryRun || !actorUserId) {
    actions.push(act("announcement", STATUS.PLANNED, spec.ANNOUNCEMENT.title));
  } else {
    const created = await announcements.createAnnouncement(db, {
      churchId,
      branchId,
      actorUserId,
      title: spec.ANNOUNCEMENT.title,
      body: spec.ANNOUNCEMENT.body,
      audiences: spec.ANNOUNCEMENT.audiences,
      status: "published",
      confirmPublish: true,
    });
    actions.push(
      created.ok
        ? act("announcement", STATUS.APPLIED, spec.ANNOUNCEMENT.title, { id: created.item && created.item.id })
        : act("announcement", STATUS.ERROR, created.reason || created.status)
    );
  }

  const resRows = actorUserId
    ? await withClient(db, (c) => formsRepo.listResources(c, { churchId, branchId }))
    : [];
  const resList = Array.isArray(resRows) ? resRows : resRows.items || [];
  const resExisting = findByExact(resList, "title", spec.RESOURCE.title);
  if (resExisting) {
    actions.push(act("resource", STATUS.ALREADY_PRESENT, spec.RESOURCE.title, { id: resExisting.id }));
  } else if (dryRun || !actorUserId) {
    actions.push(act("resource", STATUS.PLANNED, spec.RESOURCE.title));
  } else {
    const created = await formsRequests.createResource(db, {
      churchId,
      branchId,
      actorUserId,
      title: spec.RESOURCE.title,
      description: spec.RESOURCE.description,
      audience: spec.RESOURCE.audience,
    });
    const resourceId = created.resource && created.resource.id;
    if (created.ok && resourceId) {
      await formsRequests.publishResource(db, { churchId, id: resourceId, actorUserId });
      actions.push(act("resource", STATUS.APPLIED, spec.RESOURCE.title, { id: resourceId }));
    } else {
      actions.push(act("resource", STATUS.ERROR, created.reason || created.status));
    }
  }

  const formRows = actorUserId
    ? await withClient(db, (c) => formsRepo.listForms(c, { churchId, branchId }))
    : [];
  const formList = Array.isArray(formRows) ? formRows : formRows.items || [];
  const formExisting = findByExact(formList, "title", spec.FORM.title);
  if (formExisting) {
    actions.push(act("form", STATUS.ALREADY_PRESENT, spec.FORM.title, { id: formExisting.id }));
  } else if (dryRun || !actorUserId) {
    actions.push(act("form", STATUS.PLANNED, spec.FORM.title));
  } else {
    const created = await formsRequests.createForm(db, {
      churchId,
      branchId,
      actorUserId,
      title: spec.FORM.title,
      description: spec.FORM.description,
      schema: spec.FORM.schema,
    });
    const formId = created.form && created.form.id;
    if (created.ok && formId) {
      await formsRequests.publishForm(db, { churchId, id: formId, actorUserId });
      actions.push(act("form", STATUS.APPLIED, spec.FORM.title, { id: formId }));
    } else {
      actions.push(act("form", STATUS.ERROR, created.reason || created.status));
    }
  }

  const attRows = actorUserId
    ? await withClient(db, (c) => attendanceRepo.listEvents(c, { churchId, branchId, limit: 50 }))
    : [];
  const attList = Array.isArray(attRows) ? attRows : attRows.items || [];
  const attExisting = findByExact(attList, "title", spec.ATTENDANCE.title);
  if (attExisting) {
    actions.push(act("attendance_event", STATUS.ALREADY_PRESENT, spec.ATTENDANCE.title, { id: attExisting.id }));
    if (!dryRun && actorUserId) {
      await attendance.upsertAttendanceEntry(db, {
        churchId,
        attendanceEventId: attExisting.id,
        actorUserId,
        category: spec.ATTENDANCE.category,
        count: spec.ATTENDANCE.count,
      });
    }
    actions.push(act("attendance_entry", dryRun ? STATUS.PLANNED : STATUS.ALREADY_PRESENT, spec.ATTENDANCE.category));
  } else if (dryRun || !actorUserId) {
    actions.push(act("attendance_event", STATUS.PLANNED, spec.ATTENDANCE.title));
    actions.push(act("attendance_entry", STATUS.PLANNED, spec.ATTENDANCE.category));
  } else {
    const created = await attendance.createAttendanceEvent(db, {
      churchId,
      branchId,
      actorUserId,
      title: spec.ATTENDANCE.title,
      eventType: spec.ATTENDANCE.eventType,
      eventDate: dates.attendanceEventDate,
    });
    if (!created.ok) {
      actions.push(act("attendance_event", STATUS.ERROR, created.reason || created.status));
    } else {
      const id = created.event && created.event.id;
      actions.push(act("attendance_event", STATUS.APPLIED, spec.ATTENDANCE.title, { id }));
      if (id) {
        await attendance.upsertAttendanceEntry(db, {
          churchId,
          attendanceEventId: id,
          actorUserId,
          category: spec.ATTENDANCE.category,
          count: spec.ATTENDANCE.count,
        });
        actions.push(act("attendance_entry", STATUS.APPLIED, `${spec.ATTENDANCE.category}=${spec.ATTENDANCE.count}`));
      }
    }
  }

  if (dryRun || !actorUserId) {
    actions.push(act("giving_entry", STATUS.PLANNED, spec.GIVING_ENTRY.reference));
  } else {
    const existingEntry = await withClient(db, async (c) => {
      const r = await c.query(
        `SELECT id FROM blessboard.giving_entries WHERE church_id = $1 AND reference = $2 LIMIT 1`,
        [churchId, spec.GIVING_ENTRY.reference]
      );
      return r.rows[0] || null;
    });
    if (existingEntry) {
      actions.push(act("giving_entry", STATUS.ALREADY_PRESENT, spec.GIVING_ENTRY.reference, { id: existingEntry.id }));
    } else {
      await withClient(db, (c) => givingRepo.ensureDefaultCategories(c, churchId));
      const created = await giving.createGivingEntry(db, {
        churchId,
        branchId,
        actorUserId,
        categoryKey: spec.GIVING_ENTRY.categoryKey,
        amount: spec.GIVING_ENTRY.amount,
        currency: spec.GIVING_ENTRY.currency,
        givingDate: dates.givingDate,
        reference: spec.GIVING_ENTRY.reference,
        notes: spec.GIVING_ENTRY.notes,
      });
      actions.push(
        created.ok
          ? act("giving_entry", STATUS.APPLIED, spec.GIVING_ENTRY.reference, {
              id: created.entry && created.entry.id,
            })
          : act("giving_entry", STATUS.ERROR, created.reason || created.status)
      );
    }
  }
}

module.exports = {
  STATUS,
  prepareDemoMinimumDataset,
  buildCleanupIndex,
};
