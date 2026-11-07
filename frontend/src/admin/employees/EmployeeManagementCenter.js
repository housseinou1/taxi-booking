import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import { useToast } from "../components/library";
import { usePermissions } from "../permissions/PermissionContext";
import { deriveEmployeeTier } from "./employeesApi";
import EmployeeDirectory from "./EmployeeDirectory";
import EmployeeRegistrationForm from "./EmployeeRegistrationForm";
import EmployeeProfile from "./EmployeeProfile";
import EmployeeIdCardDashboard from "./EmployeeIdCardDashboard";
import { idCardAdminUiEnabled } from "../../config/backendFeatureGates";
import "../beta/BetaDashboard.css";
import "./EmployeeManagementCenter.css";
import "./EmployeeIdCardDashboard.css";

const TABS = [
  { id: "dashboard", label: "ID Card Dashboard" },
  { id: "directory", label: "Directory" },
  { id: "register", label: "Register" },
];

function initialTabFromLocation() {
  if (typeof window !== "undefined" && window.location.pathname.includes("/id-cards")) {
    if (!idCardAdminUiEnabled()) return "directory";
    return "dashboard";
  }
  const params = new URLSearchParams(window.location.search);
  const view = (params.get("view") || "").toLowerCase();
  if (view === "register" || view === "registration") return "register";
  if (view === "directory") return "directory";
  if (view === "dashboard" || view === "id-cards") return "dashboard";
  return "dashboard";
}

function EmployeeManagementCenterInner() {
  const [tab, setTab] = useState(initialTabFromLocation);

  useEffect(() => {
    const sync = () => setTab(initialTabFromLocation());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.location.pathname.includes("/id-cards") &&
      !idCardAdminUiEnabled()
    ) {
      window.history.replaceState({}, "", "/admin/employees?view=directory");
      setTab("directory");
    }
  }, []);
  const [selectedEmployeeNumber, setSelectedEmployeeNumber] = useState(null);
  // Bump to force the directory to reload after a mutation (register/edit).
  const [directoryReloadKey, setDirectoryReloadKey] = useState(0);

  const { permissions } = usePermissions();
  const toast = useToast();

  const tier = useMemo(() => deriveEmployeeTier(permissions), [permissions]);

  const notify = useCallback(
    (toneOrEntry, message) => {
      if (typeof toneOrEntry === "object") {
        toast.push(toneOrEntry);
      } else {
        toast.push({ tone: toneOrEntry, message });
      }
    },
    [toast]
  );

  const selectTab = useCallback((nextTab) => {
    setTab(nextTab);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", nextTab);
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch {
      // ignore history errors in non-browser contexts
    }
  }, []);

  const openProfile = useCallback((employeeNumber) => {
    setSelectedEmployeeNumber(employeeNumber);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedEmployeeNumber(null);
    setTab("directory");
    setDirectoryReloadKey((key) => key + 1);
  }, []);

  if (selectedEmployeeNumber) {
    return (
      <div className="beta emp-center">
        <EmployeeProfile
          employeeNumber={selectedEmployeeNumber}
          canManage={tier.canManage}
          canAdminister={tier.canAdminister}
          canViewDob={tier.viewDob}
          notify={notify}
          onBack={closeProfile}
        />
      </div>
    );
  }

  return (
    <div className="beta emp-center">
      <div className="beta__header">
        <div>
          <h1 className="beta__title">YALA TECHNOLOGIES — Employees &amp; HR</h1>
          <p className="beta__subtitle">Employee ID cards, directory, and HR records</p>
        </div>
      </div>

      <div className="emp-tabs" role="tablist" aria-label="Employee management sections">
        {TABS.filter((item) => item.id !== "dashboard" || idCardAdminUiEnabled()).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`emp-tab ${tab === item.id ? "emp-tab--active" : ""}`.trim()}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && idCardAdminUiEnabled() ? (
        <EmployeeIdCardDashboard
          canAdminister={tier.canAdminister}
          notify={notify}
          onOpenDirectory={() => selectTab("directory")}
        />
      ) : null}

      {tab === "directory" ? (
        <EmployeeDirectory
          reloadKey={directoryReloadKey}
          notify={notify}
          onSelectEmployee={openProfile}
        />
      ) : null}

      {tab === "register" ? (
        <EmployeeRegistrationForm
          notify={notify}
          onRegistered={openProfile}
        />
      ) : null}
    </div>
  );
}

export default function EmployeeManagementCenter() {
  return (
    <AdminShellPage pathname="/admin/employees" title="Employee Management">
      <EmployeeManagementCenterInner />
    </AdminShellPage>
  );
}
