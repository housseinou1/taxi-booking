import React, { useCallback, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import { useToast } from "../components/library";
import { usePermissions } from "../permissions/PermissionContext";
import { deriveEmployeeTier } from "./employeesApi";
import EmployeeDirectory from "./EmployeeDirectory";
import EmployeeRegistrationForm from "./EmployeeRegistrationForm";
import EmployeeProfile from "./EmployeeProfile";
import "../beta/BetaDashboard.css";
import "./EmployeeManagementCenter.css";

const TABS = [
  { id: "directory", label: "Directory" },
  { id: "register", label: "Register" },
];

function EmployeeManagementCenterInner() {
  const [tab, setTab] = useState("directory");
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
          <h1 className="beta__title">Employee Management Center</h1>
          <p className="beta__subtitle">
            Directory, registration, profiles, ID cards, and photographs
          </p>
        </div>
      </div>

      <div className="emp-tabs" role="tablist" aria-label="Employee management sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`emp-tab ${tab === item.id ? "emp-tab--active" : ""}`.trim()}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

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
