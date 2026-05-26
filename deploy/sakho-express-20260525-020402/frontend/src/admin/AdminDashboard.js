import React, { useCallback, useEffect, useState } from "react";
import { API_URL } from "../apiConfig";
import { formatMoney } from "../marketConfig";

function AdminDashboard() {
  const DRIVER_CATEGORIES = [
    { value: "gold", label: "Gold" },
    { value: "platinum", label: "Platinum" },
    { value: "diamond", label: "Diamond" },
    { value: "elite", label: "Elite" },
  ];

  const [page, setPage] = useState("verification");
  const [drivers, setDrivers] = useState([]);
  const [users, setUsers] = useState([]);
  const [rides, setRides] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

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

  useEffect(() => {
    fetchDrivers();
    fetchUsers();
    fetchRides();
    fetchWithdrawals();
  }, [fetchDrivers, fetchRides, fetchUsers, fetchWithdrawals]);

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

  const updateDriverCategory = async (driverId, driverCategory) => {
    try {
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
        alert(data.error || "Could not update driver category");
        return;
      }

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

  const pendingDrivers = drivers.filter((driver) => driver.status === "pending");
  const approvedDrivers = drivers.filter(
    (driver) => driver.status === "approved"
  );
  const rejectedDrivers = drivers.filter(
    (driver) => driver.status === "rejected"
  );
  const onlineDrivers = drivers.filter((driver) => driver.is_available);
  const riders = users.filter((user) => user.is_rider && !user.is_staff);
  const platformDrivers = users.filter((user) => user.is_driver && !user.is_staff);
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

  const totalWithdrawRequested = withdrawals.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  const totalApprovedWithdrawals = approvedWithdrawals.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  return (
    <div style={pageStyle}>
      <div style={sidebar}>
        <div style={sidebarBrandStyle}>
          <span style={brandMarkStyle}>SE</span>
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
            {item.label}
          </button>
        ))}
      </div>

      <div style={content}>
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
            </div>

            <h2 style={subHeadingStyle}>Pending driver applications</h2>

            {pendingDrivers.length === 0 ? (
              <p>No pending driver applications.</p>
            ) : (
              pendingDrivers.map((driver) => (
                <DriverVerificationCard
                  key={driver.id}
                  driver={driver}
                  getFileUrl={getFileUrl}
                  approveDriver={approveDriver}
                  rejectDriver={rejectDriver}
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
              <StatCard
                title="Blocked Riders"
                value={riders.filter((user) => !user.is_active).length}
              />
              <StatCard
                title="Rated Riders"
                value={riders.filter((user) => Number(user.rider_rating_count || 0) > 0).length}
              />
            </div>

            {riders.length === 0 ? (
              <p>No riders found.</p>
            ) : (
              riders.map((user) => (
                <UserAccessCard
                  key={user.id}
                  user={user}
                  setUserBlocked={setUserBlocked}
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
            {platformDrivers.length === 0 ? (
              <p>No drivers found.</p>
            ) : (
              platformDrivers.map((user) => (
                <UserAccessCard
                  key={user.id}
                  user={user}
                  setUserBlocked={setUserBlocked}
                />
              ))
            )}

            <h2 style={subHeadingStyle}>Vehicle and document profiles</h2>
            {drivers.length === 0 ? (
              <p>No driver profiles found.</p>
            ) : (
              drivers.map((driver) => (
                <DriverInfoCard
                  key={driver.id}
                  driver={driver}
                  getFileUrl={getFileUrl}
                  setUserBlocked={setUserBlocked}
                  updateDriverCategory={updateDriverCategory}
                  driverCategories={DRIVER_CATEGORIES}
                />
              ))
            )}
          </div>
        )}

        {page === "rides" && (
          <div style={card}>
            <SectionTitle title="Ride dispatch" subtitle="Watch active and historic trip activity." />

            {rides.length === 0 ? (
              <p>No rides found.</p>
            ) : (
              rides.map((ride) => (
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

            {drivers.length === 0 ? (
              <p>No vehicles found.</p>
            ) : (
              drivers.map((driver) => (
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
                title="Platform Commission"
                value={formatMoney(platformCommission)}
              />
              <StatCard
                title="Driver Payouts"
                value={formatMoney(driverPayouts)}
              />
            </div>
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

            {withdrawals.length === 0 ? (
              <p>No withdrawal requests.</p>
            ) : (
              withdrawals.map((item) => (
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
                title="Platform Commission"
                value={formatMoney(platformCommission)}
              />
              <StatCard
                title="Driver Payouts"
                value={formatMoney(driverPayouts)}
              />
            </div>
          </div>
        )}
      </div>
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
      <div>
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

      <div style={{ flex: 1 }}>
        <h2>{driver.driver_name || "Driver Name"}</h2>

        <p>
          <b>Email:</b> {driver.driver_email || "N/A"}
        </p>

        <p>
          <b>Status:</b> {driver.status}
        </p>

        <p>
          <b>Phone:</b> {driver.phone_number || "N/A"}
        </p>

        <p>
          <b>Vehicle:</b> {driver.vehicle_make} {driver.vehicle_model}
        </p>

        <p>
          <b>Type:</b> {driver.car_type}
        </p>

        <p>
          <b>Color:</b> {driver.vehicle_color}
        </p>

        <p>
          <b>Plate:</b> {driver.vehicle_plate}
        </p>

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

        <div style={{ marginTop: "15px" }}>
          <button
            style={approveButton}
            onClick={() => approveDriver(driver.id)}
          >
            Approve Driver
          </button>

          <button style={rejectButton} onClick={() => rejectDriver(driver.id)}>
            Reject Driver
          </button>
        </div>
      </div>
    </div>
  );
}

function UserAccessCard({ user, setUserBlocked }) {
  return (
    <div style={accessCardStyle}>
      <div>
        <h3 style={accessTitleStyle}>{user.full_name || "User"}</h3>
        <p style={accessMetaStyle}>{user.email}</p>
        <div style={accessPillRowStyle}>
          <span style={rolePillStyle}>{user.is_driver ? "Driver" : "Rider"}</span>
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

      <button
        style={user.is_active ? blockButtonStyle : unblockButtonStyle}
        onClick={() => setUserBlocked(user.id, user.is_active)}
      >
        {user.is_active ? "Block user" : "Unblock user"}
      </button>
    </div>
  );
}

function DriverInfoCard({
  driver,
  getFileUrl,
  setUserBlocked,
  updateDriverCategory,
  driverCategories,
}) {
  return (
    <div style={listCard}>
      {driver.driver_photo ? (
        <img
          src={getFileUrl(driver.driver_photo)}
          alt="Driver"
          style={driverPhoto}
        />
      ) : (
        <div style={placeholderPhoto}>👤</div>
      )}

      <p>
        <b>Name:</b> {driver.driver_name || "N/A"}
      </p>

      <p>
        <b>Email:</b> {driver.driver_email || "N/A"}
      </p>

      <p>
        <b>Status:</b> {driver.status}
      </p>

      <p>
        <b>Category:</b> {driver.driver_category_label || "Gold"}
      </p>

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

      <p>
        <b>Access:</b> {driver.is_active ? "Active" : "Blocked"}
      </p>

      <p>
        <b>Phone:</b> {driver.phone_number || "N/A"}
      </p>

      <p>
        <b>Vehicle:</b> {driver.vehicle_make} {driver.vehicle_model}
      </p>

      <p>
        <b>Plate:</b> {driver.vehicle_plate}
      </p>

      <button
        style={driver.is_active ? blockButtonStyle : unblockButtonStyle}
        onClick={() => setUserBlocked(driver.user_id, driver.is_active)}
      >
        {driver.is_active ? "Block Driver" : "Unblock Driver"}
      </button>
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
  gridTemplateColumns: "280px minmax(0, 1fr)",
  minHeight: "100vh",
  background: "#eef2f6",
};

const sidebar = {
  background: "#020617",
  color: "white",
  padding: "24px",
  borderRight: "1px solid rgba(255, 255, 255, 0.08)",
};

const sidebarBrandStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "26px",
};

const brandMarkStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#12b76a",
  color: "#052e1a",
  fontWeight: 900,
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
  borderRadius: "10px",
  cursor: "pointer",
  textAlign: "left",
  fontWeight: 900,
};

const content = {
  padding: "24px",
  minWidth: 0,
};

const opsHeroStyle = {
  background: "linear-gradient(135deg, #111827 0%, #1f2937 55%, #064e3b 100%)",
  color: "white",
  borderRadius: "18px",
  padding: "24px",
  display: "grid",
  gridTemplateColumns: "minmax(260px, 0.8fr) minmax(300px, 1.2fr)",
  gap: "18px",
  alignItems: "center",
  marginBottom: "18px",
  boxShadow: "0 18px 42px rgba(15, 23, 42, 0.14)",
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
  background: "white",
  padding: "24px",
  borderRadius: "18px",
  border: "1px solid #e5e7eb",
  boxShadow: "0 18px 42px rgba(15,23,42,0.08)",
};

const listCard = {
  background: "#f8fafc",
  padding: "20px",
  borderRadius: "12px",
  marginBottom: "14px",
  border: "1px solid #e5e7eb",
};

const verificationCard = {
  display: "flex",
  gap: "25px",
  background: "#f8fafc",
  padding: "25px",
  borderRadius: "14px",
  marginBottom: "16px",
  border: "1px solid #e5e7eb",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "20px",
  marginTop: "25px",
};

const statCard = {
  background: "#f8fafc",
  padding: "18px",
  borderRadius: "12px",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  minHeight: "94px",
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
  color: "#111827",
  fontSize: "1.65rem",
};

const sectionSubtitleStyle = {
  margin: "6px 0 0",
  color: "#64748b",
  lineHeight: 1.45,
};

const subHeadingStyle = {
  marginTop: "26px",
  color: "#111827",
};

const approveButton = {
  padding: "10px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#16a34a",
  color: "white",
  marginRight: "10px",
  cursor: "pointer",
  fontWeight: "bold",
};

const rejectButton = {
  padding: "10px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};

const accessCardStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  background: "#f8fafc",
  padding: "18px",
  borderRadius: "12px",
  marginBottom: "12px",
  border: "1px solid #e5e7eb",
  flexWrap: "wrap",
};

const accessTitleStyle = {
  margin: 0,
  color: "#111827",
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
  color: "#334155",
  fontWeight: 900,
};

const driverCategorySelectStyle = {
  width: "100%",
  minHeight: "44px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "white",
  color: "#111827",
  padding: "0 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const blockButtonStyle = {
  padding: "11px 16px",
  border: "none",
  borderRadius: "8px",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const unblockButtonStyle = {
  padding: "11px 16px",
  border: "none",
  borderRadius: "8px",
  background: "#16a34a",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const driverPhoto = {
  width: "110px",
  height: "110px",
  borderRadius: "50%",
  objectFit: "cover",
  marginBottom: "10px",
};

const placeholderPhoto = {
  width: "110px",
  height: "110px",
  borderRadius: "50%",
  background: "#ddd",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  fontSize: "45px",
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
  background: "#111827",
  color: "white",
  borderRadius: "8px",
  textDecoration: "none",
  fontWeight: "bold",
};

export default AdminDashboard;
