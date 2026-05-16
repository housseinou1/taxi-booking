import React, { useEffect, useState } from "react";

function AdminDashboard() {
  const [page, setPage] = useState("drivers");
  const [drivers, setDrivers] = useState([]);
  const [rides, setRides] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    fetchDrivers();
    fetchRides();
    fetchWithdrawals();
  }, []);

  const fetchDrivers = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/drivers/");
      const data = await response.json();

      setDrivers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      setDrivers([]);
    }
  };

  const fetchRides = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/rides/history/");
      const data = await response.json();

      setRides(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching rides:", error);
      setRides([]);
    }
  };

  const fetchWithdrawals = async () => {
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/payments/withdrawals/"
      );

      const data = await response.json();

      setWithdrawals(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Withdrawal fetch error:", error);
      setWithdrawals([]);
    }
  };

  const approveDriver = async (id) => {
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/drivers/${id}/approve/`,
        {
          method: "POST",
        }
      );

      if (response.ok) {
        alert("Driver approved ✅");
        fetchDrivers();
      } else {
        const data = await response.json();
        alert(data.error || "Could not approve driver");
      }
    } catch (error) {
      console.error(error);
      alert("Server error approving driver");
    }
  };

  const rejectDriver = async (id) => {
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/drivers/${id}/reject/`,
        {
          method: "POST",
        }
      );

      if (response.ok) {
        alert("Driver rejected ❌");
        fetchDrivers();
      } else {
        const data = await response.json();
        alert(data.error || "Could not reject driver");
      }
    } catch (error) {
      console.error(error);
      alert("Server error rejecting driver");
    }
  };

  const approveWithdrawal = async (id) => {
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/payments/withdrawals/${id}/approve/`,
        {
          method: "POST",
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
        `http://127.0.0.1:8000/payments/withdrawals/${id}/reject/`,
        {
          method: "POST",
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

  const menuItems = [
    { key: "drivers", label: "Driver Management" },
    { key: "verification", label: "Driver Verification" },
    { key: "rides", label: "Ride Dispatch" },
    { key: "vehicles", label: "Vehicle Management" },
    { key: "payments", label: "Payment Management" },
    { key: "withdrawals", label: "Withdrawal Requests" },
    { key: "analytics", label: "Ride Analytics" },
  ];

  const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;

    return `http://127.0.0.1:8000${path}`;
  };

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

  const totalRevenue = paidRides.reduce(
    (total, ride) => total + Number(ride.fare || 0),
    0
  );

  const platformCommission = totalRevenue * 0.2;
  const driverPayouts = totalRevenue * 0.8;

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
        <h2>⚙️ Admin Panel</h2>

        {menuItems.map((item) => (
          <button
            key={item.key}
            style={menuButton}
            onClick={() => setPage(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={content}>
        {page === "drivers" && (
          <div style={card}>
            <h1>👨‍✈️ Driver Management</h1>

            {drivers.length === 0 ? (
              <p>No drivers found.</p>
            ) : (
              drivers.map((driver) => (
                <div key={driver.id} style={listCard}>
                  {driver.profile_picture ? (
                    <img
                      src={getImageUrl(driver.profile_picture)}
                      alt="Driver"
                      style={driverPhoto}
                    />
                  ) : (
                    <div style={placeholderPhoto}>👤</div>
                  )}

                  <p>
                    <b>Name:</b> {driver.first_name} {driver.last_name}
                  </p>

                  <p>
                    <b>Email:</b> {driver.email}
                  </p>

                  <p>
                    <b>Status:</b> {driver.status}
                  </p>

                  <p>
                    <b>Vehicle:</b> {driver.vehicle_make} {driver.vehicle_model}
                  </p>

                  <p>
                    <b>Color:</b> {driver.vehicle_color || "N/A"}
                  </p>

                  <p>
                    <b>Plate:</b> {driver.vehicle_plate}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {page === "verification" && (
          <div style={card}>
            <h1>✅ Driver Verification</h1>

            {drivers.length === 0 ? (
              <p>No drivers found.</p>
            ) : (
              drivers.map((driver) => (
                <div key={driver.id} style={listCard}>
                  <p>
                    <b>Driver:</b> {driver.first_name} {driver.last_name}
                  </p>

                  <p>
                    <b>Email:</b> {driver.email}
                  </p>

                  <p>
                    <b>Status:</b> {driver.status}
                  </p>

                  <button
                    style={approveButton}
                    onClick={() => approveDriver(driver.id)}
                  >
                    Approve
                  </button>

                  <button
                    style={rejectButton}
                    onClick={() => rejectDriver(driver.id)}
                  >
                    Reject
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {page === "rides" && (
          <div style={card}>
            <h1>🚖 Ride Dispatch</h1>

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
                    <b>Payment:</b>{" "}
                    {ride.payment_status === "paid" ? "Paid ✅" : "Unpaid ❌"}
                  </p>

                  <p>
                    <b>Pickup:</b>{" "}
                    {ride.pickup_address ||
                      `${ride.pickup_lat}, ${ride.pickup_lng}`}
                  </p>

                  <p>
                    <b>Destination:</b>{" "}
                    {ride.destination_address ||
                      `${ride.destination_lat}, ${ride.destination_lng}`}
                  </p>

                  <p>
                    <b>Fare:</b> ${ride.fare || "0.00"}
                  </p>

                  <p>
                    <b>Driver:</b>{" "}
                    {ride.driver_first_name
                      ? `${ride.driver_first_name} ${ride.driver_last_name}`
                      : "Not assigned"}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {page === "vehicles" && (
          <div style={card}>
            <h1>🚘 Vehicle Management</h1>

            {drivers.length === 0 ? (
              <p>No vehicles found.</p>
            ) : (
              drivers.map((driver) => (
                <div key={driver.id} style={listCard}>
                  <p>
                    <b>Driver:</b> {driver.first_name} {driver.last_name}
                  </p>

                  <p>
                    <b>Vehicle:</b> {driver.vehicle_make} {driver.vehicle_model}
                  </p>

                  <p>
                    <b>Color:</b> {driver.vehicle_color || "N/A"}
                  </p>

                  <p>
                    <b>Plate:</b> {driver.vehicle_plate}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {page === "payments" && (
          <div style={card}>
            <h1>💳 Payment Management</h1>

            <div style={statsGrid}>
              <div style={statCard}>
                <h2>{paidRides.length}</h2>
                <p>Paid Rides ✅</p>
              </div>

              <div style={statCard}>
                <h2>{unpaidRides.length}</h2>
                <p>Unpaid Rides ❌</p>
              </div>

              <div style={statCard}>
                <h2>${totalRevenue.toFixed(2)}</h2>
                <p>Total Revenue 💵</p>
              </div>

              <div style={statCard}>
                <h2>${platformCommission.toFixed(2)}</h2>
                <p>Platform Commission 🏦</p>
              </div>

              <div style={statCard}>
                <h2>${driverPayouts.toFixed(2)}</h2>
                <p>Driver Payouts 🚕</p>
              </div>
            </div>

            <h2 style={{ marginTop: "30px" }}>Payment Records</h2>

            {rides.length === 0 ? (
              <p>No payment records yet.</p>
            ) : (
              rides.map((ride) => (
                <div key={ride.id} style={listCard}>
                  <p>
                    <b>Ride ID:</b> {ride.id}
                  </p>

                  <p>
                    <b>Fare:</b> ${ride.fare || "0.00"}
                  </p>

                  <p>
                    <b>Payment Status:</b>{" "}
                    {ride.payment_status === "paid" ? "Paid ✅" : "Unpaid ❌"}
                  </p>

                  <p>
                    <b>Payment Date:</b>{" "}
                    {ride.payment_date
                      ? new Date(ride.payment_date).toLocaleString()
                      : "N/A"}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {page === "withdrawals" && (
          <div style={card}>
            <h1>💵 Withdrawal Requests</h1>

            <div style={statsGrid}>
              <div style={statCard}>
                <h2>{withdrawals.length}</h2>
                <p>Total Requests</p>
              </div>

              <div style={statCard}>
                <h2>{pendingWithdrawals.length}</h2>
                <p>Pending Requests ⏳</p>
              </div>

              <div style={statCard}>
                <h2>{approvedWithdrawals.length}</h2>
                <p>Approved Requests ✅</p>
              </div>

              <div style={statCard}>
                <h2>{rejectedWithdrawals.length}</h2>
                <p>Rejected Requests ❌</p>
              </div>

              <div style={statCard}>
                <h2>${totalWithdrawRequested.toFixed(2)}</h2>
                <p>Total Requested 💵</p>
              </div>

              <div style={statCard}>
                <h2>${totalApprovedWithdrawals.toFixed(2)}</h2>
                <p>Total Approved 💰</p>
              </div>
            </div>

            <h2 style={{ marginTop: "30px" }}>Requests List</h2>

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

                  <p>
                    <b>Amount:</b> ${item.amount}
                  </p>

                  <p>
                    <b>Status:</b> {item.status}
                  </p>

                  <p>
                    <b>Created:</b>{" "}
                    {item.created_at
                      ? new Date(item.created_at).toLocaleString()
                      : "N/A"}
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
            <h1>📊 Platform Analytics</h1>

            <div style={statsGrid}>
              <div style={statCard}>
                <h2>{drivers.length}</h2>
                <p>Total Drivers 👨‍✈️</p>
              </div>

              <div style={statCard}>
                <h2>{rides.length}</h2>
                <p>Total Rides 🚖</p>
              </div>

              <div style={statCard}>
                <h2>{completedRides.length}</h2>
                <p>Completed Rides ✅</p>
              </div>

              <div style={statCard}>
                <h2>{cancelledRides.length}</h2>
                <p>Cancelled Rides ❌</p>
              </div>

              <div style={statCard}>
                <h2>{paidRides.length}</h2>
                <p>Paid Rides 💳</p>
              </div>

              <div style={statCard}>
                <h2>{unpaidRides.length}</h2>
                <p>Unpaid Rides 🚫</p>
              </div>

              <div style={statCard}>
                <h2>${totalRevenue.toFixed(2)}</h2>
                <p>Total Platform Revenue 💵</p>
              </div>

              <div style={statCard}>
                <h2>${platformCommission.toFixed(2)}</h2>
                <p>Platform Commission 🏦</p>
              </div>

              <div style={statCard}>
                <h2>${driverPayouts.toFixed(2)}</h2>
                <p>Driver Payouts 🚕</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  display: "flex",
  minHeight: "100vh",
  background: "#f4f7fb",
};

const sidebar = {
  width: "280px",
  background: "black",
  color: "white",
  padding: "30px",
};

const menuButton = {
  width: "100%",
  padding: "14px",
  marginBottom: "12px",
  border: "none",
  borderRadius: "10px",
  background: "#222",
  color: "white",
  cursor: "pointer",
  textAlign: "left",
};

const content = {
  flex: 1,
  padding: "40px",
};

const card = {
  background: "white",
  padding: "30px",
  borderRadius: "20px",
  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
};

const listCard = {
  background: "#f9fafc",
  padding: "20px",
  borderRadius: "15px",
  marginBottom: "20px",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "20px",
  marginTop: "25px",
};

const statCard = {
  background: "#f9fafc",
  padding: "25px",
  borderRadius: "15px",
  border: "1px solid #e5e7eb",
  textAlign: "center",
};

const approveButton = {
  padding: "10px 20px",
  border: "none",
  borderRadius: "8px",
  background: "green",
  color: "white",
  marginRight: "10px",
  cursor: "pointer",
};

const rejectButton = {
  padding: "10px 20px",
  border: "none",
  borderRadius: "8px",
  background: "red",
  color: "white",
  cursor: "pointer",
};

const driverPhoto = {
  width: "90px",
  height: "90px",
  borderRadius: "50%",
  objectFit: "cover",
  marginBottom: "10px",
};

const placeholderPhoto = {
  width: "90px",
  height: "90px",
  borderRadius: "50%",
  background: "#ddd",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  fontSize: "40px",
  marginBottom: "10px",
};

export default AdminDashboard;