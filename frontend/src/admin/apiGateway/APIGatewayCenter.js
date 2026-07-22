import React, { useCallback, useEffect, useState } from "react";

import {
  approvePartnerOrganization,
  createApiKey,
  createPartnerApplication,
  createPartnerOrganization,
  createWebhook,
  fetchApiKeys,
  fetchGatewayAnalytics,
  fetchGatewayCeoDashboard,
  fetchGatewayDocs,
  fetchGatewayLogs,
  fetchPartnerApplications,
  fetchPartnerOrganizations,
  fetchUsage,
  fetchWebhooks,
  revokeApiKey,
  rotateApiKey,
  triggerWebhookEvent,
} from "./apiGatewayApi";
import "../beta/BetaDashboard.css";
import "./APIGatewayCenter.css";

const TABS = [
  { id: "portal", label: "Developer Portal" },
  { id: "analytics", label: "API Analytics" },
  { id: "ceo", label: "CEO Dashboard" },
  { id: "docs", label: "Documentation" },
];

const WEBHOOK_EVENTS = [
  "ride.accepted",
  "ride.completed",
  "order.created",
  "order.delivered",
  "payment.received",
  "withdrawal.completed",
  "merchant.approved",
  "driver.approved",
];

function Section({ title, children }) {
  return (
    <section className="gateway-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="beta__card">
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
    </div>
  );
}

export default function APIGatewayCenter() {
  const [tab, setTab] = useState("portal");
  const [organizations, setOrganizations] = useState([]);
  const [applications, setApplications] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [usage, setUsage] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [ceoDashboard, setCeoDashboard] = useState(null);
  const [logs, setLogs] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [docContent, setDocContent] = useState(null);
  const [docType, setDocType] = useState("integration");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ org_name: "", org_email: "", app_name: "", org_id: "", scopes: "" });
  const [keyForm, setKeyForm] = useState({ app_id: "", name: "" });
  const [webhookForm, setWebhookForm] = useState({ app_id: "", url: "", events: "" });
  const [triggerForm, setTriggerForm] = useState({ event_type: "", payload: "" });

  const load = useCallback(async () => {
    try {
      setError("");
      setOrganizations(await fetchPartnerOrganizations());
      setApplications(await fetchPartnerApplications());
      setWebhooks(await fetchWebhooks());
      setUsage(await fetchUsage());
      setAnalytics(await fetchGatewayAnalytics());
      setCeoDashboard(await fetchGatewayCeoDashboard());
      setLogs(await fetchGatewayLogs());
      setApiKeys(await fetchApiKeys());
      setDocContent(await fetchGatewayDocs("integration"));
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load API gateway data");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const notify = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    try {
      await createPartnerOrganization({ name: form.org_name, contact_email: form.org_email });
      notify("Organization created.");
      setForm((f) => ({ ...f, org_name: "", org_email: "" }));
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleApproveOrg = async (id, status) => {
    try {
      await approvePartnerOrganization(id, status);
      notify(`Organization ${status}.`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleCreateApp = async (e) => {
    e.preventDefault();
    try {
      await createPartnerApplication({
        organization: parseInt(form.org_id, 10),
        name: form.app_name,
        scopes: form.scopes.split(",").map((s) => s.trim()).filter(Boolean),
      });
      notify("Application created.");
      setForm((f) => ({ ...f, app_name: "", org_id: "", scopes: "" }));
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();
    try {
      const data = await createApiKey({
        application: parseInt(keyForm.app_id, 10),
        name: keyForm.name,
      });
      notify(`Key created: ${data.api_key}`);
      setKeyForm({ app_id: "", name: "" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    try {
      await createWebhook({
        application: parseInt(webhookForm.app_id, 10),
        url: webhookForm.url,
        events: webhookForm.events.split(",").map((s) => s.trim()).filter(Boolean),
      });
      notify("Webhook subscription created.");
      setWebhookForm({ app_id: "", url: "", events: "" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleRotateKey = async (id) => {
    try {
      const data = await rotateApiKey(id);
      notify(`Key rotated: ${data.api_key}`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleRevokeKey = async (id) => {
    try {
      await revokeApiKey(id);
      notify("Key revoked.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleLoadDoc = async (type) => {
    try {
      setDocType(type);
      setDocContent(await fetchGatewayDocs(type));
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleTrigger = async (e) => {
    e.preventDefault();
    try {
      const payload = triggerForm.payload ? JSON.parse(triggerForm.payload) : {};
      const result = await triggerWebhookEvent({ event_type: triggerForm.event_type, payload });
      notify(`Dispatched ${result.dispatched} webhooks.`);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const renderPortal = () => (
    <>
      <Section title="Organizations">
        <form onSubmit={handleCreateOrg} className="gateway-form">
          <input
            placeholder="Organization name"
            value={form.org_name}
            onChange={(e) => setForm({ ...form, org_name: e.target.value })}
          />
          <input
            placeholder="Contact email"
            type="email"
            value={form.org_email}
            onChange={(e) => setForm({ ...form, org_email: e.target.value })}
          />
          <button type="submit">Create Organization</button>
        </form>
        <table className="gateway-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr key={org.id}>
                <td>{org.name}</td>
                <td>{org.contact_email}</td>
                <td>{org.status}</td>
                <td>
                  <button onClick={() => handleApproveOrg(org.id, "approved")}>Approve</button>
                  <button onClick={() => handleApproveOrg(org.id, "suspended")}>Suspend</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Applications">
        <form onSubmit={handleCreateApp} className="gateway-form">
          <input
            placeholder="App name"
            value={form.app_name}
            onChange={(e) => setForm({ ...form, app_name: e.target.value })}
          />
          <input
            placeholder="Organization ID"
            type="number"
            value={form.org_id}
            onChange={(e) => setForm({ ...form, org_id: e.target.value })}
          />
          <input
            placeholder="Scopes (comma separated)"
            value={form.scopes}
            onChange={(e) => setForm({ ...form, scopes: e.target.value })}
          />
          <button type="submit">Create Application</button>
        </form>
        <table className="gateway-table">
          <thead>
            <tr><th>Name</th><th>Organization</th><th>Status</th><th>Scopes</th></tr>
          </thead>
          <tbody>
            {applications.map((app) => (
              <tr key={app.id}>
                <td>{app.name}</td>
                <td>{app.organization_name}</td>
                <td>{app.status}</td>
                <td>{(app.scopes || []).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="API Keys">
        <form onSubmit={handleCreateKey} className="gateway-form">
          <input
            placeholder="Application ID"
            type="number"
            value={keyForm.app_id}
            onChange={(e) => setKeyForm({ ...keyForm, app_id: e.target.value })}
          />
          <input
            placeholder="Key name"
            value={keyForm.name}
            onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
          />
          <button type="submit">Generate Key</button>
        </form>
        <table className="gateway-table">
          <thead>
            <tr><th>Name</th><th>Prefix</th><th>Status</th><th>Last Used</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>{key.prefix}…</td>
                <td>{key.revoked ? "revoked" : "active"}</td>
                <td>{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "—"}</td>
                <td>
                  {!key.revoked ? (
                    <>
                      <button onClick={() => handleRotateKey(key.id)}>Rotate</button>
                      <button onClick={() => handleRevokeKey(key.id)}>Revoke</button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Webhook Subscriptions">
        <form onSubmit={handleCreateWebhook} className="gateway-form">
          <input
            placeholder="Application ID"
            type="number"
            value={webhookForm.app_id}
            onChange={(e) => setWebhookForm({ ...webhookForm, app_id: e.target.value })}
          />
          <input
            placeholder="Webhook URL"
            value={webhookForm.url}
            onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
          />
          <input
            placeholder="Events (comma separated)"
            value={webhookForm.events}
            onChange={(e) => setWebhookForm({ ...webhookForm, events: e.target.value })}
          />
          <button type="submit">Subscribe</button>
        </form>
        <ul className="gateway-list">
          {webhooks.map((w) => (
            <li key={w.id}>{w.url} — {(w.events || []).join(", ")}</li>
          ))}
        </ul>
      </Section>

      <Section title="Usage">
        <div className="gateway-grid">
          <MetricCard label="Total Calls" value={usage?.total_calls} />
          <MetricCard label="Success" value={usage?.success} />
          <MetricCard label="Errors" value={usage?.errors} />
        </div>
      </Section>
    </>
  );

  const renderAnalytics = () => (
    <>
      <Section title="Gateway Analytics">
        <div className="gateway-grid">
          <MetricCard label="Total Integrations" value={analytics?.total_integrations} />
          <MetricCard label="Active Applications" value={analytics?.active_applications} />
          <MetricCard label="Total Calls" value={analytics?.total_calls} />
          <MetricCard label="Success Rate" value={`${analytics?.success_rate_pct}%`} />
          <MetricCard label="Error Rate" value={`${analytics?.error_rate_pct}%`} />
          <MetricCard label="Avg Latency (ms)" value={analytics?.avg_latency_ms} />
          <MetricCard label="P95 Latency (ms)" value={analytics?.latency_p95_ms} />
          <MetricCard label="P99 Latency (ms)" value={analytics?.latency_p99_ms} />
          <MetricCard label="4xx Errors" value={analytics?.errors_4xx} />
          <MetricCard label="5xx Errors" value={analytics?.errors_5xx} />
        </div>
      </Section>

      <Section title="Top Consumers">
        <ul className="gateway-list">
          {(analytics?.top_consumers || []).map((c, idx) => (
            <li key={idx}>{c.application__name} — {c.count} calls</li>
          ))}
        </ul>
      </Section>

      <Section title="Top Paths">
        <ul className="gateway-list">
          {(analytics?.top_paths || []).map((p, idx) => (
            <li key={idx}>{p.path} — {p.count} calls</li>
          ))}
        </ul>
      </Section>

      <Section title="Recent Logs">
        <table className="gateway-table">
          <thead>
            <tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Latency</th></tr>
          </thead>
          <tbody>
            {logs.slice(0, 20).map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString()}</td>
                <td>{log.method}</td>
                <td>{log.path}</td>
                <td>{log.status_code}</td>
                <td>{log.response_time_ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Trigger Webhook Event">
        <form onSubmit={handleTrigger} className="gateway-form">
          <select
            value={triggerForm.event_type}
            onChange={(e) => setTriggerForm({ ...triggerForm, event_type: e.target.value })}
          >
            <option value="">Select event</option>
            {WEBHOOK_EVENTS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <textarea
            placeholder='Payload JSON (optional)'
            value={triggerForm.payload}
            onChange={(e) => setTriggerForm({ ...triggerForm, payload: e.target.value })}
          />
          <button type="submit">Dispatch</button>
        </form>
      </Section>
    </>
  );

  const renderCeoDashboard = () => (
    <>
      <Section title="Executive Integration Overview">
        <div className="gateway-grid">
          <MetricCard label="Total Integrations" value={ceoDashboard?.total_integrations} />
          <MetricCard label="Active Applications" value={ceoDashboard?.active_applications} />
          <MetricCard label="Active API Keys" value={ceoDashboard?.active_api_keys} />
          <MetricCard label="API Revenue (MRU)" value={ceoDashboard?.api_revenue_mru ?? "N/A"} />
          <MetricCard label="Platform Calls" value={ceoDashboard?.platform_usage?.total_calls} />
          <MetricCard label="Success Rate" value={`${ceoDashboard?.platform_usage?.success_rate_pct ?? 0}%`} />
        </div>
      </Section>

      <Section title="Partner Activity">
        <table className="gateway-table">
          <thead>
            <tr><th>Organization</th><th>Applications</th><th>Recent API Calls</th><th>Status</th></tr>
          </thead>
          <tbody>
            {(ceoDashboard?.partner_activity || []).map((row, idx) => (
              <tr key={idx}>
                <td>{row.organization}</td>
                <td>{row.applications}</td>
                <td>{row.recent_api_calls}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Top Integrators">
        <ul className="gateway-list">
          {(ceoDashboard?.top_integrators || []).map((c, idx) => (
            <li key={idx}>{c.application__name} — {c.count} calls</li>
          ))}
        </ul>
      </Section>
    </>
  );

  const renderDocs = () => (
    <Section title="Integration Documentation">
      <div className="gateway-doc-links">
        <button type="button" onClick={() => handleLoadDoc("integration")}>Integration Guide</button>
        <button type="button" onClick={() => handleLoadDoc("authentication")}>Authentication Guide</button>
        <button type="button" onClick={() => handleLoadDoc("webhooks")}>Webhook Guide</button>
        <a href={`${window.location.origin.replace(":3000", ":8000")}/api/docs/`} target="_blank" rel="noreferrer">
          Open Swagger UI
        </a>
      </div>
      <ul className="gateway-list">
        <li>Partner API base URL: <code>/api-gateway/v1/partner/</code></li>
        <li>OpenAPI schema: <code>/api/schema/</code></li>
        <li>Include header <code>X-API-Key</code> with every request.</li>
      </ul>
      {docContent?.content ? (
        <div className="gateway-doc-content">{docContent.content}</div>
      ) : null}
      <h4>SDK Examples</h4>
      <pre className="gateway-pre">
{`curl -H "X-API-Key: yala_..." \\
  https://api.yala.com/api-gateway/v1/partner/rides/`}
      </pre>
      <pre className="gateway-pre">
{`import requests

response = requests.get(
    "https://api.yala.com/api-gateway/v1/partner/rides/",
    headers={"X-API-Key": "yala_..."},
)
print(response.json())`}
      </pre>
    </Section>
  );

  return (
    <div className="beta__container">
      <header className="beta__header">
        <div>
          <h1 className="beta__title">API Gateway & Integration Platform</h1>
          <p className="beta__subtitle">Manage partner integrations, API keys, webhooks, and analytics.</p>
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {message ? <p className="beta__success">{message}</p> : null}

      <div className="gateway-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`gateway-tab ${tab === item.id ? "gateway-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="gateway-content">
        {tab === "portal" && renderPortal()}
        {tab === "analytics" && renderAnalytics()}
        {tab === "ceo" && renderCeoDashboard()}
        {tab === "docs" && renderDocs()}
      </div>
    </div>
  );
}
