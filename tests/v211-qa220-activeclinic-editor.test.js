"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");

const HOME = path.join(__dirname, "..", "views", "activeclinic", "tenant", "home.ejs");

function renderHome(sections, websiteEdit = false) {
  return ejs.renderFile(HOME, {
    clinic: {
      publicName: "QA Clinic",
      cmsSections: sections,
      cmsLibrary: [],
      cmsLibraryPlacements: [],
      showFaq: true,
      showPromo: true,
    },
    websiteEdit,
    websitePresentation: { html: {}, paths: {} },
  });
}

test("AC220-01/02/04 renders new text sections in editor and draft preview", async () => {
  const section = {
    id: "s_qa_text",
    page_id: "tpl_home",
    type: "text",
    heading: "New heading",
    body: "New section body",
    visible: true,
  };
  const editor = await renderHome([section], true);
  const preview = await renderHome([section], false);
  for (const html of [editor, preview]) {
    assert.match(html, /data-ac-cms-section-id="s_qa_text"/);
    assert.match(html, /New section body/);
  }
  assert.match(editor, /data-ac-cms-section-edit="1"/);
  assert.doesNotMatch(preview, /data-ac-cms-section-edit="1"/);
});

test("AC220-05/06/07 renders image and image+text media selections", async () => {
  const sections = [
    {
      id: "s_qa_image",
      page_id: "tpl_home",
      type: "image",
      image: { mediaId: "media-image", src: "/clinics/qa/website/media/media-image", alt: "Clinic" },
      visible: true,
    },
    {
      id: "s_qa_image_text",
      page_id: "tpl_home",
      type: "image_text",
      heading: "Image text",
      image: { mediaId: "media-image-text", src: "/clinics/qa/website/media/media-image-text", alt: "Care" },
      body: "Care information",
      visible: true,
    },
  ];
  const html = await renderHome(sections, true);
  assert.match(html, /data-ac-cms-section-type="image"/);
  assert.match(html, /data-ac-cms-section-type="image_text"/);
  assert.match(html, /data-ac-cms-section-image="1"/g);
  assert.match(html, /media-image-text/);
});
