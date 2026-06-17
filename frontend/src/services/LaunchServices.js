import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import "./LaunchServices.css";

const serviceMeta = {
  airport: ["Airport rides", "Schedule pickup or drop-off around your flight."],
  lost: ["Lost & Found", "Report and track an item from a Yala ride."],
  referral: ["Referral program", "Share Yala and follow your rewards."],
  wallet: ["Yala Wallet", "Review your stored balance and transaction ledger."],
  maintenance: ["Vehicle maintenance", "Keep your vehicle documents and service work current."],
  corporate: ["Corporate account", "View your business travel allowance and company benefits."],
  bonuses: ["Bonuses", "Track available driver incentive programs."],
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("access")}` };
}

async function apiGet(path) {
  return axios.get(`${API_URL}${path}`, { headers: authHeaders() });
}

async function apiPost(path, data) {
  return axios.post(`${API_URL}${path}`, data, { headers: authHeaders() });
}

function LaunchServices() {
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
    <main className="yala-services">
      <header className="ys-header">
        <div>
          <span>Yala operations</span>
          <h1>Services</h1>
          <p>Book, report, earn, and manage your Yala activity in one place.</p>
        </div>
        <div className="ys-role">{role}</div>
      </header>

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

function AirportPanel() {
  const [airports, setAirports] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ airport_id: "", service_type: "pickup", flight_number: "", arrival_time: "", destination: "", notes: "" });

  const load = async () => {
    const [airportResult, bookingResult] = await Promise.all([
      apiGet("/features/airports/"),
      apiGet("/features/airports/my-pickups/"),
    ]);
    setAirports(airportResult.data);
    setBookings(bookingResult.data);
  };
  useEffect(() => { load().catch(() => setMessage("Unable to load airport services.")); }, []);

  const submit = async (event) => {
    event.preventDefault();
    await apiPost("/features/airports/book/", form);
    setMessage("Airport ride scheduled.");
    setForm({ airport_id: "", service_type: "pickup", flight_number: "", arrival_time: "", destination: "", notes: "" });
    load();
  };

  return <div className="ys-grid">
    <Panel title="Schedule airport service">
      <form className="ys-form" onSubmit={submit}>
        <label>Service<select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })}><option value="pickup">Airport pickup</option><option value="dropoff">Airport drop-off</option></select></label>
        <label>Airport<select required value={form.airport_id} onChange={(e) => setForm({ ...form, airport_id: e.target.value })}><option value="">Select airport</option>{airports.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
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
  const [form, setForm] = useState({ ride_id: "", role: "rider", category: "other", description: "", rider_phone: "", driver_phone: "" });
  const load = async () => setItems((await apiGet(admin ? "/features/lost-found/admin/" : "/features/lost-found/my-items/")).data);
  useEffect(() => { load().catch(() => setMessage("Unable to load reports.")); }, [admin]);
  const submit = async (event) => {
    event.preventDefault();
    const response = await apiPost("/features/lost-found/report/", form);
    setMessage(`Report created: ${response.data.reference}`);
    setForm({ ride_id: "", role: "rider", category: "other", description: "", rider_phone: "", driver_phone: "" });
    load();
  };
  return <div className="ys-grid">
    {!admin && <Panel title="Report an item"><form className="ys-form" onSubmit={submit}>
      <label>Ride number<input required value={form.ride_id} onChange={(e) => setForm({ ...form, ride_id: e.target.value })} /></label>
      <label>Item category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="phone">Phone</option><option value="wallet">Wallet</option><option value="documents">Documents</option><option value="bag">Bag</option><option value="other">Other</option></select></label>
      <label>Description<textarea required rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <button>Submit report</button>{message && <Status text={message} />}
    </form></Panel>}
    <Panel title={admin ? "All Lost & Found cases" : "My reports"}><DataList items={items} empty="No Lost & Found reports." render={(item) => <><strong>{item.reference}</strong><span>{item.description}</span><small>{item.category} · {item.status}</small></>} /></Panel>
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
  const [form, setForm] = useState({ reminder_type: "oil_change", title: "", due_date: "", due_odometer_km: "", notes: "" });
  const load = async () => setItems((await apiGet("/operations/maintenance/")).data);
  useEffect(() => { load(); }, []);
  const submit = async (event) => { event.preventDefault(); await apiPost("/operations/maintenance/", form); setForm({ reminder_type: "oil_change", title: "", due_date: "", due_odometer_km: "", notes: "" }); load(); };
  const complete = async (id) => { await apiPost(`/operations/maintenance/${id}/complete/`, {}); load(); };
  return <div className="ys-grid">
    <Panel title="Add reminder"><form className="ys-form" onSubmit={submit}>
      <label>Service type<select value={form.reminder_type} onChange={(e) => setForm({ ...form, reminder_type: e.target.value })}><option value="oil_change">Oil change</option><option value="inspection">Inspection</option><option value="tires">Tire service</option><option value="insurance">Insurance renewal</option><option value="registration">Registration renewal</option><option value="other">Other</option></select></label>
      <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>Due date<input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
      <label>Odometer km<input type="number" value={form.due_odometer_km} onChange={(e) => setForm({ ...form, due_odometer_km: e.target.value })} /></label>
      <button>Add reminder</button>
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
  useEffect(() => { apiGet("/features/corporate/me/").then((r) => setData(r.data)).catch(() => setData({ empty: true })); }, []);
  return <Panel title="Business travel"><div className="ys-corporate">{data?.empty ? <p>You are not linked to a corporate account yet.</p> : <><h3>{data?.company}</h3><div className="ys-stat-row"><Metric label="Monthly limit" value={`${data?.monthly_limit || 0} MRU`} /><Metric label="Spent" value={`${data?.monthly_spent || 0} MRU`} /><Metric label="Remaining" value={`${data?.remaining || 0} MRU`} /></div></>}</div></Panel>;
}

function BonusPanel() {
  const [programs, setPrograms] = useState([]);
  useEffect(() => { apiGet("/incentives/programs/").then((r) => setPrograms(r.data)); }, []);
  return <Panel title="Available programs"><DataList items={programs} empty="No active bonus programs." render={(p) => <><strong>{p.name}</strong><span>{p.description}</span><small>{p.bonus_amount} MRU · target {p.target}</small></>} /></Panel>;
}

function Panel({ title, children }) { return <article className="ys-panel"><h3>{title}</h3>{children}</article>; }
function Status({ text }) { return <div className="ys-status">{text}</div>; }
function Metric({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function DataList({ items, empty, render }) { return <div className="ys-list">{items?.length ? items.map((item, index) => <div className="ys-list-item" key={item.id || item.reference || index}>{render(item)}</div>) : <p className="ys-empty">{empty}</p>}</div>; }

export default LaunchServices;
