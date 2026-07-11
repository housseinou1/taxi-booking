import React, { useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import { MARKET } from "../marketConfig";

export default function SafetyEmergencyPanel({ role = "rider", currentRide, onClose }) {
  const [contacts, setContacts] = useState([]);
  const [history, setHistory] = useState([]);
  const [contact, setContact] = useState({ name: "", phone_number: "", relationship: "" });
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");
  const isDriver = role === "driver";
  const currentRideId = currentRide?.id || currentRide?.ride_id;
  const token = localStorage.getItem("access");
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    [token],
  );

  const refresh = async () => {
    if (!token) return;
    try {
      const [contactsResponse, historyResponse] = await Promise.all([
        fetch(`${API_URL}/safety/contacts/`, { headers }),
        fetch(`${API_URL}/safety/incidents/`, { headers }),
      ]);
      const contactsData = await contactsResponse.json();
      const historyData = await historyResponse.json();
      setContacts(Array.isArray(contactsData) ? contactsData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
    } catch (error) {
      setMessage("Safety information could not be loaded.");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPosition = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
      );
    });

  const addContact = async (event) => {
    event.preventDefault();
    setWorking("contact");
    try {
      const response = await fetch(`${API_URL}/safety/contacts/`, {
        method: "POST",
        headers,
        body: JSON.stringify(contact),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save contact.");
      setContact({ name: "", phone_number: "", relationship: "" });
      setMessage("Emergency contact saved.");
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorking("");
    }
  };

  const triggerSos = async () => {
    if (!currentRideId) return setMessage("SOS is available during an active ride.");
    if (!window.confirm("Send an emergency SOS to Yala safety staff now?")) return;
    setWorking("sos");
    try {
      const position = await getPosition();
      const response = await fetch(`${API_URL}/safety/sos/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ride_id: currentRideId, description, ...position }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "SOS could not be sent.");
      setMessage(`SOS ${data.incident.reference} sent. Yala safety staff have been alerted.`);
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorking("");
    }
  };

  const report = async (incidentType) => {
    setWorking("report");
    try {
      const position = await getPosition();
      const response = await fetch(`${API_URL}/safety/incidents/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ride_id: currentRideId,
          incident_type: incidentType,
          severity: "high",
          description,
          ...position,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Safety report could not be sent.");
      setDescription("");
      setMessage(`Safety report ${data.reference} sent to Yala.`);
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorking("");
    }
  };

  const shareTrip = async () => {
    if (!currentRideId) return;
    setWorking("share");
    try {
      const response = await fetch(`${API_URL}/safety/trip-share/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ride_id: currentRideId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create sharing link.");
      if (navigator.share) {
        await navigator.share({ title: "Yala live trip", url: data.share_url });
      } else {
        await navigator.clipboard.writeText(data.share_url);
        setMessage("Secure live-trip link copied. It expires in 24 hours.");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorking("");
    }
  };

  const tripLabel = currentRide
    ? `Ride #${currentRideId}: ${currentRide.pickup || "Pickup"} to ${currentRide.destination || "Destination"}`
    : "No active ride";

  return (
    <section className="yala-safety-panel">
      <SafetyStyles />
      <header>
        <div>
          <span>Yala Safety Center</span>
          <h2>{isDriver ? "Driver safety" : "Rider safety"}</h2>
          <p>{tripLabel}</p>
        </div>
        {onClose && <button type="button" className="safety-close" onClick={onClose}>Close</button>}
      </header>

      <div className="safety-actions">
        <button className="sos" type="button" onClick={triggerSos} disabled={!currentRide || Boolean(working)}>
          {working === "sos" ? "Sending SOS..." : "SOS Emergency"}
        </button>
        <button type="button" onClick={shareTrip} disabled={!currentRide || Boolean(working)}>
          {working === "share" ? "Creating link..." : "Share live trip"}
        </button>
        <button type="button" onClick={() => report("safety_incident")} disabled={Boolean(working)}>
          Report safety incident
        </button>
        <button type="button" onClick={() => report(isDriver ? "report_rider" : "report_driver")} disabled={!currentRide || Boolean(working)}>
          {isDriver ? "Report rider" : "Report driver"}
        </button>
      </div>

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Describe what happened for the Yala safety team."
      />
      {message && <div className="safety-message">{message}</div>}

      <div className="safety-grid">
        <article>
          <span>Emergency services</span>
          {MARKET.emergencyNumbers.map((item) => (
            <a key={item.number} href={`tel:${item.number}`}>
              <strong>{item.label}</strong><b>{item.number}</b>
            </a>
          ))}
        </article>

        <article>
          <span>Emergency contacts</span>
          {contacts.map((item) => (
            <a key={item.id} href={`tel:${item.phone_number}`}>
              <strong>{item.name}</strong><b>{item.phone_number}</b>
            </a>
          ))}
          <form onSubmit={addContact}>
            <input required value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} placeholder="Contact name" />
            <input required value={contact.phone_number} onChange={(event) => setContact({ ...contact, phone_number: event.target.value })} placeholder="Phone number" />
            <button type="submit" disabled={working === "contact" || contacts.length >= 5}>
              Add contact ({contacts.length}/5)
            </button>
          </form>
        </article>

        <article>
          <span>Incident history</span>
          {history.length === 0 && <p>No safety incidents reported.</p>}
          {history.slice(0, 8).map((incident) => (
            <div className="incident" key={incident.id}>
              <strong>{incident.reference}</strong>
              <small>{incident.incident_type.replaceAll("_", " ")} · {incident.status}</small>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}

function SafetyStyles() {
  return <style>{`
    .yala-safety-panel { width:100%; max-height:90vh; overflow:auto; box-sizing:border-box; border:1px solid rgba(248,113,113,.32); border-radius:8px; background:#08111f; color:#f8fafc; padding:18px; box-shadow:0 24px 70px rgba(0,0,0,.42); }
    .yala-safety-panel * { box-sizing:border-box; }
    .yala-safety-panel header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
    .yala-safety-panel h2 { margin:5px 0; font-size:24px; letter-spacing:0; }
    .yala-safety-panel header span,.yala-safety-panel article>span { color:#fca5a5; font-size:12px; font-weight:900; text-transform:uppercase; }
    .yala-safety-panel p,.yala-safety-panel small { color:#cbd5e1; }
    .safety-actions { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:16px 0 10px; }
    .safety-actions button,.safety-close,.yala-safety-panel form button { min-height:44px; border:1px solid rgba(255,255,255,.15); border-radius:6px; background:#172033; color:#fff; font-weight:850; cursor:pointer; }
    .safety-actions .sos { background:#dc2626; border-color:#f87171; }
    .safety-actions button:disabled { opacity:.5; cursor:not-allowed; }
    .yala-safety-panel textarea,.yala-safety-panel input { width:100%; border:1px solid rgba(255,255,255,.14); border-radius:6px; background:#050a13; color:#fff; padding:11px; }
    .yala-safety-panel textarea { min-height:72px; resize:vertical; }
    .safety-message { margin:10px 0; border:1px solid rgba(250,204,21,.35); background:rgba(250,204,21,.12); color:#fde68a; padding:11px; border-radius:6px; font-weight:800; }
    .safety-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:12px; }
    .safety-grid article { min-width:0; border:1px solid rgba(255,255,255,.12); border-radius:7px; background:rgba(255,255,255,.05); padding:12px; }
    .safety-grid a,.incident { display:flex; justify-content:space-between; gap:8px; color:#fff; text-decoration:none; background:rgba(255,255,255,.06); padding:9px; margin-top:8px; border-radius:5px; }
    .incident { display:grid; }
    .yala-safety-panel form { display:grid; gap:7px; margin-top:10px; }
    @media(max-width:760px){ .safety-actions,.safety-grid{grid-template-columns:1fr 1fr;} }
    @media(max-width:480px){ .safety-actions,.safety-grid{grid-template-columns:1fr;} }
  `}</style>;
}
