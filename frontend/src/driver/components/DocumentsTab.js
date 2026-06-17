import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../../apiConfig";
import DocumentCard from "./DocumentCard";

export default function DocumentsTab() {
  const [documents, setDocuments] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("access");

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await axios.get(`${API_URL}/drivers/me/documents/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDocuments(response.data.documents || []);
      setAlerts(response.data.alerts || []);
    } catch (error) {
      console.log("Documents fetch error:", error.response?.data || error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (documentType) => {
    // Create a file input and trigger it
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,application/pdf";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("document_type", documentType);
      formData.append("file", file);

      try {
        await axios.post(`${API_URL}/drivers/me/documents/upload/`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        });
        fetchDocuments(); // Refresh
      } catch (error) {
        alert(error.response?.data?.error || "Upload failed");
      }
    };
    input.click();
  };

  // Define all required documents with their categories
  const DRIVER_DOCS = [
    { type: "national_id", name: "National ID Card" },
    { type: "license", name: "Driver License" },
    { type: "driver_photo", name: "Driver Profile Photo" },
  ];

  const VEHICLE_DOCS = [
    { type: "insurance", name: "Insurance" },
    { type: "vignette", name: "Vignette" },
    { type: "carte_grise", name: "Carte Grise" },
    { type: "vehicle_registration", name: "Vehicle Registration" },
  ];

  // Merge API data with required docs
  const getDocData = (type) => {
    const found = documents.find((d) => d.document_type === type);
    if (found) return found;
    return { document_type: type, status: "missing", file_url: null, expires_at: null, days_remaining: null, rejection_note: null };
  };

  const driverDocs = DRIVER_DOCS.map((d) => ({ ...d, ...getDocData(d.type) }));
  const vehicleDocs = VEHICLE_DOCS.map((d) => ({ ...d, ...getDocData(d.type) }));

  if (loading) {
    return <div style={styles.loading}>Loading documents...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={styles.alertsSection}>
          {alerts.map((alert, i) => (
            <div key={i} style={styles.alert}>
              ⚠️ {alert.reason || alert.document_type}
            </div>
          ))}
        </div>
      )}

      {/* Driver Documents */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>👤 Driver Documents</h3>
        {driverDocs.map((doc) => (
          <DocumentCard key={doc.type || doc.document_type} document={doc} onUpload={handleUpload} />
        ))}
      </section>

      {/* Vehicle Documents */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>🚗 Vehicle Documents</h3>
        {vehicleDocs.map((doc) => (
          <DocumentCard key={doc.type || doc.document_type} document={doc} onUpload={handleUpload} />
        ))}
      </section>
    </div>
  );
}

const styles = {
  container: {
    padding: "16px 0",
  },
  loading: {
    padding: 24,
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
  },
  alertsSection: {
    marginBottom: 16,
  },
  alert: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "rgba(249, 115, 22, 0.1)",
    border: "1px solid rgba(249, 115, 22, 0.25)",
    color: "#fb923c",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    margin: "0 0 12px",
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
  },
  empty: {
    padding: 16,
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px dashed rgba(255,255,255,0.1)",
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
  },
  uploadAllBtn: {
    marginTop: 10,
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: "#00A651",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
};
