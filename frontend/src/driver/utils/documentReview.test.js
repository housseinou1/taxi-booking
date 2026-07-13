import {
  DOCUMENT_EXPIRATION_ALERT_DAYS,
  driverDocumentsBlockOnline,
  driverNeedsDocumentAlert,
  getDriverDocumentsAlertLevel,
  getDocumentMenuStatusLabel,
  getExpiringSoonDocuments,
  getRequiredDocumentExpirationStatus,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
} from "./documentReview";

describe("document expiration alert UX", () => {
  const future = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  test("no alert when every required document expires in more than 15 days", () => {
    const profile = {
      documents_alert_level: null,
      missing_document_types: [],
      expired_document_types: [],
      expiring_soon_documents: [],
    };

    expect(getDriverDocumentsAlertLevel(profile)).toBeNull();
    expect(driverNeedsDocumentAlert(profile)).toBe(false);
    expect(driverDocumentsBlockOnline(profile)).toBe(false);
  });

  test("orange warning when a required document expires within 15 days", () => {
    const profile = {
      documents_alert_level: "warning",
      expiring_soon_documents: [{ document_type: "license", days_remaining: 10 }],
      missing_document_types: [],
      expired_document_types: [],
    };

    expect(getDriverDocumentsAlertLevel(profile)).toBe("warning");
    expect(driverNeedsDocumentAlert(profile)).toBe(true);
    expect(driverDocumentsBlockOnline(profile)).toBe(false);
  });

  test("does not block online when plate photo is satisfied by vehicle plate", () => {
    const profile = {
      missing_document_types: ["plate_number_photo"],
      expired_document_types: [],
      plate_number: "TEMP-PLATE",
      vehicle_plate: "TEMP-PLATE",
    };

    expect(getDriverDocumentsAlertLevel(profile)).toBeNull();
    expect(driverDocumentsBlockOnline(profile)).toBe(false);
  });

  test("red error and online block when a required document is expired", () => {
    const profile = {
      documents_alert_level: "error",
      documents_block_online: true,
      expired_document_types: ["insurance"],
      missing_document_types: [],
    };

    expect(getDriverDocumentsAlertLevel(profile)).toBe("error");
    expect(driverDocumentsBlockOnline(profile)).toBe(true);
  });

  test("ignores optional documents for expiring-soon detection", () => {
    const documents = [
      {
        document_type: "vehicle_registration",
        status: "approved",
        expires_at: future(5),
        days_until_expiry: 5,
      },
      {
        document_type: "license",
        status: "approved",
        expires_at: future(40),
        days_until_expiry: 40,
      },
    ];

    expect(getExpiringSoonDocuments(documents, [
      { key: "vehicle_registration", label: "Vehicle Registration", required: false },
    ])).toEqual([]);
  });

  test("getRequiredDocumentExpirationStatus uses days_until_expiration threshold", () => {
    expect(
      getRequiredDocumentExpirationStatus(
        { status: "approved", days_until_expiry: DOCUMENT_EXPIRATION_ALERT_DAYS },
        { required: true }
      )
    ).toBe("expiring_soon");

    expect(
      getRequiredDocumentExpirationStatus(
        { status: "approved", days_until_expiry: DOCUMENT_EXPIRATION_ALERT_DAYS + 1 },
        { required: true }
      )
    ).toBe("valid");

    expect(
      getRequiredDocumentExpirationStatus(
        { status: "approved", days_until_expiry: -1 },
        { required: true }
      )
    ).toBe("expired");
  });

  test("menu labels match product copy", () => {
    expect(getDocumentMenuStatusLabel("valid")).toBe("✓ Valid");
    expect(getDocumentMenuStatusLabel("expiring_soon")).toBe("⚠ Expiring Soon");
    expect(getDocumentMenuStatusLabel("expired")).toBe("● Expired");
  });

  test("computes expiring soon from documents list", () => {
    const documents = [
      {
        document_type: "license",
        status: "approved",
        expires_at: future(8),
        days_until_expiry: 8,
      },
    ];

    const soon = getExpiringSoonDocuments(documents, REQUIRED_DRIVER_DOCUMENT_TYPES);
    expect(soon).toHaveLength(1);
    expect(soon[0]).toMatchObject({ key: "license", days_remaining: 8 });
  });
});
