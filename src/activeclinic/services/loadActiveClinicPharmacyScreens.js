"use strict";

/**
 * ActiveClinic pharmacy loaders (P05).
 * Stitch screens: dashboard, catalogue, inventory, prescriptions, dispensing.
 */

const {
  listMedications,
  getMedicationById,
  listInventoryItems,
  listLowStockItems,
  listExpiringBatches,
  listPrescriptionQueue,
  getPrescriptionById,
  RESULT: PHARM_RESULT,
  PERM,
} = require("./activeClinicPharmacyService");
const {
  getPatientByOrgAndId,
} = require("./activeClinicPatientService");
const {
  formatPatientDisplayName,
} = require("./patientPrivacyHelpers");
const {
  listFacilitiesByOrganization,
} = require("./facilityService");

const PRESCRIPTION_STATUS_LABELS = Object.freeze({
  pending: "Pending",
  in_preparation: "In preparation",
  ready_for_collection: "Ready for collection",
  dispensed: "Dispensed",
  partially_dispensed: "Partially dispensed",
  cancelled: "Cancelled",
});

const STITCH = Object.freeze({
  dashboardDesktop: "4d83f5c845ae4d91b805a1dfd6a7268d",
  catalogueDesktop: "b5e534cf921d460c9774c2772ab688e9",
  medicineDetailDesktop: "20a62e6f34ef422b8262750b0fe9788a",
  addMedicineDesktop: "83495a7aea6547ce873af695fcb5f604",
  inventoryDesktop: "1f079e7d3f9c464c8754fa09a09f2626",
  inventoryMobile: "a0cb61de9f0f4eaa8d732d4cf143f090",
  batchDetailDesktop: "6c0795f36aef4fe3b634dc350d230672",
  lowStockDesktop: "553dd601642d41abb89cf4c7127c221a",
  expiryAlertsDesktop: "fcba0b2ed1334eacad9647e597f66959",
  prescriptionQueueDesktop: "5472760fda8148cf8611564236ae2247",
  prescriptionQueueMobile: "322c2b620c8e4b248fa5620881555d8b",
  prescriptionDetailDesktop: "2da2d7b7cd734161a9f8257c2256c6f3",
  prescriptionDetailMobile: "4f369d10d5654e68bf5a5c45d8ef7d78",
  dispenseDesktop: "e4d4e37c175a458d9004e1240395ba63",
  dispenseMobile: "ace4f11562b24515866b40c5594a18e6",
  dispenseReviewDesktop: "97138791742e4338a34811a6fd7e464d",
  dispenseConfirmation: "00a95c467df2414fb8c6dea108170b04",
  dispenseCompletedDesktop: "eeaf00f13f6f4e238da3aef30a556a57",
  partialDispensingDesktop: "c7c3ea1931f74acb845208dd09d0d63d",
  receiveStockDesktop: "a61dbccce82b43788dc347e25843ae07",
  stockAdjustment: "2147643a82af4fb28a8368dcff867a75",
  stockTransfer: "ce22d1c5de5f43ad8a458f57aa217fd3",
  patientInstructionsMobile: "7cffba8bdac84abda7a8d31951d1948f",
});

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

function actorFromAuth(auth) {
  return {
    staffMemberId: auth.staffMember.id,
    platformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
    organizationId: auth.organization.id,
  };
}

async function loadFacilityOptions(db, auth) {
  const listed = await listFacilitiesByOrganization(db, {
    organizationId: auth.organization.id,
  });
  const facilities = (listed.facilities || []).filter((f) =>
    ["active", "planned"].includes(f.status)
  );
  return facilities.map((f) => ({
    id: f.id,
    key: f.facilityKey,
    displayName: f.displayName,
    status: f.status,
    timezone: f.timezone,
  }));
}

async function loadActiveClinicPharmacyDashboardScreen(db, input) {
  const { auth } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", dashboard: null };
  }

  const [pendingQueue, lowStock, expiringBatches] = await Promise.all([
    listPrescriptionQueue(db, {
      staffId: auth.staffMember.id,
      organizationId: auth.organization.id,
      facilityId: selectedFacility.id,
      status: "pending",
    }),
    listLowStockItems(db, {
      staffId: auth.staffMember.id,
      organizationId: auth.organization.id,
      facilityId: selectedFacility.id,
    }),
    listExpiringBatches(db, {
      staffId: auth.staffMember.id,
      organizationId: auth.organization.id,
      facilityId: selectedFacility.id,
    }),
  ]);

  return {
    ok: true,
    dashboard: {
      facility: selectedFacility,
      stats: {
        pendingPrescriptions: (pendingQueue.ok && pendingQueue.prescriptions.length) || 0,
        lowStockCount: (lowStock.ok && lowStock.lowStockItems.length) || 0,
        expiringBatchesCount: (expiringBatches.ok && expiringBatches.expiringBatches.length) || 0,
      },
      actions: {
        canViewPharmacy: hasPerm(perms, PERM.PHARMACY_VIEW),
        canDispense: hasPerm(perms, PERM.PHARMACY_DISPENSE),
        canManageInventory: hasPerm(perms, PERM.INVENTORY_MANAGE),
      },
      stitch: {
        desktop: STITCH.dashboardDesktop,
      },
    },
  };
}

async function loadActiveClinicPharmacyCatalogueScreen(db, input) {
  const { auth } = input;
  const perms = auth.permissions || [];

  const listed = await listMedications(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    status: "active",
  });

  if (!listed.ok) {
    return { ok: false, code: listed.result, catalogue: null };
  }

  return {
    ok: true,
    catalogue: {
      medications: listed.medications,
      actions: {
        canManageInventory: hasPerm(perms, PERM.INVENTORY_MANAGE),
      },
      stitch: {
        desktop: STITCH.catalogueDesktop,
      },
    },
  };
}

async function loadActiveClinicPharmacyMedicineDetailScreen(db, input) {
  const { auth, medicationId } = input;

  const detail = await getMedicationById(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    medicationId,
  });

  if (!detail.ok) {
    return { ok: false, code: detail.result, medicineDetail: null };
  }

  return {
    ok: true,
    medicineDetail: {
      medication: detail.medication,
      stitch: {
        desktop: STITCH.medicineDetailDesktop,
      },
    },
  };
}

async function loadActiveClinicPharmacyAddMedicineScreen(db, input) {
  const { auth, values, error } = input;
  const perms = auth.permissions || [];

  return {
    ok: true,
    addMedicine: {
      values: values || {
        genericName: "",
        brandNames: "",
        strength: "",
        dosageForm: "",
        unitOfMeasure: "",
        standardCost: "",
        reorderLevel: "",
        storageConditions: "",
        notes: "",
      },
      error: error || null,
      actions: {
        canManageInventory: hasPerm(perms, PERM.INVENTORY_MANAGE),
      },
      stitch: {
        desktop: STITCH.addMedicineDesktop,
      },
    },
  };
}

async function loadActiveClinicPharmacyInventoryScreen(db, input) {
  const { auth } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", inventory: null };
  }

  const listed = await listInventoryItems(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    facilityId: selectedFacility.id,
  });

  if (!listed.ok) {
    return { ok: false, code: listed.result, inventory: null };
  }

  return {
    ok: true,
    inventory: {
      items: listed.inventoryItems,
      facility: selectedFacility,
      actions: {
        canViewInventory: hasPerm(perms, PERM.INVENTORY_VIEW),
        canManageInventory: hasPerm(perms, PERM.INVENTORY_MANAGE),
      },
      stitch: {
        desktop: STITCH.inventoryDesktop,
        mobile: STITCH.inventoryMobile,
      },
    },
  };
}

async function loadActiveClinicPharmacyLowStockScreen(db, input) {
  const { auth } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", lowStock: null };
  }

  const listed = await listLowStockItems(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    facilityId: selectedFacility.id,
  });

  if (!listed.ok) {
    return { ok: false, code: listed.result, lowStock: null };
  }

  return {
    ok: true,
    lowStock: {
      items: listed.lowStockItems,
      facility: selectedFacility,
      actions: {
        canManageInventory: hasPerm(perms, PERM.INVENTORY_MANAGE),
      },
      stitch: {
        desktop: STITCH.lowStockDesktop,
      },
    },
  };
}

async function loadActiveClinicPharmacyExpiryAlertsScreen(db, input) {
  const { auth } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", expiryAlerts: null };
  }

  const listed = await listExpiringBatches(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    facilityId: selectedFacility.id,
  });

  if (!listed.ok) {
    return { ok: false, code: listed.result, expiryAlerts: null };
  }

  return {
    ok: true,
    expiryAlerts: {
      batches: listed.expiringBatches,
      facility: selectedFacility,
      actions: {
        canManageInventory: hasPerm(perms, PERM.INVENTORY_MANAGE),
      },
      stitch: {
        desktop: STITCH.expiryAlertsDesktop,
      },
    },
  };
}

async function loadActiveClinicPharmacyPrescriptionQueueScreen(db, input) {
  const { auth, query } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", prescriptionQueue: null };
  }

  const status = (query && query.status) || "pending";
  const listed = await listPrescriptionQueue(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    facilityId: selectedFacility.id,
    status,
  });

  if (!listed.ok) {
    return { ok: false, code: listed.result, prescriptionQueue: null };
  }

  const prescriptions = listed.prescriptions.map((p) => ({
    ...p,
    statusLabel: PRESCRIPTION_STATUS_LABELS[p.status] || p.status,
  }));

  return {
    ok: true,
    prescriptionQueue: {
      prescriptions,
      facility: selectedFacility,
      currentStatus: status,
      actions: {
        canViewPharmacy: hasPerm(perms, PERM.PHARMACY_VIEW),
        canDispense: hasPerm(perms, PERM.PHARMACY_DISPENSE),
        canReview: hasPerm(perms, PERM.PHARMACY_REVIEW),
      },
      stitch: {
        desktop: STITCH.prescriptionQueueDesktop,
        mobile: STITCH.prescriptionQueueMobile,
      },
    },
  };
}

async function loadActiveClinicPharmacyPrescriptionDetailScreen(db, input) {
  const { auth, prescriptionId } = input;
  const perms = auth.permissions || [];

  const detail = await getPrescriptionById(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    prescriptionId,
  });

  if (!detail.ok) {
    return { ok: false, code: detail.result, prescriptionDetail: null };
  }

  return {
    ok: true,
    prescriptionDetail: {
      prescription: {
        ...detail.prescription,
        statusLabel: PRESCRIPTION_STATUS_LABELS[detail.prescription.status] || detail.prescription.status,
      },
      items: detail.items,
      actions: {
        canDispense: hasPerm(perms, PERM.PHARMACY_DISPENSE),
        canReview: hasPerm(perms, PERM.PHARMACY_REVIEW),
      },
      stitch: {
        desktop: STITCH.prescriptionDetailDesktop,
        mobile: STITCH.prescriptionDetailMobile,
      },
    },
  };
}

async function loadActiveClinicPharmacyDispenseScreen(db, input) {
  const { auth, prescriptionId, error } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", dispense: null };
  }

  const detail = await getPrescriptionById(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    prescriptionId,
  });

  if (!detail.ok) {
    return { ok: false, code: detail.result, dispense: null };
  }

  const inventory = await listInventoryItems(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    facilityId: selectedFacility.id,
  });

  return {
    ok: true,
    dispense: {
      prescription: detail.prescription,
      items: detail.items,
      availableInventory: inventory.ok ? inventory.inventoryItems : [],
      error: error || null,
      facility: selectedFacility,
      actions: {
        canDispense: hasPerm(perms, PERM.PHARMACY_DISPENSE),
      },
      stitch: {
        desktop: STITCH.dispenseDesktop,
        mobile: STITCH.dispenseMobile,
      },
    },
  };
}

async function loadActiveClinicPharmacyReceiveStockScreen(db, input) {
  const { auth, values, error } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", receiveStock: null };
  }

  const medications = await listMedications(db, {
    staffId: auth.staffMember.id,
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    status: "active",
  });

  return {
    ok: true,
    receiveStock: {
      values: values || {
        medicationCatalogueItemId: "",
        batchNumber: "",
        quantity: "",
        expiryDate: "",
        manufactureDate: "",
        supplierName: "",
        costPerUnit: "",
      },
      medications: medications.ok ? medications.medications : [],
      error: error || null,
      facility: selectedFacility,
      actions: {
        canManageInventory: hasPerm(perms, PERM.INVENTORY_MANAGE),
      },
      stitch: {
        desktop: STITCH.receiveStockDesktop,
      },
    },
  };
}

module.exports = {
  STITCH,
  PRESCRIPTION_STATUS_LABELS,
  actorFromAuth,
  loadActiveClinicPharmacyDashboardScreen,
  loadActiveClinicPharmacyCatalogueScreen,
  loadActiveClinicPharmacyMedicineDetailScreen,
  loadActiveClinicPharmacyAddMedicineScreen,
  loadActiveClinicPharmacyInventoryScreen,
  loadActiveClinicPharmacyLowStockScreen,
  loadActiveClinicPharmacyExpiryAlertsScreen,
  loadActiveClinicPharmacyPrescriptionQueueScreen,
  loadActiveClinicPharmacyPrescriptionDetailScreen,
  loadActiveClinicPharmacyDispenseScreen,
  loadActiveClinicPharmacyReceiveStockScreen,
};
