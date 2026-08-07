/**
 * Approval Center — Enterprise-grade user approval management.
 *
 * Provides centralized approval workflow for Riders, Drivers, and Delivery Couriers.
 * Comparable to Uber/Lyft/Bolt admin approval systems.
 *
 * Features:
 * - Dashboard cards with counts and one-click navigation
 * - Three approval queues (Riders, Drivers, Couriers)
 * - Search, filter, sort, pagination, bulk actions
 * - Detailed application review with document viewer
 * - Approval history and audit log
 * - CEO override capabilities
 * - Mobile responsive
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import "./ApprovalCenter.css";

// ─── Constants ───────────────────────────────────────────────────────────────
const TABS = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "riders", label: "Riders", icon: "👤" },
  { key: "drivers", label: "Drivers", icon: "🚗" },
  { key: "couriers", label: "Couriers", icon: "📦" },
  { key: "history", label: "History", icon: "📜" },
];

const STATUS_BADGES = {
  pending: { label: "Pending", color: "#f59e0b", bg: "#fef3c7" },
  pending_review: { label: "Pending Review", color: "#f59e0b", bg: "#fef3c7" },
  approved: { label: "Approved", color: "#059669", bg: "#d1fae5" },
  rejected: { label: "Rejected", color: "#dc2626", bg: "#fee2e2" },
  suspended: { label: "Suspended", color: "#7c3aed", bg: "#ede9fe" },
  info_requested: { label: "More Info Required", color: "#2563eb", bg: "#dbeafe" },
  active: { label: "Active", color: "#059669", bg: "#d1fae5" },
  inactive: { label: "Inactive", color: "#6b7280", bg: "#f3f4f6" },
};

const PAGE_SIZE = 20;

// ─── Utility ─────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }) {
  const config = STATUS_BADGES[status] || STATUS_BADGES.pending;
  return (
    <span
      className="approval-badge"
      style={{ color: config.color, backgroundColor: config.bg, borderColor: config.color }}
    >
      {config.label}
    </span>
  );
}

// ─── Dashboard Cards ─────────────────────────────────────────────────────────
function DashboardCards({ stats, onNavigate }) {
  const cards = [
    { key: "pending_riders", label: "Pending Riders", value: stats.pending_riders, icon: "👤", tab: "riders", filter: "pending" },
    { key: "pending_drivers", label: "Pending Drivers", value: stats.pending_drivers, icon: "🚗", tab: "drivers", filter: "pending" },
    { key: "pending_couriers", label: "Pending Couriers", value: stats.pending_couriers, icon: "📦", tab: "couriers", filter: "pending" },
    { key: "approved_today", label: "Approved Today", value: stats.approved_today, icon: "✅" },
    { key: "rejected_today", label: "Rejected Today", value: stats.rejected_today, icon: "❌" },
    { key: "suspended", label: "Suspended", value: stats.suspended_accounts, icon: "⚠️" },
    { key: "active_riders", label: "Active Riders", value: stats.active_riders, icon: "🟢" },
    { key: "active_drivers", label: "Active Drivers", value: stats.active_drivers, icon: "🟢" },
    { key: "active_couriers", label: "Active Couriers", value: stats.active_couriers, icon: "🟢" },
  ];

  return (
    <div className="approval-cards">
      {cards.map((card) => (
        <button
          key={card.key}
          type="button"
          className="approval-card"
          onClick={() => card.tab && onNavigate(card.tab, card.filter)}
        >
          <span className="approval-card__icon">{card.icon}</span>
          <span className="approval-card__value">{card.value ?? 0}</span>
          <span className="approval-card__label">{card.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Approval Queue Table ────────────────────────────────────────────────────
function ApprovalQueue({ type, items, loading, page, totalPages, onPageChange, onSearch, onFilter, onSort, onSelect, onBulkAction, selectedIds, onToggleSelect }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const handleSearch = (e) => {
    setSearch(e.target.value);
    onSearch(e.target.value);
  };

  const handleFilter = (e) => {
    setStatusFilter(e.target.value);
    onFilter(e.target.value);
  };

  const handleSort = (e) => {
    setSortBy(e.target.value);
    onSort(e.target.value);
  };

  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));

  return (
    <div className="approval-queue">
      <div className="approval-queue__toolbar">
        <input
          type="search"
          className="approval-queue__search"
          placeholder={`Search ${type}...`}
          value={search}
          onChange={handleSearch}
        />
        <select className="approval-queue__filter" value={statusFilter} onChange={handleFilter}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
          <option value="info_requested">Info Requested</option>
        </select>
        <select className="approval-queue__sort" value={sortBy} onChange={handleSort}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name_asc">Name A-Z</option>
          <option value="name_desc">Name Z-A</option>
        </select>
        {selectedIds.size > 0 && (
          <div className="approval-queue__bulk">
            <span>{selectedIds.size} selected</span>
            <button type="button" className="approval-btn approval-btn--success" onClick={() => onBulkAction("approve")}>
              Bulk Approve
            </button>
            <button type="button" className="approval-btn approval-btn--danger" onClick={() => onBulkAction("reject")}>
              Bulk Reject
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="approval-queue__loading">Loading applications...</div>
      ) : items.length === 0 ? (
        <div className="approval-queue__empty">No applications found.</div>
      ) : (
        <div className="approval-queue__table-wrap">
          <table className="approval-queue__table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => onToggleSelect(allSelected ? "none" : "all")}
                    aria-label="Select all"
                  />
                </th>
                <th>Applicant</th>
                <th>Phone</th>
                <th>City</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={selectedIds.has(item.id) ? "selected" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => onToggleSelect(item.id)}
                      aria-label={`Select ${item.full_name}`}
                    />
                  </td>
                  <td className="approval-queue__name-cell">
                    <div className="approval-queue__avatar">
                      {item.profile_picture ? (
                        <img src={item.profile_picture} alt="" />
                      ) : (
                        <span>{(item.full_name || "?")[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <strong>{item.full_name || item.email}</strong>
                      <small>{item.email}</small>
                    </div>
                  </td>
                  <td>{item.phone_number || "—"}</td>
                  <td>{item.city_name || "—"}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{formatDate(item.created_at || item.date_joined)}</td>
                  <td>
                    <button
                      type="button"
                      className="approval-btn approval-btn--outline"
                      onClick={() => onSelect(item)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="approval-queue__pagination">
          <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── Application Detail Panel ────────────────────────────────────────────────
function ApplicationDetail({ application, type, onAction, onClose, isCeo }) {
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [activeDoc, setActiveDoc] = useState(null);

  if (!application) return null;

  const handleAction = async (action) => {
    if ((action === "reject" || action === "suspend") && !reason.trim()) {
      alert(`Please provide a reason for ${action}.`);
      return;
    }
    setActionLoading(true);
    await onAction(application, action, reason);
    setActionLoading(false);
    setReason("");
  };

  const documents = application.documents || [];
  const vehicleInfo = application.vehicle || {};

  return (
    <div className="approval-detail" role="dialog" aria-label="Application review">
      <div className="approval-detail__header">
        <h2>Application Review</h2>
        <button type="button" className="approval-detail__close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="approval-detail__body">
        {/* Personal Information */}
        <section className="approval-detail__section">
          <h3>Personal Information</h3>
          <div className="approval-detail__profile">
            <div className="approval-detail__photo">
              {application.profile_picture ? (
                <img src={application.profile_picture} alt="Profile" />
              ) : (
                <div className="approval-detail__photo-placeholder">
                  {(application.full_name || "?")[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="approval-detail__info-grid">
              <div><label>Full Name</label><span>{application.full_name || "—"}</span></div>
              <div><label>Gender</label><span>{application.gender || "—"}</span></div>
              <div><label>Date of Birth</label><span>{formatDate(application.date_of_birth)}</span></div>
              <div><label>Phone</label><span>{application.phone_number || "—"}</span></div>
              <div><label>Email</label><span>{application.email || "—"}</span></div>
              <div><label>City</label><span>{application.city_name || "—"}</span></div>
              <div><label>National ID</label><span>{application.national_id_number || "—"}</span></div>
              <div><label>Registered</label><span>{formatDate(application.date_joined || application.created_at)}</span></div>
              <div><label>Status</label><StatusBadge status={application.status} /></div>
            </div>
          </div>
        </section>

        {/* Documents */}
        {documents.length > 0 && (
          <section className="approval-detail__section">
            <h3>Documents</h3>
            <div className="approval-detail__documents">
              {documents.map((doc) => (
                <div key={doc.id || doc.document_type} className="approval-detail__doc-card">
                  <div className="approval-detail__doc-info">
                    <strong>{doc.document_type_display || doc.document_type}</strong>
                    <StatusBadge status={doc.status} />
                    {doc.expires_at && <small>Expires: {formatDate(doc.expires_at)}</small>}
                  </div>
                  {doc.file_url && (
                    <button
                      type="button"
                      className="approval-btn approval-btn--outline"
                      onClick={() => setActiveDoc(doc)}
                    >
                      View
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Vehicle (Drivers/Couriers) */}
        {(type === "drivers" || type === "couriers") && (
          <section className="approval-detail__section">
            <h3>Vehicle Information</h3>
            <div className="approval-detail__info-grid">
              <div><label>Type</label><span>{vehicleInfo.car_type || application.car_type || "—"}</span></div>
              <div><label>Make</label><span>{vehicleInfo.vehicle_make || application.vehicle_make || "—"}</span></div>
              <div><label>Model</label><span>{vehicleInfo.vehicle_model || application.vehicle_model || "—"}</span></div>
              <div><label>Color</label><span>{vehicleInfo.vehicle_color || application.vehicle_color || "—"}</span></div>
              <div><label>Plate Number</label><span>{vehicleInfo.plate_number || application.plate_number || application.vehicle_plate || "—"}</span></div>
            </div>
            {(application.vehicle_photo || vehicleInfo.vehicle_photo) && (
              <img
                className="approval-detail__vehicle-photo"
                src={application.vehicle_photo || vehicleInfo.vehicle_photo}
                alt="Vehicle"
              />
            )}
          </section>
        )}

        {/* Approval History */}
        {application.approval_history && application.approval_history.length > 0 && (
          <section className="approval-detail__section">
            <h3>Approval History</h3>
            <div className="approval-detail__history">
              {application.approval_history.map((entry, idx) => (
                <div key={idx} className="approval-detail__history-entry">
                  <StatusBadge status={entry.action} />
                  <span className="approval-detail__history-admin">{entry.admin_name}</span>
                  <span className="approval-detail__history-date">{formatDateTime(entry.timestamp)}</span>
                  {entry.reason && <p className="approval-detail__history-reason">"{entry.reason}"</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Action Buttons */}
        <section className="approval-detail__actions">
          <textarea
            className="approval-detail__reason"
            placeholder="Reason (required for reject/suspend)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <div className="approval-detail__buttons">
            <button
              type="button"
              className="approval-btn approval-btn--success"
              onClick={() => handleAction("approve")}
              disabled={actionLoading}
            >
              ✓ Approve
            </button>
            <button
              type="button"
              className="approval-btn approval-btn--danger"
              onClick={() => handleAction("reject")}
              disabled={actionLoading}
            >
              ✕ Reject
            </button>
            <button
              type="button"
              className="approval-btn approval-btn--info"
              onClick={() => handleAction("request_info")}
              disabled={actionLoading}
            >
              ℹ Request More Info
            </button>
            <button
              type="button"
              className="approval-btn approval-btn--warning"
              onClick={() => handleAction("suspend")}
              disabled={actionLoading}
            >
              ⚠ Suspend
            </button>
            {(application.status === "suspended" || application.status === "rejected") && (
              <button
                type="button"
                className="approval-btn approval-btn--outline"
                onClick={() => handleAction("reactivate")}
                disabled={actionLoading}
              >
                ↺ Reactivate
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Document Viewer Modal */}
      {activeDoc && (
        <div className="approval-docviewer" onClick={() => setActiveDoc(null)}>
          <div className="approval-docviewer__content" onClick={(e) => e.stopPropagation()}>
            <button className="approval-docviewer__close" onClick={() => setActiveDoc(null)}>✕</button>
            <h4>{activeDoc.document_type_display || activeDoc.document_type}</h4>
            {activeDoc.file_url?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <img src={activeDoc.file_url} alt="Document" className="approval-docviewer__img" />
            ) : (
              <iframe src={activeDoc.file_url} title="Document" className="approval-docviewer__iframe" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Approval History ─────────────────────────────────────────────────────────
function ApprovalHistory() {
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  useEffect(() => {
    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const res = await authenticatedApi.get(`${API_URL}/admin/approvals/history/?page=${historyPage}&page_size=30`);
        const data = res.data || {};
        setHistoryItems(data.results || []);
        setHistoryTotalPages(data.total_pages || 1);
      } catch (err) {
        console.error("Failed to load approval history:", err);
        setHistoryItems([]);
      } finally {
        setHistoryLoading(false);
      }
    }
    loadHistory();
  }, [historyPage]);

  if (historyLoading) return <div className="approval-queue__loading">Loading history...</div>;
  if (historyItems.length === 0) return <div className="approval-queue__empty">No approval history yet.</div>;

  return (
    <div className="approval-queue">
      <div className="approval-queue__table-wrap">
        <table className="approval-queue__table">
          <thead>
            <tr>
              <th>Admin</th>
              <th>Action</th>
              <th>Target Type</th>
              <th>User ID</th>
              <th>Reason</th>
              <th>CEO Override</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {historyItems.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.admin_name}</strong></td>
                <td><StatusBadge status={item.action} /></td>
                <td style={{ textTransform: "capitalize" }}>{item.target_type}</td>
                <td>{item.target_user_id}</td>
                <td>{item.reason || "—"}</td>
                <td>{item.is_ceo_override ? "👔 Yes" : "No"}</td>
                <td>{formatDateTime(item.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {historyTotalPages > 1 && (
        <div className="approval-queue__pagination">
          <button disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>← Prev</button>
          <span>Page {historyPage} of {historyTotalPages}</span>
          <button disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ApprovalCenter() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState({});
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [isCeo, setIsCeo] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await authenticatedApi.get(`${API_URL}/admin/approvals/stats/`);
      setStats(res.data || {});
      setIsCeo(res.data?.is_ceo || false);
    } catch (err) {
      console.error("Failed to load approval stats:", err);
    }
  }, []);

  // Fetch queue items
  const fetchQueue = useCallback(async (type, page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (sortOrder) params.set("sort", sortOrder);

      const res = await authenticatedApi.get(`${API_URL}/admin/approvals/${type}/?${params}`);
      const data = res.data || {};
      setItems(data.results || data.items || (Array.isArray(data) ? data : []));
      setTotalPages(data.total_pages || Math.ceil((data.count || 0) / PAGE_SIZE) || 1);
    } catch (err) {
      console.error(`Failed to load ${type} queue:`, err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, sortOrder]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Reset to page 1 when search/filter/sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sortOrder]);

  useEffect(() => {
    if (activeTab !== "dashboard" && activeTab !== "history") {
      fetchQueue(activeTab, currentPage);
    }
  }, [activeTab, currentPage, fetchQueue]);

  const handleTabChange = (tab, filter) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSelectedIds(new Set());
    setSelectedApplication(null);
    if (filter) setStatusFilter(filter);
  };

  const handleAction = async (application, action, reason) => {
    try {
      const type = activeTab;
      await authenticatedApi.post(`${API_URL}/admin/approvals/${type}/${application.id}/${action}/`, {
        reason,
      });
      showToast(`${action.replace("_", " ")} successful for ${application.full_name || application.email}`);
      setSelectedApplication(null);
      fetchQueue(activeTab, currentPage);
      fetchStats();
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || "Action failed";
      showToast(`Error: ${msg}`);
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedIds.size === 0) return;
    const confirmMsg = `Are you sure you want to ${action} ${selectedIds.size} applications?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await authenticatedApi.post(`${API_URL}/admin/approvals/${activeTab}/bulk/`, {
        ids: Array.from(selectedIds),
        action,
      });
      showToast(`Bulk ${action} completed for ${selectedIds.size} applications`);
      setSelectedIds(new Set());
      fetchQueue(activeTab, currentPage);
      fetchStats();
    } catch (err) {
      showToast("Bulk action failed");
    }
  };

  const handleToggleSelect = (target) => {
    if (target === "all") {
      setSelectedIds(new Set(items.map((i) => i.id)));
    } else if (target === "none") {
      setSelectedIds(new Set());
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(target)) next.delete(target);
        else next.add(target);
        return next;
      });
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  return (
    <div className="approval-center">
      {/* Tab Navigation */}
      <nav className="approval-center__tabs" aria-label="Approval center navigation">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`approval-center__tab ${activeTab === tab.key ? "approval-center__tab--active" : ""}`}
            onClick={() => handleTabChange(tab.key)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.key === "riders" && stats.pending_riders > 0 && (
              <span className="approval-center__badge">{stats.pending_riders}</span>
            )}
            {tab.key === "drivers" && stats.pending_drivers > 0 && (
              <span className="approval-center__badge">{stats.pending_drivers}</span>
            )}
            {tab.key === "couriers" && stats.pending_couriers > 0 && (
              <span className="approval-center__badge">{stats.pending_couriers}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="approval-center__content">
        {activeTab === "dashboard" && (
          <DashboardCards stats={stats} onNavigate={handleTabChange} />
        )}

        {(activeTab === "riders" || activeTab === "drivers" || activeTab === "couriers") && !selectedApplication && (
          <ApprovalQueue
            key={activeTab}
            type={activeTab}
            items={items}
            loading={loading}
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            onSearch={setSearchQuery}
            onFilter={setStatusFilter}
            onSort={setSortOrder}
            onSelect={setSelectedApplication}
            onBulkAction={handleBulkAction}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        )}

        {selectedApplication && (
          <ApplicationDetail
            application={selectedApplication}
            type={activeTab}
            onAction={handleAction}
            onClose={() => setSelectedApplication(null)}
            isCeo={isCeo}
          />
        )}

        {activeTab === "history" && (
          <ApprovalHistory />
        )}
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="approval-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
