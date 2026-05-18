import React, { useState } from "react";

function AuthPage({ onLogin }) {
  const API_URL = "http://127.0.0.1:8000";

  const [mode, setMode] = useState("login");
  const [userType, setUserType] = useState("rider");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("Male");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const register = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/register/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          gender: gender,
          email: email,
          password: password,
          user_type: userType,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert("Account created successfully ✅ Now login");

        setMode("login");
        setFirstName("");
        setLastName("");
        setGender("Male");
        setEmail("");
        setPassword("");
      } else {
        alert(JSON.stringify(data));
      }
    } catch (error) {
      console.log(error);
      alert("Register server error");
    }
  };

  const login = async () => {
    try {
      const res = await fetch(`${API_URL}/api/token/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email,
          password: password,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("access", data.access);
        localStorage.setItem("refresh", data.refresh);
        localStorage.setItem("userType", userType);

        onLogin(userType);

        alert("Login successful ✅");
      } else {
        alert(JSON.stringify(data));
      }
    } catch (error) {
      console.log(error);
      alert("Login server error");
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={title}>🚖 Sakho Express</h1>

        <div style={tabs}>
          <button
            style={mode === "login" ? activeTab : tab}
            onClick={() => setMode("login")}
          >
            Login
          </button>

          <button
            style={mode === "register" ? activeTab : tab}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <div style={roleBox}>
          <button
            style={userType === "rider" ? activeRole : roleBtn}
            onClick={() => setUserType("rider")}
          >
            Rider
          </button>

          <button
            style={userType === "driver" ? activeRole : roleBtn}
            onClick={() => setUserType("driver")}
          >
            Driver
          </button>
        </div>

        {mode === "register" && (
          <>
            <input
              style={input}
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />

            <input
              style={input}
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />

            <select
              style={input}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </>
        )}

        <input
          style={input}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          style={input}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {mode === "login" ? (
          <button style={mainBtn} onClick={login}>
            Login
          </button>
        ) : (
          <button style={mainBtn} onClick={register}>
            Create Account
          </button>
        )}
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#f3f4f6",
};

const card = {
  width: "420px",
  background: "white",
  padding: "35px",
  borderRadius: "22px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
};

const title = {
  fontSize: "48px",
  marginBottom: "25px",
  color: "#0f172a",
};

const tabs = {
  display: "flex",
  gap: "10px",
  marginBottom: "15px",
};

const tab = {
  flex: 1,
  padding: "14px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
};

const activeTab = {
  flex: 1,
  padding: "14px",
  borderRadius: "10px",
  border: "none",
  background: "#0f172a",
  color: "white",
  cursor: "pointer",
};

const roleBox = {
  display: "flex",
  gap: "10px",
  marginBottom: "20px",
};

const roleBtn = {
  flex: 1,
  padding: "14px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
};

const activeRole = {
  flex: 1,
  padding: "14px",
  borderRadius: "10px",
  border: "none",
  background: "#16a34a",
  color: "white",
  cursor: "pointer",
};

const input = {
  width: "100%",
  padding: "16px",
  marginBottom: "14px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  fontSize: "15px",
  boxSizing: "border-box",
};

const mainBtn = {
  width: "100%",
  padding: "16px",
  borderRadius: "12px",
  border: "none",
  background: "#2563eb",
  color: "white",
  fontSize: "17px",
  cursor: "pointer",
  marginTop: "10px",
};

export default AuthPage;