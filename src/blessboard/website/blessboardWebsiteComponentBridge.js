"use strict";

/**
 * BlessBoard → platform shared component bridge (V2.04 Phase 4).
 *
 * Public (non-edit) renders prefer platform presentation components.
 * BB theme tokens flow through website-presentation-token-bridge.css
 * (--bb-color-primary → --gp-website-color-primary → colors.css violet).
 *
 * Edit mode keeps BB structured-edit / editable-text hooks until Phase 5
 * field-key cutover completes; editor engine remains WE01 only.
 */

const {
  renderPresentationComponent,
  SHARED_EDITOR_ENGINE_COUNT,
  SHARED_EDITOR_ENGINE_PATH,
} = require("../../platform/website/presentation/componentLibrary");
const {
  SHARED_UPLOAD_ENGINE_COUNT,
  SHARED_UPLOAD_ENGINE,
} = require("../../platform/website/websiteMediaEditingContract");
const presentationAdapter = require("./blessboardWebsitePresentationAdapter");

const PRODUCT_CODE = "blessboard";
const BB_THEME_CLASS = "bb-tp-platform-bridge";

const ENGINE_COUNTS = Object.freeze({
  EDITOR_ENGINE_COUNT: SHARED_EDITOR_ENGINE_COUNT,
  EDITOR_ENGINE_PATH: SHARED_EDITOR_ENGINE_PATH,
  UPLOAD_ENGINE_COUNT: SHARED_UPLOAD_ENGINE_COUNT,
  UPLOAD_ENGINE: SHARED_UPLOAD_ENGINE,
  MEDIA_LIBRARY_ENGINE_COUNT: 1,
  MEDIA_LIBRARY_ENGINE: "platform/website/mediaService",
});

/**
 * @param {string} componentId
 * @param {object} dto
 * @param {{ className?: string, editEnabled?: boolean, edit?: object }} [options]
 */
function renderBbPlatformComponent(componentId, dto, options) {
  const opts = options && typeof options === "object" ? options : {};
  const className = [BB_THEME_CLASS, opts.className].filter(Boolean).join(" ");
  return renderPresentationComponent(componentId, dto, {
    ...opts,
    className,
    editEnabled: opts.editEnabled === true,
  });
}

function renderHeroFromLocals(locals) {
  const mapped = presentationAdapter.toHero({
    eyebrow: locals && locals.heroEyebrow,
    title: locals && locals.heroHeading,
    subtitle: locals && locals.heroBody,
    image: locals && locals.heroMedia,
    primaryLabel: locals && locals.heroCtaPrimary && locals.heroCtaPrimary.label,
    primaryUrl: locals && locals.heroCtaPrimary && locals.heroCtaPrimary.href,
    secondaryLabel: locals && locals.heroCtaSecondary && locals.heroCtaSecondary.label,
    secondaryUrl: locals && locals.heroCtaSecondary && locals.heroCtaSecondary.href,
  });
  if (!mapped.ok) return { ok: false, code: mapped.code, html: "" };
  return renderBbPlatformComponent("hero", mapped.value, {
    className: "bb-tp-page-hero-platform",
  });
}

function renderCtaFromLocals(locals) {
  const mapped = presentationAdapter.toCta({
    heading: locals && locals.ctaTitle,
    body: locals && locals.ctaBody,
    primaryLabel: locals && locals.ctaPrimary && locals.ctaPrimary.label,
    primaryUrl: locals && locals.ctaPrimary && locals.ctaPrimary.href,
    secondaryLabel: locals && locals.ctaSecondary && locals.ctaSecondary.label,
    secondaryUrl: locals && locals.ctaSecondary && locals.ctaSecondary.href,
  });
  if (!mapped.ok) return { ok: false, code: mapped.code, html: "" };
  return renderBbPlatformComponent("cta", mapped.value, {
    className: "bb-tp-cta-band-platform",
  });
}

function renderHoursFromServiceTimes(locals) {
  const entries = (locals && locals.serviceTimesEntries) || [];
  const mapped = presentationAdapter.toHours({
    heading: (locals && locals.serviceTimesHeading) || "Service Times",
    times: entries.map((entry) => ({
      label: entry && entry.name,
      days: entry && entry.day,
      open: entry && (entry.startTime || entry.time),
      close: entry && entry.endTime,
      note: entry && entry.note,
    })),
  });
  if (!mapped.ok) return { ok: false, code: mapped.code, html: "" };
  return renderBbPlatformComponent("hours", mapped.value, {
    className: "bb-tp-service-times-platform",
  });
}

function renderLeaderPerson(leader) {
  const mapped = presentationAdapter.toPersonPresentation(leader || {});
  if (!mapped.ok) return { ok: false, code: mapped.code, html: "" };
  return renderBbPlatformComponent("person_card", mapped.value, {
    className: "bb-tp-leader-card-platform",
  });
}

module.exports = {
  PRODUCT_CODE,
  BB_THEME_CLASS,
  ENGINE_COUNTS,
  renderBbPlatformComponent,
  renderHeroFromLocals,
  renderCtaFromLocals,
  renderHoursFromServiceTimes,
  renderLeaderPerson,
};
