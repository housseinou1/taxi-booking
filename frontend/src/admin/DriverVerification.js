import React, { useEffect, useState } from "react";
import { API_URL } from "../apiConfig";

function DriverVerification({ onBack }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  const authHeaders = () => {
    const token = localStorage.getItem("access");
    return token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {};
  };

  const readJsonSafe = async (response) => {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  };

  const getApiMessage = (data, fallback) =>
    data?.error || data?.detail || data?.message || fallback;

  const fetchDrivers = async () => {
    try {
      const res = await fetch(`${API_URL}/drivers/`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setDrivers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Drivers error:", error);
      setDrivers([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const approveDriver = async (id) => {
    const response = await fetch(`${API_URL}/drivers/approve/${id}/`, {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await readJsonSafe(response);
    alert(getApiMessage(data, response.ok ? "Driver approved ✅" : "Could not approve driver"));

    fetchDrivers();
  };

  const rejectDriver = async (id) => {
    const response = await fetch(`${API_URL}/drivers/reject/${id}/`, {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await readJsonSafe(response);
    alert(getApiMessage(data, response.ok ? "Driver rejected ❌" : "Could not reject driver"));

    fetchDrivers();
  };

  return (
    <div style={page}>
      <button onClick={onBack}>← Back</button>

      <h1>🪪 Driver Verification</h1>

      {loading ? (
        <p>Loading drivers...</p>
      ) : drivers.length === 0 ? (
        <p>No drivers found</p>
      ) : (
        drivers.map((driver) => (
          <div key={driver.id} style={card}>
            <p><b>ID:</b> {driver.id}</p>
            <p><b>Status:</b> {driver.status}</p>
            <p><b>Available:</b> {driver.is_available ? "Online" : "Offline"}</p>
            <p><b>Vehicle:</b> {driver.vehicle_make || "-"} {driver.vehicle_model || "-"}</p>
            <p><b>Plate:</b> {driver.vehicle_plate || "-"}</p>
            <p><b>ID:</b> {driver.id}</p>
            <p><b>Name:</b> {driver.first_name} {driver.last_name}</p>
            <p><b>Email:</b> {driver.email}</p>
            
            {driver.license_file && (
              <p>
                <a href={driver.license_file} target="_blank" rel="noreferrer">
                  View License
                </a>
              </p>
            )}

            {driver.insurance_file && (
              <p>
                <a href={driver.insurance_file} target="_blank" rel="noreferrer">
                  View Insurance
                </a>
              </p>
            )}

            <button onClick={() => approveDriver(driver.id)} style={approveBtn}>
              Approve
            </button>

            <button onClick={() => rejectDriver(driver.id)} style={rejectBtn}>
              Reject
            </button>
          </div>
        ))
      )}
    </div>
  );
}

const page = {
  padding: "30px",
  fontFamily: "Arial",
};

const card = {
  border: "1px solid #ddd",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "15px",
  maxWidth: "500px",
};

const approveBtn = {
  background: "green",
  color: "white",
  padding: "8px 12px",
  border: "none",
  borderRadius: "6px",
  marginRight: "10px",
};

const rejectBtn = {
  background: "red",
  color: "white",
  padding: "8px 12px",
  border: "none",
  borderRadius: "6px",
};

export default DriverVerification;
