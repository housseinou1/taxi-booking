import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { isDeliveryUberUI } from "../native/platform";
import DeliveryCourierOnboardingDocCard from "./components/DeliveryCourierOnboardingDocCard";
import DeliveryCourierProfilePhotoField from "./components/DeliveryCourierProfilePhotoField";
import DeliveryCourierTypeSelect from "./components/DeliveryCourierTypeSelect";
import { fetchLegalStatus } from "../legal/legalApi";
import { LEGAL_VERSION } from "../legal/legalVersions";
import {
  getRequiredCourierDocumentTypes,
  buildDocumentMap,
  isBicycleCourier,
  isMotorVehicleCourier,
  validateDeliveryDocumentFile,
} from "./deliveryDocumentReview";
import { getDeliveryVehicleIcon, getDeliveryVehicleLabel } from "./deliveryVehicleTypes";
import { DeliveryUberPage } from "./DeliveryUberLayout";
import { apiRequest } from "./DeliveryShared";
import "./delivery-uber.css";
import "./delivery-customer-dashboard.css";
import "./delivery-courier-onboarding.css";
import "./DeliveryCourierTermsPage.css";

const TOTAL_STEPS = 4;
const PROFILE_SAVE_TIMEOUT_MS = 30000;
const PROFILE_PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const STEPPER_ITEMS = [
  { id: "type", label: "Courier type" },
  { id: "personal", label: "Personal info" },
  { id: "vehicle", label: "Vehicle info" },
  { id: "documents", label: "Documents" },
];

const emptyPersonal = {
  full_name: "",
  email: "",
  phone_number: "",
  city: "",
};

const emptyVehicle = {
  vehicle_make: "",
  vehicle_model: "",
  vehicle_color: "",
  plate_number: "",
};

function getVehicleLabels(deliveryVehicleType) {
  if (deliveryVehicleType === "motorcycle") {
    return {
      title: "Motorcycle information",
      subtitle: "Tell us about your motorcycle.",
      make: "Make",
      model: "Model",
      color: "Color",
    };
  }
  return {
    title: "Vehicle information",
    subtitle: "Tell us about your car or van.",
    make: "Make",
    model: "Model",
    color: "Color",
  };
}

function buildStepFlow(deliveryVehicleType) {
  const flow = ["type", "personal"];
  if (isMotorVehicleCourier(deliveryVehicleType)) flow.push("vehicle");
  flow.push("documents", "review");
  return flow;
}

function splitFullName(fullName = "") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" ") || "",
  };
}

function getRequestErrorMessage(err, fallback) {
  const details = err?.response?.data;
  const apiMessage =
    details?.error ||
    details?.detail ||
    (Array.isArray(details?.profile_picture) ? details.profile_picture.join(" ") : "") ||
    (Array.isArray(details?.phone_number) ? details.phone_number.join(" ") : "") ||
    (Array.isArray(details?.email) ? details.email.join(" ") : "");

  if (apiMessage) return apiMessage;
  if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "")) {
    return "Saving took too long. Check your internet connection and try again.";
  }
  if (/Failed to fetch|NetworkError|Network request failed/i.test(err?.message || "")) {
    return "Cannot reach the Yala Delivery server. Check the backend connection and try again.";
  }
  return err?.message || fallback;
}

function validateProfilePhoto(file) {
  if (!file) return "";
  if (file.size > PROFILE_PHOTO_MAX_SIZE_BYTES) {
    return "Profile photo is too large. Please choose an image under 5 MB.";
  }
  if (file.type && !PROFILE_PHOTO_TYPES.includes(file.type)) {
    return "Profile photo must be JPEG, PNG, or WebP.";
  }
  return "";
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = PROFILE_SAVE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.error || `Request failed (HTTP ${response.status}).`);
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Saving took too long. Check your internet connection and try again.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

function isStepComplete(steps, id) {
  return Boolean(steps.find((step) => step.id === id)?.complete);
}

function resolveInitialStepIndex(onboarding, deliveryVehicleType) {
  if (onboarding.driver_status === "pending_review") return -1;
  const flow = buildStepFlow(deliveryVehicleType);
  const steps = onboarding.steps || [];
  if (!isStepComplete(steps, "courier_type")) return flow.indexOf("type");
  if (!isStepComplete(steps, "profile")) return flow.indexOf("personal");
  if (isMotorVehicleCourier(deliveryVehicleType) && !isStepComplete(steps, "vehicle")) {
    return flow.indexOf("vehicle");
  }
  if (!isStepComplete(steps, "documents")) return flow.indexOf("documents");
  return flow.indexOf("review");
}

function getDisplayStepNumber(stepId) {
  const map = { type: 1, personal: 2, vehicle: 3, documents: 4 };
  return map[stepId] || TOTAL_STEPS;
}

function getStepTitle(stepId, deliveryVehicleType) {
  if (stepId === "type") return "Choose courier type";
  if (stepId === "personal") return "Personal information";
  if (stepId === "vehicle") {
    return deliveryVehicleType === "motorcycle" ? "Motorcycle information" : "Vehicle information";
  }
  if (stepId === "documents") return "Upload documents";
  if (stepId === "review") return "Review application";
  return "Delivery profile setup";
}

function getStepSubtitle(stepId, deliveryVehicleType) {
  if (stepId === "type") return "Select how you will deliver with Yala Delivery.";
  if (stepId === "personal") return "Add your name, contact details, city, and profile photo.";
  if (stepId === "vehicle") {
    return deliveryVehicleType === "motorcycle"
      ? "Add the motorcycle details customers and admins need to verify."
      : "Add the vehicle details customers and admins need to verify.";
  }
  if (stepId === "documents") {
    return isBicycleCourier(deliveryVehicleType)
      ? "Bicycle couriers only need a National ID."
      : "Upload your identity, license, insurance, and registration documents.";
  }
  if (stepId === "review") return "Confirm everything before sending your application to admin.";
  return "";
}

export default function DeliveryCourierProfileSetup() {
  const [stepIndex, setStepIndex] = useState(0);
  const [deliveryVehicleType, setDeliveryVehicleType] = useState("");
  const [personal, setPersonal] = useState(emptyPersonal);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState("");
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [documents, setDocuments] = useState([]);
  const [cities, setCities] = useState([]);
  const [signatureStatus, setSignatureStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [uploadingType, setUploadingType] = useState("");
  const [uploadProgress, setUploadProgress] = useState({});
  const [pendingDocPreviews, setPendingDocPreviews] = useState({});
  const fileInputRef = useRef(null);
  const selectedDocTypeRef = useRef("");

  useEffect(() => {
    fetchLegalStatus()
      .then((data) => setSignatureStatus(data?.courier || null))
      .catch(() => {});
  }, []);

  const token = localStorage.getItem("access");
  const uberUI = isDeliveryUberUI();
  const stepFlow = useMemo(() => buildStepFlow(deliveryVehicleType), [deliveryVehicleType]);
  const currentStepId = stepFlow[stepIndex] || "type";
  const documentTypes = useMemo(
    () => getRequiredCourierDocumentTypes(deliveryVehicleType || "motorcycle"),
    [deliveryVehicleType]
  );
  const requiresVehicleFields = isMotorVehicleCourier(deliveryVehicleType);
  const vehicleLabels = getVehicleLabels(deliveryVehicleType);
  const displayStepNumber = getDisplayStepNumber(currentStepId);
  const progressPercent = showSuccess
    ? 100
    : Math.round((displayStepNumber / TOTAL_STEPS) * 100);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const loadInitialState = useCallback(async () => {
    if (!token) {
      window.location.href = "/login?next=/delivery/profile-setup";
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [onboarding, profileResponse, cityResponse, documentsResponse] = await Promise.all([
        apiRequest(`${API_URL}/deliveries/courier/onboarding/`),
        axios.get(`${API_URL}/drivers/me/`, { headers: authHeaders }),
        axios.get(`${API_URL}/cities/`),
        axios.get(`${API_URL}/drivers/me/documents/?context=delivery`, { headers: authHeaders }),
      ]);

      const profile = profileResponse.data || {};
      const user = profile.user || {};
      const vehicleType = onboarding.delivery_vehicle_type || "";
      const groupedCities = cityResponse.data?.results || cityResponse.data || [];
      const availableCities = groupedCities.flatMap((region) => region.cities || []);
      const currentCityName = user.city_name || profile.city_name || "";
      const currentCity = availableCities.find(
        (city) => String(city.name).toLowerCase() === String(currentCityName).toLowerCase()
      );
      const firstName = user.first_name || profile.first_name || "";
      const lastName = user.last_name || profile.last_name || "";

      setDeliveryVehicleType(vehicleType);
      setPersonal({
        full_name: [firstName, lastName].filter(Boolean).join(" "),
        email: user.email || profile.email || "",
        phone_number: user.phone_number || profile.phone_number || "",
        city: String(user.city_id || profile.city_id || currentCity?.id || ""),
      });
      setExistingPhotoUrl(
        user.profile_picture || profile.profile_picture || profile.driver_photo || ""
      );
      setVehicle({
        vehicle_make: profile.vehicle_make || "",
        vehicle_model: profile.vehicle_model || "",
        vehicle_color: profile.vehicle_color || "",
        plate_number: profile.plate_number || profile.vehicle_plate || "",
      });
      setDocuments(documentsResponse.data?.documents || []);
      setCities(availableCities);

      if (onboarding.driver_status === "pending_review") {
        setShowSuccess(true);
      } else {
        const initialIndex = resolveInitialStepIndex(onboarding, vehicleType);
        setStepIndex(initialIndex >= 0 ? initialIndex : 0);
      }
    } catch (err) {
      setError(err.message || "Could not load profile setup.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token]);

  useEffect(() => {
    loadInitialState();
  }, [loadInitialState]);

  useEffect(() => {
    if (stepIndex >= stepFlow.length) {
      setStepIndex(Math.max(stepFlow.length - 1, 0));
    }
  }, [stepFlow, stepIndex]);

  const updatePersonal = (event) => {
    const { name, value } = event.target;
    setPersonal((current) => ({ ...current, [name]: value }));
  };

  const updateVehicle = (event) => {
    const { name, value } = event.target;
    setVehicle((current) => ({ ...current, [name]: value }));
  };

  const saveCourierType = async () => {
    if (!deliveryVehicleType) {
      setError("Select bicycle, motorcycle, or vehicle/car to continue.");
      return false;
    }

    setSaving(true);
    setError("");
    try {
      await axios.patch(
        `${API_URL}/deliveries/driver/mode/`,
        { delivery_vehicle_type: deliveryVehicleType },
        { headers: { ...authHeaders, "Content-Type": "application/json" } }
      );
      return true;
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Could not save courier type.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const savePersonalInfo = async () => {
    const { first_name, last_name } = splitFullName(personal.full_name);
    if (!first_name) {
      setError("Enter your full name.");
      return false;
    }
    if (!personal.email.trim()) {
      setError("Email is required.");
      return false;
    }
    if (!personal.phone_number.trim()) {
      setError("Phone number is required.");
      return false;
    }
    if (!personal.city) {
      setError("Select your city.");
      return false;
    }
    if (!profilePhoto && !existingPhotoUrl) {
      setError("Profile photo is required.");
      return false;
    }
    const photoError = validateProfilePhoto(profilePhoto);
    if (photoError) {
      setError(photoError);
      return false;
    }

    setSaving(true);
    setError("");
    try {
      const identity = new FormData();
      identity.append("first_name", first_name);
      identity.append("last_name", last_name);
      identity.append("email", personal.email.trim());
      identity.append("phone_number", personal.phone_number.trim());
      identity.append("city", personal.city);
      if (profilePhoto) {
        identity.append("profile_picture", profilePhoto);
      }

      const identityResponse = await axios.patch(`${API_URL}/auth/identity/update/`, identity, {
        headers: authHeaders,
        timeout: PROFILE_SAVE_TIMEOUT_MS,
      });
      const updatedPhotoUrl = identityResponse.data?.user?.profile_picture || "";
      if (updatedPhotoUrl) {
        setExistingPhotoUrl(updatedPhotoUrl);
        setProfilePhoto(null);
      }

      if (isBicycleCourier(deliveryVehicleType)) {
        const body = new FormData();
        body.append("delivery_vehicle_type", deliveryVehicleType);
        body.append("phone_number", personal.phone_number.trim());
        await fetchJsonWithTimeout(`${API_URL}/deliveries/courier/vehicle-setup/`, {
          method: "POST",
          headers: authHeaders,
          body,
        });
      }
      return true;
    } catch (err) {
      setError(getRequestErrorMessage(err, "Could not save personal information."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveVehicleInfo = async () => {
    if (!vehicle.vehicle_make.trim() || !vehicle.vehicle_model.trim()) {
      setError("Enter the make and model.");
      return false;
    }
    if (!vehicle.vehicle_color.trim()) {
      setError("Color is required.");
      return false;
    }
    if (!vehicle.plate_number.trim()) {
      setError("Plate number is required.");
      return false;
    }

    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      body.append("delivery_vehicle_type", deliveryVehicleType);
      body.append("phone_number", personal.phone_number.trim());
      body.append("vehicle_make", vehicle.vehicle_make.trim());
      body.append("vehicle_model", vehicle.vehicle_model.trim());
      body.append("vehicle_color", vehicle.vehicle_color.trim());
      body.append("plate_number", vehicle.plate_number.trim());

      await fetchJsonWithTimeout(`${API_URL}/deliveries/courier/vehicle-setup/`, {
        method: "POST",
        headers: authHeaders,
        body,
      });
      return true;
    } catch (err) {
      setError(getRequestErrorMessage(err, "Could not save vehicle information."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const refreshDocuments = async () => {
    const response = await axios.get(`${API_URL}/drivers/me/documents/?context=delivery`, {
      headers: authHeaders,
    });
    setDocuments(response.data?.documents || []);
  };

  const handleDocumentPick = (docTypeKey) => {
    selectedDocTypeRef.current = docTypeKey;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleDocumentSelected = async (event) => {
    const file = event.target.files?.[0];
    const docTypeKey = selectedDocTypeRef.current;
    if (!file || !docTypeKey) return;

    const validation = validateDeliveryDocumentFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    const docType = documentTypes.find((item) => item.key === docTypeKey);
    if (docType?.imageOnly) {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      if (ext === ".pdf" || file.type === "application/pdf") {
        setError("This document must be an image (JPEG or PNG).");
        return;
      }
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingDocPreviews((current) => ({ ...current, [docTypeKey]: previewUrl }));
    setUploadingType(docTypeKey);
    setUploadProgress((current) => ({ ...current, [docTypeKey]: 0 }));
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", docTypeKey);
      await axios.post(`${API_URL}/drivers/me/documents/upload/`, formData, {
        headers: { ...authHeaders, "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size || 1;
          const percent = Math.min(100, Math.round((progressEvent.loaded * 100) / total));
          setUploadProgress((current) => ({ ...current, [docTypeKey]: percent }));
        },
      });
      await refreshDocuments();
      setNotice(`${docType?.label || "Document"} uploaded.`);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Upload failed.");
      URL.revokeObjectURL(previewUrl);
      setPendingDocPreviews((current) => {
        const next = { ...current };
        delete next[docTypeKey];
        return next;
      });
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingType("");
      setUploadProgress((current) => {
        const next = { ...current };
        delete next[docTypeKey];
        return next;
      });
      setPendingDocPreviews((current) => {
        const next = { ...current };
        delete next[docTypeKey];
        return next;
      });
    }
  };

  const submitApplication = async () => {
    if (!signatureStatus?.signature_complete) {
      setError("Complete your electronic signature before submitting your application.");
      return false;
    }

    setSaving(true);
    setError("");
    try {
      await fetchJsonWithTimeout(`${API_URL}/deliveries/courier/profile-setup/submit/`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          terms_accepted: true,
          terms_version: LEGAL_VERSION.courier,
        }),
      });
      setShowSuccess(true);
      setNotice("");
      return true;
    } catch (err) {
      setError(getRequestErrorMessage(err, "Could not submit application."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    setNotice("");
    let ok = true;

    if (currentStepId === "type") ok = await saveCourierType();
    else if (currentStepId === "personal") ok = await savePersonalInfo();
    else if (currentStepId === "vehicle") ok = await saveVehicleInfo();
    else if (currentStepId === "review") {
      await submitApplication();
      return;
    }

    if (!ok) return;
    setStepIndex((current) => Math.min(current + 1, stepFlow.length - 1));
  };

  const goBack = () => {
    setError("");
    setNotice("");
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const uploadedMap = useMemo(() => buildDocumentMap(documents), [documents]);

  const allRequiredDocumentsUploaded = documentTypes.every((docType) => {
    const uploaded = uploadedMap[docType.key];
    return uploaded && uploaded.status !== "rejected";
  });

  const documentsUploadPercent = useMemo(() => {
    if (!documentTypes.length) return 0;
    const uploadedCount = documentTypes.filter((docType) => {
      const uploaded = uploadedMap[docType.key];
      return uploaded && uploaded.status !== "rejected";
    }).length;
    return Math.round((uploadedCount / documentTypes.length) * 100);
  }, [documentTypes, uploadedMap]);

  const selectedCityName =
    cities.find((city) => String(city.id) === String(personal.city))?.name || "";

  const renderStepper = () => (
    <div className="delivery-courier-stepper" aria-label="Onboarding progress">
      <div className="delivery-courier-stepper__meta">
        <span className="delivery-courier-stepper__count">
          {showSuccess
            ? "Complete"
            : currentStepId === "review"
              ? "Review"
              : `Step ${displayStepNumber} of ${TOTAL_STEPS}`}
        </span>
        {!showSuccess && currentStepId !== "review" ? (
          <span className="delivery-courier-stepper__percent">{progressPercent}%</span>
        ) : null}
      </div>
      <div className="delivery-onboarding-progress" aria-hidden="true">
        <div className="delivery-onboarding-progress-bar" style={{ width: `${progressPercent}%` }} />
      </div>
      {!showSuccess ? (
        <div className="delivery-courier-stepper__title">
          <strong>{getStepTitle(currentStepId, deliveryVehicleType)}</strong>
          <span>{getStepSubtitle(currentStepId, deliveryVehicleType)}</span>
        </div>
      ) : null}
      <div className="delivery-courier-stepper__dots">
        {STEPPER_ITEMS.map((item) => {
          const stepNumber = getDisplayStepNumber(item.id);
          const isSkipped = item.id === "vehicle" && isBicycleCourier(deliveryVehicleType);
          const isActive = !showSuccess && currentStepId === item.id;
          const isDone =
            showSuccess || currentStepId === "review" || displayStepNumber > stepNumber;
          return (
            <span
              key={item.id}
              className={`delivery-courier-stepper__dot ${isActive ? "is-active" : ""} ${
                isDone ? "is-done" : ""
              } ${isSkipped ? "is-skipped" : ""}`}
            >
              {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="delivery-courier-success delivery-courier-step-panel">
      <div className="delivery-uber-card delivery-courier-success__card">
        <div className="delivery-courier-success__icon" aria-hidden="true">
          ✓
        </div>
        <h2>Application submitted</h2>
        <p>Your Yala Delivery application is under review.</p>
        <p className="delivery-courier-success__hint">
          We will notify you once an admin approves your courier profile. You can check back here anytime.
        </p>
        <button
          type="button"
          className="delivery-uber__cta"
          onClick={() => {
            window.location.href = "/delivery/courier";
          }}
        >
          Back to courier home
        </button>
      </div>
    </div>
  );

  const renderReview = () => (
    <div className="delivery-courier-step-panel">
      <div className="delivery-uber-card">
        <span className="delivery-profile-setup__eyebrow">Final submit</span>
        <h2>Review your application</h2>
        <p>Check every detail before sending your application for admin approval.</p>
      </div>
      <div className="delivery-uber-card delivery-profile-setup__review delivery-courier-review">
        <div className="delivery-courier-review__section delivery-courier-review__section--highlight">
          <h3>Courier type</h3>
          <p>
            {getDeliveryVehicleIcon(deliveryVehicleType)} {getDeliveryVehicleLabel(deliveryVehicleType)}
          </p>
        </div>
        <div className="delivery-courier-review__section">
          <h3>Personal information</h3>
          <p>
            <strong>Name:</strong> {personal.full_name}
          </p>
          <p>
            <strong>Phone:</strong> {personal.phone_number}
          </p>
          <p>
            <strong>Email:</strong> {personal.email}
          </p>
          <p>
            <strong>City:</strong> {selectedCityName || "—"}
          </p>
          <p>
            <strong>Profile photo:</strong> {profilePhoto || existingPhotoUrl ? "Added" : "Missing"}
          </p>
        </div>
        {requiresVehicleFields ? (
          <div className="delivery-courier-review__section">
            <h3>Vehicle information</h3>
            <p>
              <strong>Make / model:</strong> {vehicle.vehicle_make} {vehicle.vehicle_model}
            </p>
            <p>
              <strong>Color:</strong> {vehicle.vehicle_color}
            </p>
            <p>
              <strong>Plate:</strong> {vehicle.plate_number}
            </p>
          </div>
        ) : null}
        <div className="delivery-courier-review__section">
          <h3>Uploaded documents</h3>
          <ul className="delivery-courier-review__docs">
            {documentTypes.map((docType) => {
              const uploaded = uploadedMap[docType.key];
              const complete = uploaded && uploaded.status !== "rejected";
              return (
                <li key={docType.key} className={complete ? "is-complete" : "is-missing"}>
                  <span>{docType.icon} {docType.label}</span>
                  <strong>{complete ? "Uploaded" : "Missing"}</strong>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <section className="delivery-uber-card">
        <h3 style={{ marginTop: 0 }}>Electronic signature</h3>
        <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 14, lineHeight: 1.45 }}>
          Draw your signature and accept the courier agreement (version {LEGAL_VERSION.courier}).
        </p>
        {signatureStatus?.signature_complete ? (
          <div className="delivery-courier-review__section delivery-courier-review__section--highlight">
            <p style={{ margin: 0 }}>
              ✓ Signed by <strong>{signatureStatus.signed_full_name}</strong>
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>
              {signatureStatus.terms_accepted_at
                ? new Date(signatureStatus.terms_accepted_at).toLocaleString()
                : "Recorded"}
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="delivery-uber__cta"
            onClick={() => {
              window.location.href = "/delivery/courier/sign?return=/delivery/profile-setup";
            }}
          >
            Sign & Submit Application
          </button>
        )}
      </section>
    </div>
  );

  const stepContent = () => {
    if (showSuccess) return renderSuccess();

    if (currentStepId === "type") {
      return (
        <div className="delivery-courier-step-panel">
          <div className="delivery-uber-card delivery-profile-setup__hero-card">
            <span className="delivery-profile-setup__eyebrow">Step 1 of 4</span>
            <h2>How will you deliver?</h2>
            <p>Choose bicycle, motorcycle, or vehicle/car. We tailor every next step to your courier type.</p>
          </div>
          <div className="delivery-uber-card delivery-courier-form-card delivery-profile-setup__type-card">
            <DeliveryCourierTypeSelect
              value={deliveryVehicleType}
              onChange={setDeliveryVehicleType}
              disabled={saving}
              label="Courier type"
            />
            {deliveryVehicleType ? (
              <div className="delivery-profile-setup__selected-type">
                <span aria-hidden="true">{getDeliveryVehicleIcon(deliveryVehicleType)}</span>
                <div>
                  <strong>{getDeliveryVehicleLabel(deliveryVehicleType)}</strong>
                  <p>
                    {isBicycleCourier(deliveryVehicleType)
                      ? "No vehicle details required. You will upload National ID only."
                      : "Vehicle details and delivery documents will be required."}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    if (currentStepId === "personal") {
      return (
        <div className="delivery-courier-step-panel">
          <div className="delivery-uber-card delivery-profile-setup__hero-card">
            <span className="delivery-profile-setup__eyebrow">Step 2 of 4</span>
            <h2>Personal information</h2>
            <p>Add your contact details and profile photo.</p>
          </div>
          <div className="delivery-uber-card delivery-courier-form-card">
            <label className="delivery-uber-field">
              Full name
              <input
                name="full_name"
                value={personal.full_name}
                onChange={updatePersonal}
                placeholder="First and last name"
                required
              />
            </label>
            <label className="delivery-uber-field">
              Phone number
              <input
                type="tel"
                name="phone_number"
                placeholder="+222XXXXXXXX"
                value={personal.phone_number}
                onChange={updatePersonal}
                required
              />
            </label>
            <label className="delivery-uber-field">
              Email
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={personal.email}
                onChange={updatePersonal}
                required
              />
            </label>
            <label className="delivery-uber-field">
              City
              <select name="city" value={personal.city} onChange={updatePersonal} required>
                <option value="">Select city</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>
            <DeliveryCourierProfilePhotoField
              existingPhotoUrl={existingPhotoUrl}
              selectedFile={profilePhoto}
              onChange={setProfilePhoto}
              required
              disabled={saving}
            />
          </div>
        </div>
      );
    }

    if (currentStepId === "vehicle") {
      return (
        <div className="delivery-courier-step-panel">
          <div className="delivery-uber-card delivery-profile-setup__hero-card">
            <span className="delivery-profile-setup__eyebrow">Step 3 of 4</span>
            <h2>{vehicleLabels.title}</h2>
            <p>{vehicleLabels.subtitle}</p>
          </div>
          <div className="delivery-uber-card delivery-courier-form-card">
            <label className="delivery-uber-field">
              {vehicleLabels.make}
              <input name="vehicle_make" value={vehicle.vehicle_make} onChange={updateVehicle} required />
            </label>
            <label className="delivery-uber-field">
              {vehicleLabels.model}
              <input name="vehicle_model" value={vehicle.vehicle_model} onChange={updateVehicle} required />
            </label>
            <label className="delivery-uber-field">
              {vehicleLabels.color}
              <input name="vehicle_color" value={vehicle.vehicle_color} onChange={updateVehicle} required />
            </label>
            <label className="delivery-uber-field">
              Plate number
              <input name="plate_number" value={vehicle.plate_number} onChange={updateVehicle} required />
            </label>
          </div>
        </div>
      );
    }

    if (currentStepId === "documents") {
      return (
        <div className="delivery-courier-step-panel">
          <div className="delivery-uber-card delivery-profile-setup__hero-card">
            <span className="delivery-profile-setup__eyebrow">Step 4 of 4</span>
            <h2>Upload documents</h2>
            <p>
              {isBicycleCourier(deliveryVehicleType)
                ? "Upload your National ID to verify your identity."
                : "Upload your National ID, driver license, insurance, and registration."}
            </p>
            <div className="delivery-courier-docs-progress" aria-label="Document upload progress">
              <div className="delivery-courier-docs-progress__bar">
                <div
                  className="delivery-courier-docs-progress__fill"
                  style={{ width: `${documentsUploadPercent}%` }}
                />
              </div>
              <span>{documentsUploadPercent}% complete</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            style={{ display: "none" }}
            onChange={handleDocumentSelected}
          />
          <div className="delivery-profile-setup__documents">
            {documentTypes.map((docType) => (
              <DeliveryCourierOnboardingDocCard
                key={docType.key}
                docType={docType}
                uploaded={uploadedMap[docType.key]}
                pendingPreviewUrl={pendingDocPreviews[docType.key]}
                isUploading={uploadingType === docType.key}
                uploadProgress={uploadProgress[docType.key] || 0}
                disabled={saving}
                onPick={handleDocumentPick}
              />
            ))}
          </div>
        </div>
      );
    }

    return renderReview();
  };

  const continueDisabled =
    saving ||
    (currentStepId === "type" && !deliveryVehicleType) ||
    (currentStepId === "documents" && !allRequiredDocumentsUploaded) ||
    (currentStepId === "review" && !signatureStatus?.signature_complete);

  const footer = showSuccess ? null : (
    <div className="delivery-profile-setup__footer">
      {error ? <div className="delivery-uber__toast is-error">{error}</div> : null}
      {notice ? <div className="delivery-uber__toast">{notice}</div> : null}
      <div className="delivery-profile-setup__actions">
        {stepIndex > 0 ? (
          <button
            type="button"
            className="delivery-uber__btn delivery-uber__btn--secondary"
            onClick={goBack}
            disabled={saving}
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          className="delivery-uber__cta"
          onClick={goNext}
          disabled={continueDisabled}
        >
          {saving
            ? "Saving..."
            : currentStepId === "review"
              ? "Submit for Approval"
              : currentStepId === "documents"
                ? "Continue to review"
                : "Continue"}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <DeliveryUberPage title="Profile setup" onBack={null}>
        <p className="delivery-uber__empty">Loading profile setup...</p>
      </DeliveryUberPage>
    );
  }

  if (uberUI) {
    return (
      <DeliveryUberPage
        title="Delivery profile setup"
        onBack={
          showSuccess
            ? null
            : () => {
                window.location.href = "/delivery/courier";
              }
        }
      >
        {renderStepper()}
        {stepContent()}
        {footer}
      </DeliveryUberPage>
    );
  }

  return (
    <div className="delivery-page delivery-profile-setup">
      {renderStepper()}
      {stepContent()}
      {footer}
    </div>
  );
}
