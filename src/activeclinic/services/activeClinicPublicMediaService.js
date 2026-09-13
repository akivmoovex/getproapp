"use strict";

/**
 * Canonical ActiveClinic public media mappings (Stitch-backed demo assets).
 * Prefer tenant/config values when present; map demo keys deterministically.
 * Do not assign Juflona imagery to unrelated clinics.
 * Runtime srcs are presented via the shared CDN layer (never /activeclinic/assets/).
 */

const { JULFLONA_CLINIC_KEY, DEMO_CLINIC_KEY } = require("./activeClinicDemoClinicSpec");
const { attachClinicPublicWebsitePaths } = require("../../platform/website/publicWebsiteUrl");
const {
  presentRuntimeImageSrc,
  cdnMarketingAsset,
} = require("../../platform/media/cdnMediaPresentation");

const DOCTOR_FALLBACK_PATH = "/activeclinic/assets/doctors/doctor-fallback.svg";
const CLINIC_DEFAULT_PATH = "/activeclinic/assets/clinic-hero-default.jpg";
const PLATFORM_HERO_PATH = "/activeclinic/assets/platform/home-hero.jpg";

function presentPath(publicPath, env) {
  if (!publicPath) return null;
  return (
    cdnMarketingAsset(publicPath, env) || presentRuntimeImageSrc(publicPath, env) || null
  );
}

/** Demo seed profileKey → approved Stitch portrait (CDN-backed copies). */
const DEMO_DOCTOR_PHOTOS = Object.freeze({
  "dr-julflona-banda": {
    path: "/activeclinic/assets/doctors/dr-julflona-banda.jpg",
    objectPosition: "center 18%",
    status: "APPROVED_STITCH",
    stitchLabel: "Dr. Kabange Djemo portrait (Juflona Doctors) mapped to seeded Dr. Julflona Banda",
  },
  "dr-julflona-mwansa": {
    path: "/activeclinic/assets/doctors/dr-julflona-mwansa.jpg",
    objectPosition: "center 22%",
    status: "APPROVED_STITCH",
    stitchLabel: "Female pediatrician portrait (choose-doctor) mapped to seeded Dr. Julflona Mwansa",
  },
  "nurse-julflona-tembo": null,
});

const DEMO_CLINIC_HEROES = Object.freeze({
  [JULFLONA_CLINIC_KEY]: {
    path: "/activeclinic/assets/clinic/julflona-hero.jpg",
    objectPosition: "center 42%",
    status: "APPROVED_STITCH",
    stitchLabel: "Juflona Home exterior",
  },
  [DEMO_CLINIC_KEY]: {
    path: "/activeclinic/assets/clinic/directory-waiting.jpg",
    objectPosition: "center center",
    status: "APPROVED_ALTERNATIVE",
    stitchLabel: "Directory waiting-room image (demo clinic)",
  },
});

const DIRECTORY_CARD_POOL = Object.freeze([
  {
    path: "/activeclinic/assets/clinic/directory-waiting.jpg",
    objectPosition: "center 40%",
    status: "APPROVED_ALTERNATIVE",
  },
  {
    path: "/activeclinic/assets/clinic/directory-dental.jpg",
    objectPosition: "center 45%",
    status: "APPROVED_ALTERNATIVE",
  },
  {
    path: "/activeclinic/assets/clinic/directory-lab.jpg",
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

const SERVICE_ICON_DEFAULT_PATH = "/activeclinic/assets/icons/general.svg";

function hashKey(value) {
  const s = String(value || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function resolveDoctorPhoto(profileOrKey, env) {
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
      src: presentRuntimeImageSrc(String(configured), env),
      objectPosition: "center 20%",
      status: "TENANT_CONFIGURED",
      isFallback: false,
    };
  }
  const mapped = DEMO_DOCTOR_PHOTOS[key] || null;
  if (mapped && mapped.path) {
    return {
      src: presentPath(mapped.path, env),
      objectPosition: mapped.objectPosition,
      status: mapped.status,
      stitchLabel: mapped.stitchLabel,
      isFallback: false,
    };
  }
  return {
    src: presentPath(DOCTOR_FALLBACK_PATH, env),
    objectPosition: "center center",
    status: "FALLBACK",
    isFallback: true,
    stitchLabel: key ? `No approved photo for ${key}` : "No doctor photo key",
  };
}

function resolveClinicHero(clinic, env) {
  if (!clinic || typeof clinic !== "object") {
    return {
      src: null,
      objectPosition: "center center",
      status: "DEFAULT",
      isFallback: true,
    };
  }
  if (clinic.websiteHeroUrl) {
    return {
      src: presentRuntimeImageSrc(String(clinic.websiteHeroUrl), env),
      objectPosition: "center 40%",
      status: "TENANT_CONFIGURED",
      isFallback: false,
    };
  }
  const key = String(clinic.clinicKey || clinic.organizationKey || "").trim();
  const mapped = DEMO_CLINIC_HEROES[key];
  if (mapped) {
    return {
      src: presentPath(mapped.path, env),
      objectPosition: mapped.objectPosition,
      status: mapped.status,
      stitchLabel: mapped.stitchLabel,
      isFallback: false,
    };
  }
  // No hardcoded local tenant default — empty until the clinic uploads.
  return {
    src: null,
    objectPosition: "center center",
    status: "DEFAULT",
    isFallback: true,
  };
}

function resolveDirectoryCardImage(clinic, index, env) {
  if (!clinic || typeof clinic !== "object") {
    return {
      src: null,
      objectPosition: "center center",
      status: "DEFAULT",
      isFallback: true,
    };
  }
  if (clinic.cardImageUrl || clinic.websiteHeroUrl) {
    return {
      src: presentRuntimeImageSrc(String(clinic.cardImageUrl || clinic.websiteHeroUrl), env),
      objectPosition: "center 40%",
      status: "TENANT_CONFIGURED",
      isFallback: false,
    };
  }
  const key = String(clinic.clinicKey || "").trim();
  if (DEMO_CLINIC_HEROES[key]) {
    const mapped = DEMO_CLINIC_HEROES[key];
    return {
      src: presentPath(mapped.path, env),
      objectPosition: mapped.objectPosition,
      status: mapped.status,
      isFallback: false,
    };
  }
  const poolIndex = (typeof index === "number" ? index : hashKey(key)) % DIRECTORY_CARD_POOL.length;
  const card = DIRECTORY_CARD_POOL[poolIndex];
  return {
    src: presentPath(card.path, env),
    objectPosition: card.objectPosition,
    status: card.status,
    isFallback: false,
  };
}

function resolveServiceIcon(serviceOrKey, env) {
  const key =
    typeof serviceOrKey === "string"
      ? serviceOrKey
      : String(
          (serviceOrKey && (serviceOrKey.serviceKey || serviceOrKey.procedureKey || serviceOrKey.key)) || ""
        ).trim();
  if (serviceOrKey && typeof serviceOrKey === "object" && serviceOrKey.iconUrl) {
    return {
      src: presentRuntimeImageSrc(String(serviceOrKey.iconUrl), env),
      status: "TENANT_CONFIGURED",
      isFallback: false,
    };
  }
  const path = SERVICE_ICON_BY_KEY[key] || SERVICE_ICON_DEFAULT_PATH;
  return {
    src: presentPath(path, env),
    status: SERVICE_ICON_BY_KEY[key] ? "CANONICAL" : "FALLBACK",
    isFallback: !SERVICE_ICON_BY_KEY[key],
  };
}

function getPlatformHero(env) {
  return {
    src: presentPath(PLATFORM_HERO_PATH, env),
    objectPosition: "center 35%",
    status: "APPROVED_STITCH",
    stitchLabel: "ActiveClinic platform home background (Stitch)",
    isFallback: false,
  };
}

function enrichDoctorMedia(profile, env) {
  if (!profile || typeof profile !== "object") return profile;
  const photo = resolveDoctorPhoto(profile, env);
  return {
    ...profile,
    photoUrl: photo.src,
    photoObjectPosition: photo.objectPosition,
    photoStatus: photo.status,
    photoIsFallback: Boolean(photo.isFallback),
  };
}

function enrichClinicMedia(clinic, env) {
  if (!clinic || typeof clinic !== "object") return clinic;
  const hero = resolveClinicHero(clinic, env);
  return attachClinicPublicWebsitePaths({
    ...clinic,
    websiteHeroUrl: clinic.websiteHeroUrl
      ? presentRuntimeImageSrc(String(clinic.websiteHeroUrl), env)
      : hero.src,
    heroObjectPosition: hero.objectPosition,
    heroStatus: hero.status,
  });
}

function enrichClinicCardMedia(clinic, index, env) {
  if (!clinic || typeof clinic !== "object") return clinic;
  const card = resolveDirectoryCardImage(clinic, index, env);
  return {
    ...clinic,
    cardImageUrl: clinic.cardImageUrl
      ? presentRuntimeImageSrc(String(clinic.cardImageUrl), env)
      : card.src,
    cardObjectPosition: card.objectPosition,
    cardImageStatus: card.status,
  };
}

function enrichServiceMedia(service, env) {
  if (!service || typeof service !== "object") return service;
  const icon = resolveServiceIcon(service, env);
  return {
    ...service,
    iconUrl: service.iconUrl ? presentRuntimeImageSrc(String(service.iconUrl), env) : icon.src,
    iconStatus: icon.status,
  };
}

/**
 * Enrich common public-page locals with media fields (idempotent).
 * @param {object} locals
 * @param {NodeJS.ProcessEnv} [env]
 */
function enrichPublicLocals(locals, env = process.env) {
  const out = { ...(locals || {}) };
  if (out.clinic) out.clinic = enrichClinicMedia(out.clinic, env);
  if (out.profile) out.profile = enrichDoctorMedia(out.profile, env);
  if (Array.isArray(out.profiles)) {
    out.profiles = out.profiles.map((p) => enrichDoctorMedia(p, env));
  }
  if (Array.isArray(out.clinics)) {
    out.clinics = out.clinics.map((c, i) =>
      enrichClinicCardMedia(enrichClinicMedia(c, env), i, env)
    );
  }
  if (Array.isArray(out.services)) {
    out.services = out.services.map((s) => enrichServiceMedia(s, env));
  }
  if (Array.isArray(out.procedures)) {
    out.procedures = out.procedures.map((p) => enrichServiceMedia(p, env));
  }
  out.platformHero = out.platformHero || getPlatformHero(env);
  out.doctorFallbackUrl =
    out.doctorFallbackUrl || presentPath(DOCTOR_FALLBACK_PATH, env) || DOCTOR_FALLBACK_PATH;
  out.clinicHeroDefaultUrl =
    out.clinicHeroDefaultUrl || presentPath(CLINIC_DEFAULT_PATH, env) || CLINIC_DEFAULT_PATH;
  return out;
}

module.exports = {
  DOCTOR_FALLBACK: DOCTOR_FALLBACK_PATH,
  CLINIC_DEFAULT: CLINIC_DEFAULT_PATH,
  PLATFORM_HERO: PLATFORM_HERO_PATH,
  DEMO_DOCTOR_PHOTOS,
  DEMO_CLINIC_HEROES,
  DIRECTORY_CARD_POOL,
  SERVICE_ICON_BY_KEY,
  SERVICE_ICON_DEFAULT: SERVICE_ICON_DEFAULT_PATH,
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
  presentPath,
};
