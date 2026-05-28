import React, { useCallback, useEffect, useState } from "react";
import { API_URL } from "../apiConfig";
import { MARKET, formatMoney } from "../marketConfig";

const MARKET_OWNER_PERCENT = MARKET.ownerCommissionPercent;
const logoSrc = "/sakho-brand-logo.jpeg";

const normalizeText = (value) => String(value || "").toLowerCase();

const matchesSearch = (item, query, fields) => {
  const normalizedQuery = normalizeText(query).trim();

  if (!normalizedQuery) return true;

  return fields.some((field) => normalizeText(item[field]).includes(normalizedQuery));
};

const formatDocumentStatus = (status) => {
  if (status === "valid") return "Valid";
  if (status === "expiring_soon") return "Expiring soon";
  if (status === "expired") return "Expired";
  return "Missing expiration";
};

const documentStatusStyle = (status) => ({
  color:
    status === "valid"
      ? "#166534"
      : status === "expiring_soon"
        ? "#92400e"
        : "#991b1b",
  fontWeight: 900,
});

const formatYearsUsingApp = (years) => {
  const value = Number(years || 0);
  return `${value} ${value === 1 ? "year" : "years"} using app`;
};

const getStatusBadgeStyle = (status) => {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "approved" || normalized === "active" || normalized === "valid") {
    return {
      background: "#ecfdf3",
      color: "#166534",
      borderColor: "#bbf7d0",
    };
  }

  if (normalized === "rejected" || normalized === "blocked" || normalized === "expired") {
    return {
      background: "#fee2e2",
      color: "#b91c1c",
      borderColor: "#fecaca",
    };
  }

  return {
    background: "#fff7ed",
    color: "#9a3412",
    borderColor: "#fed7aa",
  };
};

const getAlphabetName = (item) =>
  (
    item.full_name ||
    item.driver_name ||
    `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
    item.email ||
    item.driver_email ||
    ""
  ).toLowerCase();

const sortAlphabetically = (items) =>
  [...items].sort((first, second) =>
    getAlphabetName(first).localeCompare(getAlphabetName(second), undefined, {
      sensitivity: "base",
    })
  );

function AdminDashboard() {
  const DRIVER_CATEGORIES = [
    { value: "gold", label: "Gold" },
    { value: "platinum", label: "Platinum" },
    { value: "diamond", label: "Diamond" },
    { value: "elite", label: "Elite" },
  ];

  const [page, setPage] = useState("verification");
  const [searchQuery, setSearchQuery] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [users, setUsers] = useState([]);
  const [rides, setRides] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [ownerPayoutSummary, setOwnerPayoutSummary] = useState({
    owner_commission_percent: MARKET_OWNER_PERCENT,
    owner_commission_balance: 0,
    methods: [],
  });
  const [ownerPayoutSaving, setOwnerPayoutSaving] = useState(false);
  const [ownerPayoutMessage, setOwnerPayoutMessage] = useState("");
  const [ownerPayoutForm, setOwnerPayoutForm] = useState({
    payout_type: "bank_account",
    account_holder_name: "",
    bank_name: "",
    account_reference: "",
    phone_number: "",
    wallet_id: "",
  });

  const getToken = () => {
    return localStorage.getItem("access");
  };

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${getToken()}`,
  }), []);

  const fetchDrivers = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/drivers/list/`);
      const data = await response.json();
      setDrivers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      setDrivers([]);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/auth/users/`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching users:", error);
      setUsers([]);
    }
  }, [authHeaders]);

  const fetchRides = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/rides/history/`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      setRides(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching rides:", error);
      setRides([]);
    }
  }, [authHeaders]);

  const fetchWithdrawals = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/payments/withdrawals/`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      setWithdrawals(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Withdrawal fetch error:", error);
      setWithdrawals([]);
    }
  }, [authHeaders]);

  const fetchOwnerPayout = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/payments/owner-payout/`, {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        setOwnerPayoutSummary((current) => ({
          ...current,
          methods: [],
        }));
        return;
      }

      setOwnerPayoutSummary({
        owner_commission_percent: data.owner_commission_percent || MARKET_OWNER_PERCENT,
        owner_commission_balance: data.owner_commission_balance || 0,
        methods: Array.isArray(data.methods) ? data.methods : [],
      });
    } catch (error) {
      console.error("Owner payout fetch error:", error);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchDrivers();
    fetchUsers();
    fetchRides();
    fetchWithdrawals();
    fetchOwnerPayout();
  }, [fetchDrivers, fetchOwnerPayout, fetchRides, fetchUsers, fetchWithdrawals]);

  const approveDriver = async (id) => {
    try {
      const response = await fetch(`${API_URL}/drivers/approve/${id}/`, {
        method: "POST",
        headers: {
          ...authHeaders(),
        },
      });

      if (response.ok) {
        alert("Driver approved ✅");
        fetchDrivers();
      } else {
        alert("Could not approve driver");
      }
    } catch (error) {
      console.error(error);
      alert("Server error approving driver");
    }
  };

  const rejectDriver = async (id) => {
    try {
      const response = await fetch(`${API_URL}/drivers/reject/${id}/`, {
        method: "POST",
        headers: {
          ...authHeaders(),
        },
      });

      if (response.ok) {
        alert("Driver rejected ❌");
        fetchDrivers();
      } else {
        alert("Could not reject driver");
      }
    } catch (error) {
      console.error(error);
      alert("Server error rejecting driver");
    }
  };

  const reintegrateDriver = async (id) => {
    try {
      const response = await fetch(`${API_URL}/drivers/reintegrate/${id}/`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "approved",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Could not reintegrate driver");
        return;
      }

      alert(data.message || "Driver reintegrated");
      fetchDrivers();
      fetchUsers();
    } catch (error) {
      console.error(error);
      alert("Server error reintegrating driver");
    }
  };

  const setUserBlocked = async (userId, shouldBlock) => {
    try {
      const endpoint = shouldBlock ? "block" : "unblock";
      const response = await fetch(`${API_URL}/auth/users/${userId}/${endpoint}/`, {
        method: "POST",
        headers: authHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Could not update user");
        return;
      }

      alert(data.message || "User updated");
      fetchUsers();
      fetchDrivers();
    } catch (error) {
      console.error(error);
      alert("Server error updating user");
    }
  };

  const updateRiderApproval = async (userId, action) => {
    try {
      const response = await fetch(`${API_URL}/auth/users/${userId}/${action}-rider/`, {
        method: "POST",
        headers: authHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || data.detail || "Could not update rider application");
        return;
      }

      alert(data.message || "Rider application updated");
      fetchUsers();
    } catch (error) {
      console.error(error);
      alert("Server error updating rider application");
    }
  };

  const updateDriverCategory = async (driverId, driverCategory) => {
    try {
      const token = getToken();

      if (!token) {
        alert("Please log in as admin before changing driver category.");
        window.location.href = "/login";
        return;
      }

      const response = await fetch(`${API_URL}/drivers/category/${driverId}/`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          driver_category: driverCategory,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || data.detail || "Could not update driver category");

        if (response.status === 401 || response.status === 403) {
          window.location.href = "/login";
        }

        return;
      }

      alert(data.message || "Driver category updated");
      fetchDrivers();
      fetchUsers();
    } catch (error) {
      console.error(error);
      alert("Server error updating driver category");
    }
  };

  const approveWithdrawal = async (id) => {
    try {
      const response = await fetch(
        `${API_URL}/payments/withdrawals/${id}/approve/`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );

      if (response.ok) {
        alert("Withdrawal approved ✅");
        fetchWithdrawals();
      } else {
        alert("Could not approve withdrawal");
      }
    } catch (error) {
      console.error(error);
      alert("Server error approving withdrawal");
    }
  };

  const rejectWithdrawal = async (id) => {
    try {
      const response = await fetch(
        `${API_URL}/payments/withdrawals/${id}/reject/`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );

      if (response.ok) {
        alert("Withdrawal rejected ❌");
        fetchWithdrawals();
      } else {
        alert("Could not reject withdrawal");
      }
    } catch (error) {
      console.error(error);
      alert("Server error rejecting withdrawal");
    }
  };

  const updateOwnerPayoutForm = (field, value) => {
    setOwnerPayoutForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveOwnerPayoutMethod = async (event) => {
    event.preventDefault();

    try {
      setOwnerPayoutSaving(true);
      setOwnerPayoutMessage("");

      const response = await fetch(`${API_URL}/payments/owner-payout/save/`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ownerPayoutForm),
      });

      const data = await response.json();

      if (!response.ok) {
        setOwnerPayoutMessage(
          data.error ||
            data.detail ||
            (Array.isArray(data.non_field_errors) ? data.non_field_errors.join(" ") : "") ||
            "Could not save owner payout method."
        );
        return;
      }

      setOwnerPayoutMessage("Owner payout method saved successfully.");
      fetchOwnerPayout();
    } catch (error) {
      console.error("Owner payout save error:", error);
      setOwnerPayoutMessage("Server error saving owner payout method.");
    } finally {
      setOwnerPayoutSaving(false);
    }
  };

  const getFileUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `${API_URL}${path}`;
  };

  const menuItems = [
    { key: "verification", label: "Verification" },
    { key: "riders", label: "Riders" },
    { key: "drivers", label: "Drivers" },
    { key: "rides", label: "Dispatch" },
    { key: "vehicles", label: "Vehicles" },
    { key: "payments", label: "Payments" },
    { key: "withdrawals", label: "Withdrawals" },
    { key: "analytics", label: "Analytics" },
  ];

  const alphabetDrivers = sortAlphabetically(drivers);
  const pendingDrivers = alphabetDrivers.filter((driver) => driver.status === "pending");
  const approvedDrivers = alphabetDrivers.filter(
    (driver) => driver.status === "approved"
  );
  const rejectedDrivers = alphabetDrivers.filter(
    (driver) => driver.status === "rejected"
  );
  const onlineDrivers = drivers.filter((driver) => driver.is_available);
  const riders = sortAlphabetically(
    users.filter((user) => user.is_rider && !user.is_staff)
  );
  const pendingRiders = riders.filter((user) => user.rider_status === "pending");
  const approvedRiders = riders.filter((user) => user.rider_status === "approved");
  const rejectedRiders = riders.filter((user) => user.rider_status === "rejected");
  const platformDrivers = sortAlphabetically(
    users.filter((user) => user.is_driver && !user.is_staff)
  );
  const blockedUsers = users.filter((user) => !user.is_active && !user.is_staff);

  const paidRides = rides.filter((ride) => ride.payment_status === "paid");
  const unpaidRides = rides.filter((ride) => ride.payment_status !== "paid");
  const completedRides = rides.filter((ride) => ride.status === "completed");
  const cancelledRides = rides.filter((ride) => ride.status === "cancelled");

  const pendingWithdrawals = withdrawals.filter(
    (item) => item.status === "pending"
  );
  const approvedWithdrawals = withdrawals.filter(
    (item) => item.status === "approved"
  );
  const rejectedWithdrawals = withdrawals.filter(
    (item) => item.status === "rejected"
  );

  const totalRevenue = rides.reduce(
    (total, ride) => total + Number(ride.fare || 0),
    0
  );

  const platformCommission = rides.reduce(
    (total, ride) => total + Number(ride.app_fee || 0),
    0
  );

  const driverPayouts = rides.reduce(
    (total, ride) => total + Number(ride.driver_earning || 0),
    0
  );
  const ownerCommissionPercent =
    totalRevenue > 0
      ? Math.round((platformCommission / totalRevenue) * 1000) / 10
      : MARKET_OWNER_PERCENT;
  const monthlyRevenueMap = rides.reduce((accumulator, ride) => {
    const date = new Date(ride.completed_at || ride.updated_at || ride.created_at || Date.now());
    const label = date.toLocaleString("en-US", { month: "short", year: "2-digit" });
    accumulator[label] = (accumulator[label] || 0) + Number(ride.fare || 0);
    return accumulator;
  }, {});
  const monthlyRevenue = Object.entries(monthlyRevenueMap)
    .slice(-6)
    .map(([label, value]) => ({ label, value }));
  const rideOutcome = [
    { label: "Completed", value: completedRides.length, color: "#16a34a" },
    { label: "Cancelled", value: cancelledRides.length, color: "#dc2626" },
  ];

  const totalWithdrawRequested = withdrawals.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  const totalApprovedWithdrawals = approvedWithdrawals.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );
  const menuCounts = {
    verification: pendingDrivers.length,
    riders: riders.length,
    drivers: platformDrivers.length,
    rides: rides.length,
    vehicles: drivers.length,
    payments: paidRides.length,
    withdrawals: pendingWithdrawals.length,
    analytics: completedRides.length,
  };
  const currentViewTitle =
    menuItems.find((item) => item.key === page)?.label || "Admin";
  const filteredRiders = riders.filter((user) =>
    matchesSearch(user, searchQuery, [
      "full_name",
      "email",
      "phone_number",
      "national_id_number",
    ])
  );
  const filteredPlatformDrivers = platformDrivers.filter((user) =>
    matchesSearch(user, searchQuery, [
      "full_name",
      "email",
      "phone_number",
      "driver_status",
      "driver_category_label",
      "national_id_number",
    ])
  );
  const filteredDriverProfiles = alphabetDrivers.filter((driver) =>
    matchesSearch(driver, searchQuery, [
      "driver_name",
      "driver_email",
      "phone_number",
      "vehicle_make",
      "vehicle_model",
      "vehicle_plate",
      "driver_category_label",
      "status",
    ])
  );
  const filteredPendingDrivers = pendingDrivers.filter((driver) =>
    matchesSearch(driver, searchQuery, [
      "driver_name",
      "driver_email",
      "phone_number",
      "vehicle_make",
      "vehicle_model",
      "vehicle_plate",
    ])
  );
  const filteredRides = rides.filter((ride) =>
    matchesSearch(ride, searchQuery, [
      "id",
      "status",
      "pickup",
      "destination",
      "rider_email",
      "driver_email",
      "rider_name",
      "driver_name",
    ])
  );
  const filteredWithdrawals = withdrawals.filter((item) =>
    matchesSearch(item, searchQuery, [
      "id",
      "driver",
      "driver_name",
      "status",
      "payout_method_display",
    ])
  );

  const refreshAdminData = () => {
    fetchDrivers();
    fetchUsers();
    fetchRides();
    fetchWithdrawals();
    fetchOwnerPayout();
  };

  return (
    <div style={pageStyle}>
      <div style={sidebar}>
        <div style={sidebarBrandStyle}>
          <img src={logoSrc} alt={`${MARKET.brandName} logo`} style={brandLogoStyle} />
          <div>
            <h2 style={sidebarTitle}>Sakho Admin</h2>
            <p style={sidebarSubtitleStyle}>Operations console</p>
          </div>
        </div>

        {menuItems.map((item) => (
          <button
            key={item.key}
            style={{
              ...menuButton,
              background: page === item.key ? "#12b76a" : "transparent",
              color: page === item.key ? "#062e1a" : "#d1d5db",
              borderColor:
                page === item.key ? "rgba(18, 183, 106, 0.7)" : "rgba(255, 255, 255, 0.08)",
            }}
            onClick={() => setPage(item.key)}
          >
            <span>{item.label}</span>
            <span style={menuCountStyle}>{menuCounts[item.key] || 0}</span>
          </button>
        ))}
      </div>

      <div style={content}>
        <header style={topBarStyle}>
          <div>
            <span style={topBarKickerStyle}>Admin app</span>
            <h1 style={topBarTitleStyle}>{currentViewTitle}</h1>
          </div>
          <div style={topBarActionsStyle}>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search users, rides, vehicles"
              style={searchInputStyle}
            />
            <button type="button" onClick={refreshAdminData} style={refreshButtonStyle}>
              Refresh
            </button>
          </div>
        </header>

        <section style={opsHeroStyle}>
          <div>
            <span style={opsKickerStyle}>Three app platform</span>
            <h1 style={opsTitleStyle}>Admin operations center</h1>
            <p style={opsSubtitleStyle}>
              Monitor riders, drivers, dispatch, payments, and approvals from one place.
            </p>
          </div>

          <div style={opsStatsGridStyle}>
            <StatCard title="Drivers" value={drivers.length} />
            <StatCard title="Online" value={onlineDrivers.length} />
            <StatCard title="Blocked" value={blockedUsers.length} />
            <StatCard title="Trips" value={rides.length} />
            <StatCard title="Revenue" value={formatMoney(totalRevenue)} />
          </div>
        </section>

        {page === "verification" && (
          <div style={card}>
            <SectionTitle title="Driver verification" subtitle="Approve or reject new driver applications." />

            <div style={statsGrid}>
              <StatCard title="Pending" value={pendingDrivers.length} />
              <StatCard title="Approved" value={approvedDrivers.length} />
              <StatCard title="Rejected" value={rejectedDrivers.length} />
              <StatCard title="Rider Applications" value={pendingRiders.length} />
            </div>

            <h2 style={subHeadingStyle}>Pending driver applications</h2>

            {filteredPendingDrivers.length === 0 ? (
              <p>No pending driver applications.</p>
            ) : (
              filteredPendingDrivers.map((driver) => (
                <DriverVerificationCard
                  key={driver.id}
                  driver={driver}
                  getFileUrl={getFileUrl}
                  approveDriver={approveDriver}
                  rejectDriver={rejectDriver}
                />
              ))
            )}

            <h2 style={subHeadingStyle}>Pending rider applications</h2>

            {pendingRiders.length === 0 ? (
              <p>No pending rider applications.</p>
            ) : (
              pendingRiders.map((user) => (
                <UserAccessCard
                  key={user.id}
                  user={user}
                  setUserBlocked={setUserBlocked}
                  updateRiderApproval={updateRiderApproval}
                  showApprovalActions
                />
              ))
            )}
          </div>
        )}

        {page === "riders" && (
          <div style={card}>
            <SectionTitle
              title="Riders list"
              subtitle="Manage rider accounts, rider quality scores, and account access."
            />

            <div style={statsGrid}>
              <StatCard title="Total Riders" value={riders.length} />
              <StatCard title="Showing" value={filteredRiders.length} />
              <StatCard title="Pending Approval" value={pendingRiders.length} />
              <StatCard title="Approved Riders" value={approvedRiders.length} />
              <StatCard title="Rejected Riders" value={rejectedRiders.length} />
              <StatCard
                title="Blocked Riders"
                value={riders.filter((user) => !user.is_active).length}
              />
              <StatCard
                title="Rated Riders"
                value={riders.filter((user) => Number(user.rider_rating_count || 0) > 0).length}
              />
            </div>

            {filteredRiders.length === 0 ? (
              <p>No riders found.</p>
            ) : (
              filteredRiders.map((user) => (
                <UserAccessCard
                  key={user.id}
                  user={user}
                  setUserBlocked={setUserBlocked}
                  updateRiderApproval={updateRiderApproval}
                  showApprovalActions
                />
              ))
            )}

          </div>
        )}

        {page === "drivers" && (
          <div style={card}>
            <SectionTitle
              title="Drivers list"
              subtitle="Manage driver accounts, driver quality scores, approval status, and access."
            />

            <div style={statsGrid}>
              <StatCard title="Total Drivers" value={platformDrivers.length} />
              <StatCard title="Showing" value={filteredPlatformDrivers.length} />
              <StatCard title="Online Drivers" value={onlineDrivers.length} />
              <StatCard
                title="Blocked Drivers"
                value={platformDrivers.filter((user) => !user.is_active).length}
              />
              <StatCard
                title="Rated Drivers"
                value={platformDrivers.filter((user) => Number(user.driver_rating_count || 0) > 0).length}
              />
            </div>

            <h2 style={subHeadingStyle}>Driver accounts</h2>
            {filteredPlatformDrivers.length === 0 ? (
              <p>No drivers found.</p>
            ) : (
              filteredPlatformDrivers.map((user) => (
                <UserAccessCard
                  key={user.id}
                  user={user}
                  setUserBlocked={setUserBlocked}
                />
              ))
            )}

            <h2 style={subHeadingStyle}>Vehicle and document profiles</h2>
            {filteredDriverProfiles.length === 0 ? (
              <p>No driver profiles found.</p>
            ) : (
              filteredDriverProfiles.map((driver) => (
                <DriverInfoCard
                  key={driver.id}
                  driver={driver}
                  getFileUrl={getFileUrl}
                  setUserBlocked={setUserBlocked}
                  approveDriver={approveDriver}
                  rejectDriver={rejectDriver}
                  updateDriverCategory={updateDriverCategory}
                  reintegrateDriver={reintegrateDriver}
                  driverCategories={DRIVER_CATEGORIES}
                />
              ))
            )}
          </div>
        )}

        {page === "rides" && (
          <div style={card}>
            <SectionTitle title="Ride dispatch" subtitle="Watch active and historic trip activity." />

            {filteredRides.length === 0 ? (
              <p>No rides found.</p>
            ) : (
              filteredRides.map((ride) => (
                <div key={ride.id} style={listCard}>
                  <p>
                    <b>Ride ID:</b> {ride.id}
                  </p>

                  <p>
                    <b>Status:</b> {ride.status}
                  </p>

                  <p>
                    <b>Pickup:</b> {ride.pickup}
                  </p>

                  <p>
                    <b>Destination:</b> {ride.destination}
                  </p>

                  <p>
                    <b>Distance:</b> {ride.distance_km || 0} KM
                  </p>

                  <p>
                    <b>Fare:</b> {formatMoney(ride.fare)}
                  </p>

                  <p>
                    <b>App Fee:</b> {formatMoney(ride.app_fee)}
                  </p>

                  <p>
                    <b>Tip:</b> {formatMoney(ride.payment_tip_amount)}
                  </p>

                  <p>
                    <b>Driver Earning:</b> {formatMoney(ride.driver_earning)}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {page === "vehicles" && (
          <div style={card}>
            <SectionTitle title="Vehicle management" subtitle="Review car type, plate, registration, and insurance." />

            {filteredDriverProfiles.length === 0 ? (
              <p>No vehicles found.</p>
            ) : (
              filteredDriverProfiles.map((driver) => (
                <div key={driver.id} style={listCard}>
                  <p>
                    <b>Driver:</b> {driver.driver_name || "N/A"}
                  </p>

                  <p>
                    <b>Vehicle:</b> {driver.vehicle_make} {driver.vehicle_model}
                  </p>

                  <p>
                    <b>Type:</b> {driver.car_type}
                  </p>

                  <p>
                    <b>Color:</b> {driver.vehicle_color || "N/A"}
                  </p>

                  <p>
                    <b>Plate:</b> {driver.vehicle_plate}
                  </p>
                  {driver.document_rejection_reason && (
                    <p style={documentStatusStyle("expired")}>
                      {driver.document_rejection_reason}
                    </p>
                  )}

                  {driver.license_file && (
                    <p>
                      <a
                        href={getFileUrl(driver.license_file)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Driver License
                      </a>
                    </p>
                  )}
                  <p>
                    <b>License expiration:</b>{" "}
                    <span style={documentStatusStyle(driver.license_status)}>
                      {formatDocumentStatus(driver.license_status)}
                    </span>
                    {driver.license_expires_at ? ` · ${driver.license_expires_at}` : ""}
                  </p>

                  {driver.vehicle_registration && (
                    <p>
                      <a
                        href={getFileUrl(driver.vehicle_registration)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Vehicle Registration
                      </a>
                    </p>
                  )}
                  <p>
                    <b>Registration expiration:</b>{" "}
                    <span style={documentStatusStyle(driver.vehicle_registration_status)}>
                      {formatDocumentStatus(driver.vehicle_registration_status)}
                    </span>
                    {driver.vehicle_registration_expires_at
                      ? ` · ${driver.vehicle_registration_expires_at}`
                      : ""}
                  </p>

                  {driver.insurance_document && (
                    <p>
                      <a
                        href={getFileUrl(driver.insurance_document)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Insurance Document
                      </a>
                    </p>
                  )}
                  <p>
                    <b>Insurance expiration:</b>{" "}
                    <span style={documentStatusStyle(driver.insurance_status)}>
                      {formatDocumentStatus(driver.insurance_status)}
                    </span>
                    {driver.insurance_expires_at ? ` · ${driver.insurance_expires_at}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {page === "payments" && (
          <div style={card}>
            <SectionTitle title="Payment management" subtitle="Track rider payments, platform commission, and driver earnings." />

            <div style={statsGrid}>
              <StatCard title="Paid Rides" value={paidRides.length} />
              <StatCard title="Unpaid Rides" value={unpaidRides.length} />
              <StatCard
                title="Total Revenue"
                value={formatMoney(totalRevenue)}
              />
              <StatCard
                title={`Owner Commission (${ownerCommissionPercent}%)`}
                value={formatMoney(platformCommission)}
              />
              <StatCard
                title="Driver Payouts"
                value={formatMoney(driverPayouts)}
              />
              <StatCard
                title="Owner Available"
                value={formatMoney(ownerPayoutSummary.owner_commission_balance)}
              />
            </div>

            <section style={ownerPayoutPanelStyle}>
              <div>
                <SectionTitle
                  title="Owner payout method"
                  subtitle={`Save where the platform owner receives the ${ownerPayoutSummary.owner_commission_percent}% commission.`}
                />

                {ownerPayoutSummary.methods.length === 0 ? (
                  <p style={accessMetaStyle}>No owner payout method saved yet.</p>
                ) : (
                  ownerPayoutSummary.methods.map((method) => (
                    <div key={method.id} style={ownerPayoutSavedStyle}>
                      <strong>{method.display_name}</strong>
                      <span>{method.payout_type.replace("_", " ")}</span>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={saveOwnerPayoutMethod} style={ownerPayoutFormStyle}>
                <label style={ownerPayoutFieldStyle}>
                  <span>Payout method</span>
                  <select
                    value={ownerPayoutForm.payout_type}
                    onChange={(event) => updateOwnerPayoutForm("payout_type", event.target.value)}
                    style={ownerPayoutInputStyle}
                  >
                    <option value="bank_account">Bank account</option>
                    <option value="bankily">Bankily</option>
                    <option value="masrvi">Masravi</option>
                    <option value="seddad">Seddad</option>
                  </select>
                </label>

                <label style={ownerPayoutFieldStyle}>
                  <span>Account holder name</span>
                  <input
                    value={ownerPayoutForm.account_holder_name}
                    onChange={(event) =>
                      updateOwnerPayoutForm("account_holder_name", event.target.value)
                    }
                    style={ownerPayoutInputStyle}
                    placeholder="Owner name"
                  />
                </label>

                {ownerPayoutForm.payout_type === "bank_account" ? (
                  <>
                    <label style={ownerPayoutFieldStyle}>
                      <span>Bank name</span>
                      <input
                        value={ownerPayoutForm.bank_name}
                        onChange={(event) => updateOwnerPayoutForm("bank_name", event.target.value)}
                        style={ownerPayoutInputStyle}
                        placeholder="Bank name"
                      />
                    </label>
                    <label style={ownerPayoutFieldStyle}>
                      <span>Account number / RIB</span>
                      <input
                        value={ownerPayoutForm.account_reference}
                        onChange={(event) =>
                          updateOwnerPayoutForm("account_reference", event.target.value)
                        }
                        style={ownerPayoutInputStyle}
                        placeholder="Account number or RIB"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label style={ownerPayoutFieldStyle}>
                      <span>Phone number</span>
                      <input
                        value={ownerPayoutForm.phone_number}
                        onChange={(event) =>
                          updateOwnerPayoutForm("phone_number", event.target.value)
                        }
                        style={ownerPayoutInputStyle}
                        placeholder="Mobile money phone number"
                      />
                    </label>
                    <label style={ownerPayoutFieldStyle}>
                      <span>Wallet ID</span>
                      <input
                        value={ownerPayoutForm.wallet_id}
                        onChange={(event) => updateOwnerPayoutForm("wallet_id", event.target.value)}
                        style={ownerPayoutInputStyle}
                        placeholder="Optional wallet ID"
                      />
                    </label>
                  </>
                )}

                <button
                  type="submit"
                  disabled={ownerPayoutSaving}
                  style={ownerPayoutButtonStyle}
                >
                  {ownerPayoutSaving ? "Saving..." : "Save owner payout"}
                </button>
                {ownerPayoutMessage && (
                  <p style={ownerPayoutMessageStyle}>{ownerPayoutMessage}</p>
                )}
              </form>
            </section>
          </div>
        )}

        {page === "withdrawals" && (
          <div style={card}>
            <SectionTitle title="Withdrawal requests" subtitle="Approve driver payout requests when they are ready." />

            <div style={statsGrid}>
              <StatCard title="Total Requests" value={withdrawals.length} />
              <StatCard title="Pending" value={pendingWithdrawals.length} />
              <StatCard title="Approved" value={approvedWithdrawals.length} />
              <StatCard title="Rejected" value={rejectedWithdrawals.length} />
              <StatCard
                title="Total Requested"
                value={formatMoney(totalWithdrawRequested)}
              />
              <StatCard
                title="Total Approved"
                value={formatMoney(totalApprovedWithdrawals)}
              />
            </div>

            <h2 style={subHeadingStyle}>Requests list</h2>

            {filteredWithdrawals.length === 0 ? (
              <p>No withdrawal requests.</p>
            ) : (
              filteredWithdrawals.map((item) => (
                <div key={item.id} style={listCard}>
                  <p>
                    <b>Request ID:</b> {item.id}
                  </p>

                  <p>
                    <b>Driver:</b> {item.driver}
                  </p>

                  {item.driver_name && (
                    <p>
                      <b>Name:</b> {item.driver_name}
                    </p>
                  )}

                  <p>
                    <b>Payout:</b> {item.payout_method_display || "N/A"}
                  </p>

                  <p>
                    <b>Amount:</b> {formatMoney(item.amount)}
                  </p>

                  <p>
                    <b>Status:</b> {item.status}
                  </p>

                  {item.status === "pending" && (
                    <>
                      <button
                        style={approveButton}
                        onClick={() => approveWithdrawal(item.id)}
                      >
                        Approve ✅
                      </button>

                      <button
                        style={rejectButton}
                        onClick={() => rejectWithdrawal(item.id)}
                      >
                        Reject ❌
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {page === "analytics" && (
          <div style={card}>
            <SectionTitle title="Platform analytics" subtitle="Understand marketplace volume, revenue, and trip outcomes." />

            <div style={statsGrid}>
              <StatCard title="Total Drivers" value={drivers.length} />
              <StatCard title="Total Rides" value={rides.length} />
              <StatCard title="Completed Rides" value={completedRides.length} />
              <StatCard title="Cancelled Rides" value={cancelledRides.length} />
              <StatCard title="Paid Rides" value={paidRides.length} />
              <StatCard title="Unpaid Rides" value={unpaidRides.length} />
              <StatCard
                title="Total Revenue"
                value={formatMoney(totalRevenue)}
              />
              <StatCard
                title={`Owner Commission (${ownerCommissionPercent}%)`}
                value={formatMoney(platformCommission)}
              />
              <StatCard
                title="Driver Payouts"
                value={formatMoney(driverPayouts)}
              />
            </div>
            <div style={analyticsChartsGridStyle}>
              <SimpleBarChart
                title="Admin revenue analytics (monthly)"
                data={monthlyRevenue.length ? monthlyRevenue : [{ label: "No data", value: 0 }]}
              />
              <SimpleOutcomeChart title="Ride outcomes" data={rideOutcome} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SimpleBarChart({ title, data }) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  return (
    <div style={analyticsChartCardStyle}>
      <h3 style={chartTitleStyle}>{title}</h3>
      <div style={chartBarsWrapStyle}>
        {data.map((item) => (
          <div key={item.label} style={chartBarItemStyle}>
            <div style={{ ...chartBarStyle, height: `${Math.max(10, (item.value / maxValue) * 120)}px` }} />
            <small>{item.label}</small>
            <strong>{formatMoney(item.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleOutcomeChart({ title, data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  return (
    <div style={analyticsChartCardStyle}>
      <h3 style={chartTitleStyle}>{title}</h3>
      {data.map((item) => (
        <div key={item.label} style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span>{item.label}</span><strong>{item.value}</strong>
          </div>
          <div style={chartTrackStyle}>
            <div style={{ ...chartFillStyle, width: `${(item.value / total) * 100}%`, background: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DriverVerificationCard({
  driver,
  getFileUrl,
  approveDriver,
  rejectDriver,
}) {
  return (
    <div style={verificationCard}>
      <div style={profilePhotoColumnStyle}>
        {driver.driver_photo ? (
          <img
            src={getFileUrl(driver.driver_photo)}
            alt="Driver"
            style={driverPhoto}
          />
        ) : (
          <div style={placeholderPhoto}>👤</div>
        )}
      </div>

      <div style={reviewContentStyle}>
        <div style={reviewHeaderStyle}>
          <div>
            <span style={sectionKickerStyle}>Driver application</span>
            <h2 style={reviewTitleStyle}>{driver.driver_name || "Driver Name"}</h2>
            <p style={accessMetaStyle}>{driver.driver_email || "No email"}</p>
          </div>
          <StatusBadge label={driver.status || "pending"} />
        </div>

        <div style={detailGridStyle}>
          <DetailItem label="Phone" value={driver.phone_number || "N/A"} />
          <DetailItem
            label="Vehicle"
            value={`${driver.vehicle_make || ""} ${driver.vehicle_model || ""}`.trim() || "N/A"}
          />
          <DetailItem label="Type" value={driver.car_type || "N/A"} />
          <DetailItem label="Color" value={driver.vehicle_color || "N/A"} />
          <DetailItem label="Plate" value={driver.vehicle_plate || "N/A"} />
        </div>

        <div style={documentLinks}>
          {driver.vehicle_registration && (
            <a
              href={getFileUrl(driver.vehicle_registration)}
              target="_blank"
              rel="noreferrer"
              style={documentButton}
            >
              View Vehicle Registration
            </a>
          )}

          {driver.insurance_document && (
            <a
              href={getFileUrl(driver.insurance_document)}
              target="_blank"
              rel="noreferrer"
              style={documentButton}
            >
              View Insurance
            </a>
          )}
        </div>

        <ReviewActions
          approveLabel="Approve Driver"
          rejectLabel="Reject Driver"
          onApprove={() => approveDriver(driver.id)}
          onReject={() => rejectDriver(driver.id)}
          canApprove={driver.status !== "approved"}
          canReject={driver.status !== "rejected"}
        />
      </div>
    </div>
  );
}

function UserAccessCard({
  user,
  setUserBlocked,
  updateRiderApproval,
  showApprovalActions = false,
}) {
  const isRider = user.is_rider && !user.is_driver;
  const canApproveRider = isRider && user.rider_status !== "approved";
  const canRejectRider = isRider && user.rider_status !== "rejected";

  return (
    <div style={accessCardStyle}>
      <div>
        <h3 style={accessTitleStyle}>{user.full_name || "User"}</h3>
        <p style={accessMetaStyle}>{user.email}</p>
        <div style={accessPillRowStyle}>
          <span style={rolePillStyle}>{user.is_driver ? "Driver" : "Rider"}</span>
          {isRider && (
            <span
              style={{
                ...rolePillStyle,
                background:
                  user.rider_status === "approved"
                    ? "#ecfdf3"
                    : user.rider_status === "rejected"
                      ? "#fee2e2"
                      : "#fff7ed",
                color:
                  user.rider_status === "approved"
                    ? "#166534"
                    : user.rider_status === "rejected"
                      ? "#b91c1c"
                      : "#9a3412",
              }}
            >
              Rider {user.rider_status_label || user.rider_status || "Pending"}
            </span>
          )}
          <span style={rolePillStyle}>
            Driver score {Number(user.driver_average_rating || 0).toFixed(1)}
          </span>
          <span style={rolePillStyle}>
            Rider score {Number(user.rider_average_rating || 0).toFixed(1)}
          </span>
          <span
            style={{
              ...rolePillStyle,
              background: user.is_active ? "#ecfdf3" : "#fee2e2",
              color: user.is_active ? "#166534" : "#b91c1c",
            }}
          >
            {user.is_active ? "Active" : "Blocked"}
          </span>
          <span
            style={{
              ...rolePillStyle,
              background:
                user.national_id_number && user.has_national_id_document
                  ? "#ecfdf3"
                  : "#fff7ed",
              color:
                user.national_id_number && user.has_national_id_document
                  ? "#166534"
                  : "#9a3412",
            }}
          >
            {user.national_id_number && user.has_national_id_document
              ? "National ID complete"
              : "National ID missing"}
          </span>
          <span style={rolePillStyle}>
            Since {user.member_since_year || "N/A"}
          </span>
          <span style={rolePillStyle}>
            {formatYearsUsingApp(user.years_using_app)}
          </span>
          {user.is_driver && user.driver_status && (
            <span style={rolePillStyle}>{user.driver_status}</span>
          )}
          {user.is_driver && user.driver_category_label && (
            <span style={rolePillStyle}>{user.driver_category_label}</span>
          )}
        </div>
        <p style={accessMetaStyle}>
          {user.is_driver
            ? `${user.driver_rating_count || 0} driver reviews`
            : `${user.rider_rating_count || 0} rider reviews`}
        </p>
        <p style={accessMetaStyle}>
          National ID: {user.national_id_number || "Not added"}
          {user.national_id_document && (
            <>
              {" · "}
              <a href={user.national_id_document} target="_blank" rel="noreferrer">
                View ID
              </a>
            </>
          )}
        </p>
      </div>

      <div style={actionClusterStyle}>
        {showApprovalActions && isRider && (
          <ReviewActions
            approveLabel="Approve Rider"
            rejectLabel="Reject Rider"
            onApprove={() => updateRiderApproval(user.id, "approve")}
            onReject={() => updateRiderApproval(user.id, "reject")}
            canApprove={canApproveRider}
            canReject={canRejectRider}
          />
        )}

        <button
          style={user.is_active ? blockButtonStyle : unblockButtonStyle}
          onClick={() => setUserBlocked(user.id, user.is_active)}
        >
          {user.is_active ? "Block user" : "Unblock user"}
        </button>
      </div>
    </div>
  );
}

function DriverInfoCard({
  driver,
  getFileUrl,
  setUserBlocked,
  approveDriver,
  rejectDriver,
  updateDriverCategory,
  reintegrateDriver,
  driverCategories,
}) {
  const canApproveDriver = driver.status !== "approved";
  const canRejectDriver = driver.status !== "rejected";

  return (
    <div style={driverProfileCardStyle}>
      <div style={driverProfileMainStyle}>
        <div style={profilePhotoColumnStyle}>
          {driver.driver_photo ? (
            <img
              src={getFileUrl(driver.driver_photo)}
              alt="Driver"
              style={driverPhoto}
            />
          ) : (
            <div style={placeholderPhoto}>DR</div>
          )}
          <StatusBadge label={driver.is_active ? "Active" : "Blocked"} />
        </div>

        <div style={reviewContentStyle}>
          <div style={reviewHeaderStyle}>
            <div>
              <span style={sectionKickerStyle}>Driver profile</span>
              <h3 style={reviewTitleStyle}>{driver.driver_name || "N/A"}</h3>
              <p style={accessMetaStyle}>{driver.driver_email || "N/A"}</p>
            </div>
            <StatusBadge label={driver.status || "pending"} />
          </div>

          <div style={detailGridStyle}>
            <DetailItem label="Phone" value={driver.phone_number || "N/A"} />
            <DetailItem
              label="Member since"
              value={`${driver.member_since_year || "N/A"} · ${formatYearsUsingApp(driver.years_using_app)}`}
            />
            <DetailItem label="Category" value={driver.driver_category_label || "Gold"} />
            <DetailItem
              label="Vehicle"
              value={`${driver.vehicle_make || ""} ${driver.vehicle_model || ""}`.trim() || "N/A"}
            />
            <DetailItem label="Plate" value={driver.vehicle_plate || "N/A"} />
          </div>

          <label style={driverCategoryControlStyle}>
            <span>Driver category</span>
            <select
              value={driver.driver_category || "gold"}
              onChange={(event) => updateDriverCategory(driver.id, event.target.value)}
              style={driverCategorySelectStyle}
            >
              {driverCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={reviewPanelStyle}>
        <div>
          <span style={sectionKickerStyle}>Application review</span>
          <p style={reviewHintStyle}>
            Approve qualified drivers, reject incomplete applications, or reintegrate a driver after review.
          </p>
        </div>

        <ReviewActions
          approveLabel="Approve Driver"
          rejectLabel="Reject Driver"
          onApprove={() => approveDriver(driver.id)}
          onReject={() => rejectDriver(driver.id)}
          canApprove={canApproveDriver}
          canReject={canRejectDriver}
        />

        <div style={actionClusterStyle}>
          <button
            style={driver.is_active ? dangerOutlineButtonStyle : successOutlineButtonStyle}
            onClick={() => setUserBlocked(driver.user_id, driver.is_active)}
          >
            {driver.is_active ? "Block Driver" : "Unblock Driver"}
          </button>

          <button
            style={{
              ...neutralButtonStyle,
              opacity: driver.is_active && driver.status === "approved" ? 0.55 : 1,
              cursor: driver.is_active && driver.status === "approved" ? "not-allowed" : "pointer",
            }}
            disabled={driver.is_active && driver.status === "approved"}
            onClick={() => reintegrateDriver(driver.id)}
          >
            Reintegrate Driver
          </button>
        </div>

        {driver.is_active && driver.status === "approved" && (
          <p style={reviewDoneStyle}>Driver is active and approved.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={statCard}>
      <h2>{value}</h2>
      <p>{title}</p>
    </div>
  );
}

function StatusBadge({ label }) {
  return (
    <span style={{ ...statusBadgeStyle, ...getStatusBadgeStyle(label) }}>
      {String(label || "pending").replace("_", " ")}
    </span>
  );
}

function DetailItem({ label, value }) {
  return (
    <div style={detailItemStyle}>
      <span style={detailItemLabelStyle}>{label}</span>
      <strong style={detailItemValueStyle}>{value}</strong>
    </div>
  );
}

function ReviewActions({
  approveLabel,
  rejectLabel,
  onApprove,
  onReject,
  canApprove = true,
  canReject = true,
}) {
  return (
    <div style={reviewActionsStyle}>
      <button
        type="button"
        style={{
          ...reviewApproveButtonStyle,
          opacity: canApprove ? 1 : 0.55,
          cursor: canApprove ? "pointer" : "not-allowed",
        }}
        disabled={!canApprove}
        onClick={onApprove}
      >
        {approveLabel}
      </button>
      <button
        type="button"
        style={{
          ...reviewRejectButtonStyle,
          opacity: canReject ? 1 : 0.55,
          cursor: canReject ? "pointer" : "not-allowed",
        }}
        disabled={!canReject}
        onClick={onReject}
      >
        {rejectLabel}
      </button>
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={sectionTitleWrapStyle}>
      <span style={sectionKickerStyle}>Admin app</span>
      <h1 style={sectionTitleStyle}>{title}</h1>
      <p style={sectionSubtitleStyle}>{subtitle}</p>
    </div>
  );
}

const pageStyle = {
  display: "grid",
  gridTemplateColumns: "300px minmax(0, 1fr)",
  minHeight: "100vh",
  background: "#0b0f14",
  color: "#f8fafc",
};

const sidebar = {
  position: "sticky",
  top: 0,
  height: "100vh",
  background: "#000000",
  color: "white",
  padding: "24px",
  borderRight: "1px solid #1f2937",
  boxSizing: "border-box",
  overflowY: "auto",
};

const sidebarBrandStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "26px",
};

const brandLogoStyle = {
  width: "48px",
  height: "48px",
  borderRadius: "14px",
  objectFit: "cover",
  border: "1px solid rgba(255, 255, 255, 0.16)",
  boxShadow: "0 14px 28px rgba(0, 0, 0, 0.28)",
};

const sidebarTitle = {
  margin: 0,
  fontSize: "1.1rem",
};

const sidebarSubtitleStyle = {
  margin: "3px 0 0",
  color: "#9ca3af",
  fontSize: "0.78rem",
  fontWeight: 800,
};

const menuButton = {
  width: "100%",
  padding: "13px 14px",
  marginBottom: "9px",
  border: "1px solid",
  borderRadius: "8px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  textAlign: "left",
  fontWeight: 900,
  transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
};

const menuCountStyle = {
  minWidth: "30px",
  height: "24px",
  borderRadius: "999px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255, 255, 255, 0.14)",
  fontSize: "0.76rem",
  fontWeight: 950,
};

const content = {
  padding: "22px",
  minWidth: 0,
};

const topBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: "10px",
  padding: "16px 18px",
  marginBottom: "16px",
  boxShadow: "0 18px 36px rgba(0, 0, 0, 0.22)",
};

const topBarKickerStyle = {
  color: "#64748b",
  fontSize: "0.72rem",
  fontWeight: 950,
  textTransform: "uppercase",
};

const topBarTitleStyle = {
  margin: "3px 0 0",
  color: "white",
  fontSize: "1.45rem",
  letterSpacing: 0,
};

const topBarActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const searchInputStyle = {
  width: "min(360px, 48vw)",
  minHeight: "44px",
  border: "1px solid #374151",
  borderRadius: "8px",
  padding: "0 14px",
  color: "white",
  fontWeight: 800,
  background: "#0b0f14",
  outline: "none",
};

const refreshButtonStyle = {
  minHeight: "44px",
  border: "none",
  borderRadius: "8px",
  background: "white",
  color: "#111827",
  padding: "0 16px",
  cursor: "pointer",
  fontWeight: 950,
};

const opsHeroStyle = {
  background: "#111827",
  color: "white",
  borderRadius: "10px",
  padding: "24px",
  display: "grid",
  gridTemplateColumns: "minmax(260px, 0.8fr) minmax(300px, 1.2fr)",
  gap: "18px",
  alignItems: "center",
  marginBottom: "18px",
  border: "1px solid #1f2937",
  boxShadow: "0 18px 36px rgba(0, 0, 0, 0.22)",
};

const opsKickerStyle = {
  color: "#a7f3d0",
  fontSize: "0.78rem",
  fontWeight: 900,
  textTransform: "uppercase",
};

const opsTitleStyle = {
  margin: "7px 0 8px",
  fontSize: "2rem",
  letterSpacing: 0,
};

const opsSubtitleStyle = {
  margin: 0,
  color: "#d1d5db",
  lineHeight: 1.5,
  maxWidth: "560px",
};

const opsStatsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "10px",
};

const card = {
  background: "#111827",
  padding: "24px",
  borderRadius: "10px",
  border: "1px solid #1f2937",
  boxShadow: "0 18px 36px rgba(0, 0, 0, 0.2)",
};

const listCard = {
  background: "#0b0f14",
  padding: "16px",
  borderRadius: "8px",
  marginBottom: "14px",
  border: "1px solid #1f2937",
  boxShadow: "none",
};

const verificationCard = {
  display: "flex",
  gap: "18px",
  background: "#0b0f14",
  padding: "18px",
  borderRadius: "8px",
  marginBottom: "16px",
  border: "1px solid #1f2937",
  boxShadow: "none",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "20px",
  marginTop: "25px",
};

const statCard = {
  background: "#0b0f14",
  padding: "16px",
  borderRadius: "8px",
  border: "1px solid #1f2937",
  minHeight: "86px",
  boxShadow: "none",
};

const sectionTitleWrapStyle = {
  marginBottom: "18px",
};

const sectionKickerStyle = {
  display: "block",
  color: "#64748b",
  fontSize: "0.76rem",
  fontWeight: 900,
  textTransform: "uppercase",
  marginBottom: "4px",
};

const sectionTitleStyle = {
  margin: 0,
  color: "white",
  fontSize: "1.65rem",
};

const sectionSubtitleStyle = {
  margin: "6px 0 0",
  color: "#9ca3af",
  lineHeight: 1.45,
};

const subHeadingStyle = {
  marginTop: "26px",
  color: "white",
};

const approveButton = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "12px",
  background: "#12b76a",
  color: "white",
  marginRight: "10px",
  cursor: "pointer",
  fontWeight: 950,
};

const rejectButton = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "12px",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: 950,
};

const accessCardStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  background: "#0b0f14",
  padding: "16px",
  borderRadius: "8px",
  marginBottom: "12px",
  border: "1px solid #1f2937",
  flexWrap: "wrap",
  boxShadow: "none",
};

const accessTitleStyle = {
  margin: 0,
  color: "white",
};

const accessMetaStyle = {
  margin: "4px 0 10px",
  color: "#64748b",
  fontWeight: 700,
};

const accessPillRowStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const actionClusterStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "10px",
  flexWrap: "wrap",
};

const driverProfileCardStyle = {
  background: "#0b0f14",
  border: "1px solid #1f2937",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "14px",
  display: "grid",
  gap: "16px",
  boxShadow: "none",
};

const driverProfileMainStyle = {
  display: "grid",
  gridTemplateColumns: "132px minmax(0, 1fr)",
  gap: "18px",
  alignItems: "start",
};

const profilePhotoColumnStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "10px",
};

const reviewContentStyle = {
  minWidth: 0,
};

const reviewHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
};

const reviewTitleStyle = {
  margin: "2px 0 0",
  color: "white",
  fontSize: "1.25rem",
  letterSpacing: 0,
};

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "10px",
};

const detailItemStyle = {
  display: "grid",
  gap: "4px",
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: "8px",
  padding: "10px 12px",
  minWidth: 0,
};

const detailItemLabelStyle = {
  color: "#64748b",
  fontSize: "0.72rem",
  fontWeight: 950,
  textTransform: "uppercase",
};

const detailItemValueStyle = {
  color: "white",
  fontSize: "0.92rem",
  overflowWrap: "anywhere",
};

const reviewPanelStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  flexWrap: "wrap",
  borderTop: "1px solid #1f2937",
  paddingTop: "14px",
};

const reviewHintStyle = {
  margin: "4px 0 0",
  color: "#64748b",
  fontWeight: 700,
  maxWidth: "560px",
};

const reviewActionsStyle = {
  display: "inline-flex",
  gap: "8px",
  padding: "5px",
  borderRadius: "8px",
  background: "#111827",
  border: "1px solid #1f2937",
  flexWrap: "wrap",
};

const reviewApproveButtonStyle = {
  minHeight: "42px",
  border: "none",
  borderRadius: "6px",
  background: "#16a34a",
  color: "white",
  padding: "0 14px",
  fontWeight: 950,
};

const reviewRejectButtonStyle = {
  ...reviewApproveButtonStyle,
  background: "#ef4444",
};

const statusBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "30px",
  borderRadius: "999px",
  border: "1px solid",
  padding: "0 10px",
  fontSize: "0.76rem",
  fontWeight: 950,
  textTransform: "capitalize",
  whiteSpace: "nowrap",
};

const neutralButtonStyle = {
  minHeight: "42px",
  border: "1px solid #374151",
  borderRadius: "6px",
  background: "#111827",
  color: "white",
  padding: "0 14px",
  cursor: "pointer",
  fontWeight: 950,
};

const dangerOutlineButtonStyle = {
  ...neutralButtonStyle,
  borderColor: "#fecaca",
  color: "#b91c1c",
  background: "#fff7f7",
};

const successOutlineButtonStyle = {
  ...neutralButtonStyle,
  borderColor: "#bbf7d0",
  color: "#166534",
  background: "#f0fdf4",
};

const reviewDoneStyle = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: "12px",
  background: "#ecfdf3",
  color: "#166534",
  fontWeight: 900,
};

const rolePillStyle = {
  background: "#eef2ff",
  color: "#3730a3",
  borderRadius: "999px",
  padding: "7px 10px",
  fontSize: "0.78rem",
  fontWeight: 900,
  textTransform: "capitalize",
};

const driverCategoryControlStyle = {
  display: "grid",
  gap: "8px",
  margin: "14px 0",
  maxWidth: "280px",
  color: "#d1d5db",
  fontWeight: 900,
};

const driverCategorySelectStyle = {
  width: "100%",
  minHeight: "44px",
  border: "1px solid #374151",
  borderRadius: "6px",
  background: "#0b0f14",
  color: "white",
  padding: "0 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const ownerPayoutPanelStyle = {
  marginTop: "26px",
  background: "#0b0f14",
  border: "1px solid #1f2937",
  borderRadius: "8px",
  padding: "20px",
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) minmax(280px, 430px)",
  gap: "20px",
  alignItems: "start",
};

const ownerPayoutSavedStyle = {
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "10px",
  display: "grid",
  gap: "5px",
  color: "white",
  textTransform: "capitalize",
};

const ownerPayoutFormStyle = {
  display: "grid",
  gap: "12px",
};

const ownerPayoutFieldStyle = {
  display: "grid",
  gap: "7px",
  color: "#d1d5db",
  fontWeight: 900,
};

const ownerPayoutInputStyle = {
  width: "100%",
  minHeight: "44px",
  border: "1px solid #374151",
  borderRadius: "6px",
  background: "#0b0f14",
  color: "white",
  padding: "0 12px",
  fontWeight: 800,
  boxSizing: "border-box",
};

const ownerPayoutButtonStyle = {
  minHeight: "46px",
  border: "none",
  borderRadius: "6px",
  background: "white",
  color: "#111827",
  cursor: "pointer",
  fontWeight: 900,
};

const ownerPayoutMessageStyle = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: "8px",
  background: "#ecfdf3",
  color: "#166534",
  fontWeight: 900,
};

const blockButtonStyle = {
  padding: "11px 16px",
  border: "none",
  borderRadius: "6px",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const unblockButtonStyle = {
  padding: "11px 16px",
  border: "none",
  borderRadius: "6px",
  background: "#16a34a",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const driverPhoto = {
  width: "96px",
  height: "96px",
  borderRadius: "8px",
  objectFit: "cover",
  marginBottom: "10px",
};

const placeholderPhoto = {
  width: "96px",
  height: "96px",
  borderRadius: "8px",
  background: "#1f2937",
  color: "#9ca3af",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  fontSize: "1rem",
  fontWeight: 950,
  marginBottom: "10px",
};

const documentLinks = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "15px",
};

const documentButton = {
  display: "inline-block",
  padding: "10px 14px",
  background: "white",
  color: "#111827",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "bold",
};

export default AdminDashboard;

const analyticsChartsGridStyle = {
  marginTop: "20px",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "14px",
};

const analyticsChartCardStyle = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "14px",
};

const chartTitleStyle = {
  marginTop: 0,
  marginBottom: "12px",
};

const chartBarsWrapStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(58px, 1fr))",
  gap: "8px",
  alignItems: "end",
  minHeight: "150px",
};

const chartBarItemStyle = {
  textAlign: "center",
};

const chartBarStyle = {
  background: "linear-gradient(180deg, #38bdf8 0%, #2563eb 100%)",
  borderRadius: "8px 8px 4px 4px",
};

const chartTrackStyle = {
  height: "10px",
  borderRadius: "999px",
  background: "#e5e7eb",
  overflow: "hidden",
};

const chartFillStyle = {
  height: "100%",
  borderRadius: "999px",
};
