import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import { DeliveryUberPage } from "./DeliveryUberLayout";
import {
  buildDocumentMap,
  getDocumentDisplayStatus,
  getRequiredCourierDocumentTypes,
  validateDeliveryDocumentFile,
} from "./deliveryDocumentReview";
import "./delivery-uber.css";

const STATUS_LABELS = {
  approved: "Approved",
  pending_review: "Pending review",
  uploaded: "Uploaded",
  rejected: "Rejected",
  expired: "Expired",
  missing: "Missing",
};

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DeliveryCourierDocuments() {
  const [documents, setDocuments] = useState([]);
  const [deliveryVehicleType, setDeliveryVehicleType] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef(null);
  const selectedTypeRef = useRef("");
  const documentTypes = useMemo(
    () => getRequiredCourierDocumentTypes(deliveryVehicleType || "motorcycle"),
    [deliveryVehicleType]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedApi.get(`${API_URL}/drivers/me/documents/?context=delivery`);
      setDocuments(response.data?.documents || []);
      setDeliveryVehicleType(response.data?.delivery_vehicle_type || "motorcycle");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not load delivery documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uploadedMap = useMemo(() => buildDocumentMap(documents), [documents]);

  const pickDocument = (docType) => {
    selectedTypeRef.current = docType;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const uploadDocument = async (event) => {
    const file = event.target.files?.[0];
    const documentType = selectedTypeRef.current;
    if (!file || !documentType) return;

    const validation = validateDeliveryDocumentFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setUploadingType(documentType);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", documentType);
      await authenticatedApi.post(`${API_URL}/drivers/me/documents/upload/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNotice("Delivery document uploaded for review.");
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploadingType("");
    }
  };

  return (
    <DeliveryUberPage
      title="Delivery documents"
      onBack={() => {
        window.location.href = "/delivery/account";
      }}
    >
      <div className="delivery-uber__earnings">
        {error ? <p className="delivery-uber__toast is-error">{error}</p> : null}
        {notice ? <p className="delivery-uber__toast">{notice}</p> : null}
        {loading ? <p className="delivery-uber__empty">Loading delivery documents...</p> : null}

        <div className="delivery-uber-card">
          <h2>Required for your courier type</h2>
          <p>
            Bicycle couriers only need National ID. Motorcycle and vehicle couriers need driving
            license, registration, and insurance.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          style={{ display: "none" }}
          onChange={uploadDocument}
        />

        <div className="delivery-uber__history-list">
          {documentTypes.map((docType) => {
            const uploaded = uploadedMap[docType.key];
            const displayStatus = getDocumentDisplayStatus(uploaded);
            const isUploading = uploadingType === docType.key;
            return (
              <article key={docType.key} className="delivery-uber__history-item">
                <div>
                  <strong>{docType.label}</strong>
                  <p>{STATUS_LABELS[displayStatus] || displayStatus}</p>
                  {uploaded?.expires_at ? <p>Expires {formatDate(uploaded.expires_at)}</p> : null}
                </div>
                <div className="delivery-uber__history-meta">
                  <button
                    type="button"
                    className="delivery-uber__btn delivery-uber__btn--sm"
                    disabled={isUploading}
                    onClick={() => pickDocument(docType.key)}
                  >
                    {isUploading ? "Uploading..." : uploaded ? "Re-upload" : "Upload"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </DeliveryUberPage>
  );
}
