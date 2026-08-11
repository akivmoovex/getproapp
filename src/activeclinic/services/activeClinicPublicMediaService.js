"use strict";

/**
 * Canonical ActiveClinic public media mappings (Stitch-backed demo assets).
 * Prefer tenant/config values when present; map demo keys deterministically.
 * Do not assign Juflona imagery to unrelated clinics.
 */

const { JULFLONA_CLINIC_KEY, DEMO_CLINIC_KEY } = require("./activeClinicDemoClinicSpec");

const DOCTOR_FALLBACK = "/activeclinic/assets/doctors/doctor-fallback.svg";
const CLINIC_DEFAULT = "/activeclinic/assets/clinic-hero-default.jpg";
const PLATFORM_HERO = "/activeclinic/assets/platform/home-hero.jpg";

/** Demo seed profileKey → approved Stitch portrait (local copies). */
const DEMO_DOCTOR_PHOTOS = Object.freeze({
  "dr-julflona-banda": {
    src: "/activeclinic/assets/doctors/dr-julflona-banda.jpg",
    objectPosition: "center 18%",
    status: "APPROVED_STITCH",
    stitchLabel: "Dr. Kabange Djemo portrait (Juflona Doctors) mapped to seeded Dr. Julflona Banda",
  },
  "dr-julflona-mwansa": {
    src: "/activeclinic/assets/doctors/dr-julflona-mwansa.jpg",
    objectPosition: "center 22%",
    status: "APPROVED_STITCH",
    stitchLabel: "Female pediatrician portrait (choose-doctor) mapped to seeded Dr. Julflona Mwansa",
  },
  // Nurse Tembo: Stitch doctors grid uses photographs for named MDs; no approved nurse photo.
  "nurse-julflona-tembo": null,
});

const DEMO_CLINIC_HEROES = Object.freeze({
  [JULFLONA_CLINIC_KEY]: {
    src: "/activeclinic/assets/clinic/julflona-hero.jpg",
    objectPosition: "center 42%",
    status: "APPROVED_STITCH",
    stitchLabel: "Juflona Home exterior",
  },
  [DEMO_CLINIC_KEY]: {
    src: "/activeclinic/assets/clinic/directory-waiting.jpg",
    objectPosition: "center center",
    status: "APPROVED_ALTERNATIVE",
    stitchLabel: "Directory waiting-room image (demo clinic)",
  },
});

/** Rotating directory card imagery for non-mapped clinics (Stitch directory set). */
const DIRECTORY_CARD_POOL = Object.freeze([
  {
    src: "/activeclinic/assets/clinic/directory-waiting.jpg",
    objectPosition: "center 40%",
    status: "APPROVED_ALTERNATIVE",
  },
  {
    src: "/activeclinic/assets/clinic/directory-dental.jpg",
    objectPosition: "center 45%",
    status: "APPROVED_ALTERNATIVE",
  },
  {
    src: "/activeclinic/assets/clinic/directory-lab.jpg",
    objectPosition: "center 40%",
    status: "APPROVED_ALTERNATIVE",
  },
]);

const SERVICE_ICON_BY_KEY = Object.freeze({
  "general-consultation": "/activeclinic/assets/icons/consultation.svg",
  "child-wellness": "/activeclinic/assets/icons/general.svg",
  "antenatal-consultation": "/activeclinic/assets/icons/consultation.svg",
  "blood-pressure-check": "/activeclinic/assets/icons/general.svg",
  "lab-sample-collection": "/activeclinic/assets/icons/lab.svg",
  "medication-review": "/activeclinic/assets/icons/general.svg",
  "follow-up-consultation": "/activeclinic/assets/icons/consultation.svg",
  "basic-lab-panel": "/activeclinic/assets/icons/lab.svg",
  "blood-pressure-series": "/activeclinic/assets/icons/procedure.svg",
});

const SERVICE_ICON_DEFAULT = "/activeclinic/assets/icons/general.svg";

function hashKey(value) {
  const s = String(value || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function resolveDoctorPhoto(profileOrKey) {
  const key =
    typeof profileOrKey === "string"
      ? profileOrKey
      : String(
          (profileOrKey && (profileOrKey.staffKey || profileOrKey.profileKey || profileOrKey.publicProfileKey)) ||
            ""
        ).trim();
  const configured =
    profileOrKey &&
    typeof profileOrKey === "object" &&
    (profileOrKey.photoUrl || profileOrKey.avatarUrl || profileOrKey.imageUrl);
  if (configured) {
    return {
      src: String(configured),
      objectPosition: "center 20%",
      status: "TENANT_CONFIGURED",
      isFallback: false,
    };
  }
  const mapped = DEMO_DOCTOR_PHOTOS[key] || null;
  if (mapped && mapped.src) {
    return { ...mapped, isFallback: false };
  }
  return {
    src: DOCTOR_FALLBACK,
    objectPosition: "center center",
    status: "FALLBACK",
    isFallback: true,
    stitchLabel: key ? `No approved photo for ${key}` : "No doctor photo key",
  };
}

function resolveClinicHero(clinic) {
  if (!clinic || typeof clinic !== "object") {
    return {
      src: CLINIC_DEFAULT,
      objectPosition: "center center",
      status: "DEFAULT",
      isFallback: true,
    };
  }
  if (clinic.websiteHeroUrl) {
    return {
      src: String(clinic.websiteHeroUrl),
      objectPosition: "center 40%",
      status: "TENANT_CONFIGURED",
      isFallback: false,
    };
  }
  const key = String(clinic.clinicKey || clinic.organizationKey || "").trim();
  const mapped = DEMO_CLINIC_HEROES[key];
  if (mapped) {
    return { ...mapped, isFallback: false };
  }
  return {
    src: CLINIC_DEFAULT,
    objectPosition: "center center",
    status: "DEFAULT",
    isFallback: true,
  };
}

function resolveDirectoryCardImage(clinic, index) {
  if (!clinic || typeof clinic !== "object") {
    return {
      src: CLINIC_DEFAULT,
      objectPosition: "center center",
      status: "DEFAULT",
      isFallback: true,
    };
  }
  if (clinic.cardImageUrl || clinic.websiteHeroUrl) {
    return {
      src: String(clinic.cardImageUrl || clinic.websiteHeroUrl),
      objectPosition: "center 40%",
      status: "TENANT_CONFIGURED",
      isFallback: false,
    };
  }
  const key = String(clinic.clinicKey || "").trim();
  if (DEMO_CLINIC_HEROES[key]) {
    return { ...DEMO_CLINIC_HEROES[key], isFallback: false };
  }
  const poolIndex = (typeof index === "number" ? index : hashKey(key)) % DIRECTORY_CARD_POOL.length;
  return { ...DIRECTORY_CARD_POOL[poolIndex], isFallback: false };
}

function resolveServiceIcon(serviceOrKey) {
  const key =
    typeof serviceOrKey === "string"
      ? serviceOrKey
      : String(
          (serviceOrKey && (serviceOrKey.serviceKey || serviceOrKey.procedureKey || serviceOrKey.key)) || ""
        ).trim();
  if (serviceOrKey && typeof serviceOrKey === "object" && serviceOrKey.iconUrl) {
    return { src: String(serviceOrKey.iconUrl), status: "TENANT_CONFIGURED", isFallback: false };
  }
  const src = SERVICE_ICON_BY_KEY[key] || SERVICE_ICON_DEFAULT;
  return {
    src,
    status: SERVICE_ICON_BY_KEY[key] ? "CANONICAL" : "FALLBACK",
    isFallback: !SERVICE_ICON_BY_KEY[key],
  };
}

function getPlatformHero() {
  return {
    src: PLATFORM_HERO,
    objectPosition: "center 35%",
    status: "APPROVED_STITCH",
    stitchLabel: "ActiveClinic platform home background (Stitch)",
    isFallback: false,
  };
}

function enrichDoctorMedia(profile) {
  if (!profile || typeof profile !== "object") return profile;
  const photo = resolveDoctorPhoto(profile);
  return {
    ...profile,
    photoUrl: photo.src,
    photoObjectPosition: photo.objectPosition,
    photoStatus: photo.status,
    photoIsFallback: Boolean(photo.isFallback),
  };
}

function enrichClinicMedia(clinic) {
  if (!clinic || typeof clinic !== "object") return clinic;
  const hero = resolveClinicHero(clinic);
  return {
    ...clinic,
    websiteHeroUrl: clinic.websiteHeroUrl || hero.src,
    heroObjectPosition: hero.objectPosition,
    heroStatus: hero.status,
  };
}

function enrichClinicCardMedia(clinic, index) {
  if (!clinic || typeof clinic !== "object") return clinic;
  const card = resolveDirectoryCardImage(clinic, index);
  return {
    ...clinic,
    cardImageUrl: clinic.cardImageUrl || card.src,
    cardObjectPosition: card.objectPosition,
    cardImageStatus: card.status,
  };
}

function enrichServiceMedia(service) {
  if (!service || typeof service !== "object") return service;
  const icon = resolveServiceIcon(service);
  return {
    ...service,
    iconUrl: service.iconUrl || icon.src,
    iconStatus: icon.status,
  };
}

/**
 * Enrich common public-page locals with media fields (idempotent).
 * @param {object} locals
 */
function enrichPublicLocals(locals) {
  const out = { ...(locals || {}) };
  if (out.clinic) out.clinic = enrichClinicMedia(out.clinic);
  if (out.profile) out.profile = enrichDoctorMedia(out.profile);
  if (Array.isArray(out.profiles)) {
    out.profiles = out.profiles.map((p) => enrichDoctorMedia(p));
  }
  if (Array.isArray(out.clinics)) {
    out.clinics = out.clinics.map((c, i) => enrichClinicCardMedia(enrichClinicMedia(c), i));
  }
  if (Array.isArray(out.services)) {
    out.services = out.services.map((s) => enrichServiceMedia(s));
  }
  if (Array.isArray(out.procedures)) {
    out.procedures = out.procedures.map((p) => enrichServiceMedia(p));
  }
  out.platformHero = out.platformHero || getPlatformHero();
  out.doctorFallbackUrl = DOCTOR_FALLBACK;
  out.clinicHeroDefaultUrl = CLINIC_DEFAULT;
  return out;
}

module.exports = {
  DOCTOR_FALLBACK,
  CLINIC_DEFAULT,
  PLATFORM_HERO,
  DEMO_DOCTOR_PHOTOS,
  DEMO_CLINIC_HEROES,
  DIRECTORY_CARD_POOL,
  resolveDoctorPhoto,
  resolveClinicHero,
  resolveDirectoryCardImage,
  resolveServiceIcon,
  getPlatformHero,
  enrichDoctorMedia,
  enrichClinicMedia,
  enrichClinicCardMedia,
  enrichServiceMedia,
  enrichPublicLocals,
};
