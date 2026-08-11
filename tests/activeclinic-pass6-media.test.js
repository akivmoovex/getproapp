"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  resolveDoctorPhoto,
  resolveClinicHero,
  resolveDirectoryCardImage,
  enrichPublicLocals,
  DOCTOR_FALLBACK,
  CLINIC_DEFAULT,
  PLATFORM_HERO,
} = require("../src/activeclinic/services/activeClinicPublicMediaService");

const ASSETS_ROOT = path.join(__dirname, "..", "public", "activeclinic", "assets");

describe("ActiveClinic Pass 6 public media", () => {
  it("maps Julflona doctors deterministically and falls back for nurse", () => {
    const banda = resolveDoctorPhoto("dr-julflona-banda");
    const mwansa = resolveDoctorPhoto("dr-julflona-mwansa");
    const nurse = resolveDoctorPhoto("nurse-julflona-tembo");
    assert.equal(banda.isFallback, false);
    assert.match(banda.src, /dr-julflona-banda\.jpg$/);
    assert.equal(mwansa.isFallback, false);
    assert.match(mwansa.src, /dr-julflona-mwansa\.jpg$/);
    assert.equal(nurse.isFallback, true);
    assert.equal(nurse.src, DOCTOR_FALLBACK);
  });

  it("uses julflona hero for julflona clinic only", () => {
    const juflona = resolveClinicHero({ clinicKey: "julflona-clinic" });
    const other = resolveClinicHero({ clinicKey: "some-other-clinic" });
    assert.match(juflona.src, /julflona-hero\.jpg$/);
    assert.equal(other.src, CLINIC_DEFAULT);
  });

  it("does not force julflona hero onto every directory card", () => {
    const a = resolveDirectoryCardImage({ clinicKey: "alpha-clinic" }, 0);
    const b = resolveDirectoryCardImage({ clinicKey: "julflona-clinic" }, 0);
    assert.match(b.src, /julflona-hero\.jpg$/);
    assert.notEqual(a.src, b.src);
  });

  it("enriches locals with consistent doctor photoUrl across list fields", () => {
    const locals = enrichPublicLocals({
      clinic: { clinicKey: "julflona-clinic", publicName: "Julflona" },
      profiles: [{ staffKey: "dr-julflona-banda", displayName: "Dr. Julflona Banda" }],
      profile: { staffKey: "dr-julflona-banda", displayName: "Dr. Julflona Banda" },
    });
    assert.equal(locals.profiles[0].photoUrl, locals.profile.photoUrl);
    assert.match(locals.clinic.websiteHeroUrl, /julflona-hero\.jpg$/);
    assert.equal(locals.platformHero.src, PLATFORM_HERO);
  });

  it("ships priority asset files on disk", () => {
    const required = [
      "clinic-hero-default.jpg",
      "clinic/julflona-hero.jpg",
      "clinic/directory-waiting.jpg",
      "clinic/directory-dental.jpg",
      "clinic/directory-lab.jpg",
      "doctors/dr-julflona-banda.jpg",
      "doctors/dr-julflona-mwansa.jpg",
      "doctors/doctor-fallback.svg",
      "platform/home-hero.jpg",
      "icons/general.svg",
      "icons/consultation.svg",
      "icons/lab.svg",
      "icons/procedure.svg",
    ];
    for (const rel of required) {
      const abs = path.join(ASSETS_ROOT, rel);
      assert.ok(fs.existsSync(abs), `missing ${rel}`);
      assert.ok(fs.statSync(abs).size > 100, `too small ${rel}`);
    }
  });
});
