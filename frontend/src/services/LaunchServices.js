import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL, getApiCandidates, isRemoteApiConfigured } from "../apiConfig";
import { isRiderLyftUI } from "../native/platform";
import riderApi from "../rider/services/authenticatedApi";
import "./LaunchServices.css";

const FALLBACK_AIRPORTS = [
  { id: "nkc", name: "Nouakchott-Oumtounsy International Airport (NKC)" },
  { id: "legacy", name: "Nouakchott Airport (Legacy)" },
];

const AIRPORT_ENDPOINTS = {
  list: ["/rides/airports/"],
  mine: ["/rides/airports/my-pickups/"],
  book: ["/rides/airports/book/"],
};

const LOST_FOUND_ENDPOINTS = {
  report: ["/rides/lost-found/report/"],
  mine: ["/rides/lost-found/my-items/"],
  admin: ["/rides/lost-found/admin/"],
};

const serviceMeta = {
  airport: ["Airport rides", "Schedule pickup or drop-off around your flight."],
  lost: ["Lost & Found", "Report and track an item from a Yala ride."],
  referral: ["Referral program", "Share Yala and follow your rewards."],
  wallet: ["Yala Wallet", "Review your stored balance and transaction ledger."],
  maintenance: ["Vehicle maintenance", "Keep your vehicle documents and service work current."],
  corporate: ["Corporate account", "View your business travel allowance and company benefits."],
  bonuses: ["Bonuses", "Track available driver incentive programs."],
};

function hasAccessToken() {
  const access = localStorage.getItem("access");
  return Boolean(access && access !== "null" && access !== "undefined");
}

function publicHeaders() {
  return {};
}

function normalizeListResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.results)) {
    return data.results;
  }
  return [];
}

function isRetryableRequestError(error) {
  const status = error?.response?.status;
  return status === 404 || status === 405 || isHtmlPayload(error?.response?.data);
}

function getServicePathCandidates(path) {
  const candidates = [];
  if (path.startsWith("/features/")) {
    candidates.push(path.replace("/features/", "/rides/"));
  }
  if (path.startsWith("/operations/")) {
    candidates.push(path.replace("/operations/", "/rides/"));
  }
  candidates.push(path);
  return [...new Set(candidates)];
}

function isHtmlPayload(data) {
  return typeof data === "string" && /<!doctype html/i.test(data.trim());
}

async function requestFirst(paths, { method = "get", data, headers } = {}) {
  let lastError;
  const attempted = new Set();

  const tryRequest = async (url) => {
    if (attempted.has(url)) {
      return null;
    }
    attempted.add(url);
    const response = await axios({ method, url, data, headers });
    if (isHtmlPayload(response.data)) {
      return null;
    }
    return response;
  };

  for (const path of paths) {
    for (const url of getApiCandidates(path)) {
      try {
        const response = await tryRequest(url);
        if (response) {
          return response;
        }
      } catch (error) {
        if (!isRetryableRequestError(error)) {
          throw error;
        }
        lastError = error;
      }
    }
  }

  if (
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    !isRemoteApiConfigured
  ) {
    for (const path of paths) {
      const localUrl = `${window.location.protocol}//${window.location.hostname}:8000${path}`;
      try {
        const response = await tryRequest(localUrl);
        if (response) {
          return response;
        }
      } catch (error) {
        if (!isRetryableRequestError(error)) {
          throw error;
        }
        lastError = error;
      }
    }
  }

  throw lastError || new Error("Unable to reach API");
}

async function authenticatedRequestFirst(paths, { method = "get", data } = {}) {
  if (!hasAccessToken()) {
    throw new Error("Please log in.");
  }

  let lastError;
  const attempted = new Set();

  const tryRequest = async (url) => {
    if (attempted.has(url)) {
      return null;
    }
    attempted.add(url);
    const response =
      method === "get"
        ? await riderApi.get(url)
        : await riderApi.post(url, data);
    if (isHtmlPayload(response.data)) {
      return null;
    }
    return response;
  };

  for (const path of paths) {
    for (const url of getApiCandidates(path)) {
      try {
        const response = await tryRequest(url);
        if (response) {
          return response;
        }
      } catch (error) {
        if (!isRetryableRequestError(error)) {
          throw error;
        }
        lastError = error;
      }
    }
  }

  if (
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    !isRemoteApiConfigured
  ) {
    for (const path of paths) {
      const localUrl = `${window.location.protocol}//${window.location.hostname}:8000${path}`;
      try {
        const response = await tryRequest(localUrl);
        if (response) {
          return response;
        }
      } catch (error) {
        if (!isRetryableRequestError(error)) {
          throw error;
        }
        lastError = error;
      }
    }
  }

  throw lastError || new Error("Unable to reach API");
}

async function loadAirportList() {
  try {
    const response = await requestFirst(AIRPORT_ENDPOINTS.list, { headers: publicHeaders() });
    const airportList = normalizeListResponse(response.data);
    if (airportList.length) {
      return { airports: airportList, message: "" };
    }
  } catch (error) {
    // Fall through to local defaults below.
  }

  return {
    airports: FALLBACK_AIRPORTS,
    message: "Using default Mauritania airports until the server list is available.",
  };
}

async function apiGet(path) {
  const paths = getServicePathCandidates(path);
  if (!hasAccessToken()) {
    return requestFirst(paths, { method: "get", headers: publicHeaders() });
  }
  return authenticatedRequestFirst(paths, { method: "get" });
}

async function apiPost(path, data) {
  const paths = getServicePathCandidates(path);
  if (!hasAccessToken()) {
    return requestFirst(paths, { method: "post", data, headers: publicHeaders() });
  }
  return authenticatedRequestFirst(paths, { method: "post", data });
}

function LaunchServices({ embedded = false }) {
  const user = useMemo(() => JSON.parse(localStorage.getItem("user") || "{}"), []);
  const role = user.is_staff ? "admin" : user.user_type || "rider";
  const sections = role === "driver"
    ? ["maintenance", "referral", "bonuses", "lost", "wallet"]
    : role === "admin"
      ? ["airport", "lost", "wallet", "corporate", "bonuses", "referral", "maintenance"]
      : ["airport", "lost", "wallet", "referral", "corporate"];
  const initialSection = useMemo(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const tabAlias = {
      intercity: "airport",
      scheduled: "airport",
      schedule: "airport",
      wallet: "wallet",
      referral: "referral",
      corporate: "corporate",
      maintenance: "maintenance",
      lost: "lost",
      airport: "airport",
      bonuses: "bonuses",
    };
    const resolved = tabAlias[tab];
    return resolved && sections.includes(resolved) ? resolved : sections[0];
  }, [sections]);
  const [active, setActive] = useState(initialSection);

  return (
    <main
      className={`yala-services ${embedded ? "yala-services--embedded" : ""} ${
        embedded && isRiderLyftUI() ? "yala-services--rider-lyft" : ""
      }`}
    >
      {!embedded && (
      <header className="ys-header">
        <div>
          <span>Yala operations</span>
          <h1>Services</h1>
          <p>Book, report, earn, and manage your Yala activity in one place.</p>
        </div>
        <div className="ys-role">{role}</div>
      </header>
      )}

      <nav className="ys-tabs" aria-label="Yala services">
        {sections.map((section) => (
          <button key={section} className={active === section ? "active" : ""} onClick={() => setActive(section)}>
            {serviceMeta[section][0]}
          </button>
        ))}
      </nav>

      <section className="ys-workspace">
        <div className="ys-section-title">
          <span>{serviceMeta[active][0]}</span>
          <h2>{serviceMeta[active][1]}</h2>
        </div>
        {active === "airport" && <AirportPanel />}
        {active === "lost" && <LostFoundPanel admin={role === "admin"} />}
        {active === "wallet" && <WalletPanel />}
        {active === "maintenance" && <MaintenancePanel />}
        {active === "referral" && <ReferralPanel role={role} />}
        {active === "corporate" && <CorporatePanel />}
        {active === "bonuses" && <BonusPanel admin={role === "admin"} />}
      </section>
    </main>
  );
}

function getApiErrorMessage(error, fallback) {
  const data = error?.response?.data;
  if (error?.response?.status === 405) {
    return "This action is not available on the server yet. Deploy the latest backend update, or run Django locally on port 8000.";
  }
  if (error?.response?.status === 404) {
    return "Service endpoint not found on the server. Deploy the latest backend update, then restart npm start with Django running on port 8000.";
  }
  if (data?.code === "token_not_valid") {
    return "Your session expired. Please log in again.";
  }

  const detail = data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    if (/token not valid/i.test(detail)) {
      return "Your session expired. Please log in again.";
    }
    return detail.trim();
  }
  if (Array.isArray(detail) && detail.length) {
    return String(detail[0]);
  }
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

function AirportPanel() {
  const [airports, setAirports] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [message, setMessage] = useState("");
  const [loadingAirports, setLoadingAirports] = useState(true);
  const [form, setForm] = useState({ airport_id: "", service_type: "pickup", flight_number: "", arrival_time: "", destination: "", notes: "" });

  const load = async () => {
    setLoadingAirports(true);
    let bookingList = [];
    let statusMessage = "";

    const airportLoad = await loadAirportList();
    const airportList = airportLoad.airports;
    statusMessage = airportLoad.message;

    if (hasAccessToken()) {
      try {
        const bookingResult = await authenticatedRequestFirst(AIRPORT_ENDPOINTS.mine);
        bookingList = normalizeListResponse(bookingResult.data);
      } catch (error) {
        if (!statusMessage) {
          statusMessage = getApiErrorMessage(error, "Unable to load your airport bookings.");
        }
      }
    }

    setAirports(airportList);
    setBookings(bookingList);
    setMessage(statusMessage);
    setLoadingAirports(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.airport_id) {
      setMessage("Please select an airport.");
      return;
    }
    if (!hasAccessToken()) {
      setMessage("Please log in to schedule an airport ride.");
      return;
    }

    try {
      const selectedAirport = airports.find((airport) => String(airport.id) === String(form.airport_id));
      const payload = {
        ...form,
        airport_name: selectedAirport?.name || "",
      };
      if (Number.isFinite(Number(form.airport_id))) {
        payload.airport_id = Number(form.airport_id);
      } else {
        delete payload.airport_id;
      }

      await authenticatedRequestFirst(AIRPORT_ENDPOINTS.book, {
        method: "post",
        data: payload,
      });
      setMessage("Airport ride scheduled.");
      setForm({ airport_id: "", service_type: "pickup", flight_number: "", arrival_time: "", destination: "", notes: "" });
      load();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Could not schedule airport ride. Please try again."));
    }
  };

  return <div className="ys-grid">
    <Panel title="Schedule airport service">
      <form className="ys-form" onSubmit={submit}>
        <label>Service<select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })}><option value="pickup">Airport pickup</option><option value="dropoff">Airport drop-off</option></select></label>
        <label>Airport<select required value={form.airport_id} onChange={(e) => setForm({ ...form, airport_id: e.target.value })} disabled={loadingAirports || !airports.length}><option value="">{loadingAirports ? "Loading airports..." : "Select airport"}</option>{airports.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Flight number<input value={form.flight_number} onChange={(e) => setForm({ ...form, flight_number: e.target.value })} /></label>
        <label>Flight time<input required type="datetime-local" value={form.arrival_time} onChange={(e) => setForm({ ...form, arrival_time: e.target.value })} /></label>
        <label>Destination<input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></label>
        <label>Notes<textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button>Schedule ride</button>{message && <Status text={message} />}
      </form>
    </Panel>
    <Panel title="Upcoming airport rides"><DataList items={bookings} empty="No airport rides scheduled." render={(b) => <><strong>{b.airport}</strong><span>{b.service_type || "pickup"} · {b.flight_number || "No flight number"}</span><small>{new Date(b.arrival_time).toLocaleString()} · {b.status}</small></>} /></Panel>
  </div>;
}

function LostFoundPanel({ admin }) {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ride_id: "", role: "rider", category: "other", description: "", rider_phone: "", driver_phone: "" });

  const load = async () => {
    setLoading(true);
    if (!hasAccessToken()) {
      setItems([]);
      setMessage("Please log in to view Lost & Found reports.");
      setLoading(false);
      return;
    }

    try {
      const paths = admin ? LOST_FOUND_ENDPOINTS.admin : LOST_FOUND_ENDPOINTS.mine;
      const response = await authenticatedRequestFirst(paths);
      setItems(normalizeListResponse(response.data));
      setMessage("");
    } catch (error) {
      setItems([]);
      setMessage(getApiErrorMessage(error, "Unable to load reports."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [admin]);

  const submit = async (event) => {
    event.preventDefault();
    if (!hasAccessToken()) {
      setMessage("Please log in to submit a Lost & Found report.");
      return;
    }

    try {
      const response = await authenticatedRequestFirst(LOST_FOUND_ENDPOINTS.report, {
        method: "post",
        data: form,
      });
      setMessage(`Report created: ${response.data.reference}`);
      setForm({ ride_id: "", role: "rider", category: "other", description: "", rider_phone: "", driver_phone: "" });
      load();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Could not submit report."));
    }
  };

  return <div className="ys-grid">
    {!admin && <Panel title="Report an item"><form className="ys-form" onSubmit={submit}>
      <label>Ride number<input required value={form.ride_id} onChange={(e) => setForm({ ...form, ride_id: e.target.value })} placeholder="e.g. 42" /></label>
      <label>Item category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="phone">Phone</option><option value="wallet">Wallet</option><option value="documents">Documents</option><option value="bag">Bag</option><option value="other">Other</option></select></label>
      <label>Description<textarea required rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <button>Submit report</button>{message && <Status text={message} />}
    </form></Panel>}
    <Panel title={admin ? "All Lost & Found cases" : "My reports"}>{loading ? <p className="ys-empty">Loading reports...</p> : <DataList items={items} empty="No Lost & Found reports." render={(item) => <><strong>{item.reference}</strong><span>{item.description}</span><small>{item.category} · {item.status}</small></>} />}{admin && message && <Status text={message} />}</Panel>
  </div>;
}

function WalletPanel() {
  const [wallet, setWallet] = useState(null);
  useEffect(() => { apiGet("/payments/wallet/").then((r) => setWallet(r.data)).catch(() => setWallet({ error: true })); }, []);
  return <div className="ys-grid">
    <Panel title="Current balance"><div className="ys-balance"><span>Available</span><strong>{wallet?.balance ?? "—"} {wallet?.currency || "MRU"}</strong><small>Wallet payments use an auditable transaction ledger.</small></div></Panel>
    <Panel title="Recent transactions"><DataList items={wallet?.recent_transactions || []} empty="No wallet transactions yet." render={(tx) => <><strong>{tx.is_credit ? "+" : "-"}{tx.amount} MRU</strong><span>{tx.transaction_type.replaceAll("_", " ")}</span><small>{new Date(tx.created_at).toLocaleString()}</small></>} /></Panel>
  </div>;
}

function MaintenancePanel() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ reminder_type: "oil_change", title: "", due_date: "", due_odometer_km: "", notes: "" });
  const load = async () => setItems(normalizeListResponse((await apiGet("/operations/maintenance/")).data));
  useEffect(() => { load().catch(() => setMessage("Unable to load maintenance reminders.")); }, []);
  const submit = async (event) => {
    event.preventDefault();
    try {
      await apiPost("/operations/maintenance/", form);
      setMessage("Maintenance reminder saved.");
      setForm({ reminder_type: "oil_change", title: "", due_date: "", due_odometer_km: "", notes: "" });
      load();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Could not save maintenance reminder."));
    }
  };
  const complete = async (id) => {
    try {
      await apiPost(`/operations/maintenance/${id}/complete/`, {});
      load();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Could not update maintenance reminder."));
    }
  };
  return <div className="ys-grid">
    <Panel title="Add reminder"><form className="ys-form" onSubmit={submit}>
      <label>Service type<select value={form.reminder_type} onChange={(e) => setForm({ ...form, reminder_type: e.target.value })}><option value="oil_change">Oil change</option><option value="inspection">Inspection</option><option value="tires">Tire service</option><option value="insurance">Insurance renewal</option><option value="registration">Registration renewal</option><option value="other">Other</option></select></label>
      <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>Due date<input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
      <label>Odometer km<input type="number" value={form.due_odometer_km} onChange={(e) => setForm({ ...form, due_odometer_km: e.target.value })} /></label>
      <button>Add reminder</button>{message && <Status text={message} />}
    </form></Panel>
    <Panel title="Maintenance schedule"><DataList items={items} empty="No maintenance reminders." render={(item) => <><strong>{item.title}</strong><span>Due {item.due_date} · {item.status}</span>{item.status !== "completed" && <button className="ys-small-button" onClick={() => complete(item.id)}>Mark complete</button>}</>} /></Panel>
  </div>;
}

function ReferralPanel({ role }) {
  const [data, setData] = useState(null);
  const endpoint = role === "driver" ? "/referrals/driver/code/" : "/referrals/rider/code/";
  useEffect(() => { apiGet(endpoint).then((r) => setData(r.data)).catch(() => setData({ unavailable: true })); }, [endpoint]);
  return <div className="ys-grid"><Panel title="Your referral code"><div className="ys-code"><span>Share this code</span><strong>{data?.code || data?.referral_code || "Loading"}</strong><p>Rewards are issued after the referred user completes the qualifying activity.</p></div></Panel><Panel title="Program protection"><div className="ys-facts"><span>Reward caps</span><span>Fraud monitoring</span><span>Expiration tracking</span><span>Admin review</span></div></Panel></div>;
}

function CorporatePanel() {
  const [data, setData] = useState(null);
  const [billingSource, setBillingSource] = useState(() => localStorage.getItem("yala_billing_source") || "personal");

  useEffect(() => {
    apiGet("/features/corporate/me/").then((r) => setData(r.data)).catch(() => setData({ empty: true }));
  }, []);

  const toggleBilling = (source) => {
    setBillingSource(source);
    localStorage.setItem("yala_billing_source", source);
  };

  return (
    <Panel title="Business travel">
      <div className="ys-corporate">
        {data?.empty ? (
          <p>You are not linked to a corporate account yet.</p>
        ) : (
          <>
            <h3>{data?.company}</h3>
            <div className="ys-stat-row">
              <Metric label="Monthly limit" value={`${data?.monthly_limit || 0} MRU`} />
              <Metric label="Spent" value={`${data?.monthly_spent || 0} MRU`} />
              <Metric label="Remaining" value={`${data?.remaining || 0} MRU`} />
            </div>
            {data?.can_book_corporate ? (
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button type="button" onClick={() => toggleBilling("personal")}>
                  {billingSource === "personal" ? "✓ Personal payment" : "Personal payment"}
                </button>
                <button type="button" onClick={() => toggleBilling("corporate")}>
                  {billingSource === "corporate" ? "✓ Bill to company" : "Bill to company"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}

function BonusPanel() {
  const [programs, setPrograms] = useState([]);
  useEffect(() => { apiGet("/incentives/programs/").then((r) => setPrograms(normalizeListResponse(r.data))); }, []);
  return <Panel title="Available programs"><DataList items={programs} empty="No active bonus programs." render={(p) => <><strong>{p.name}</strong><span>{p.description}</span><small>{p.bonus_amount} MRU · target {p.target}</small></>} /></Panel>;
}

function Panel({ title, children }) { return <article className="ys-panel"><h3>{title}</h3>{children}</article>; }
function Status({ text }) { return <div className="ys-status">{text}</div>; }
function Metric({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function DataList({ items, empty, render }) { return <div className="ys-list">{items?.length ? items.map((item, index) => <div className="ys-list-item" key={item.id || item.reference || index}>{render(item)}</div>) : <p className="ys-empty">{empty}</p>}</div>; }

export default LaunchServices;
