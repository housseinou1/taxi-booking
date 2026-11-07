import { useCallback, useEffect, useState } from "react";

import { getDashboardPath, getUserRole } from "../auth/roleRouting";
import { clearAuthSession, getStoredUser, hasStoredAuthCredentials } from "../auth/session";

function profilePathForDashboard(dashboardPath) {
  const dash = String(dashboardPath || "");
  if (dash.startsWith("/admin")) return "/admin";
  if (dash.startsWith("/delivery")) return "/delivery-account";
  if (dash.startsWith("/driver")) return "/driver-profile";
  if (dash.startsWith("/merchant")) return "/merchant";
  return "/rider-profile";
}

export function useWebsiteAuth() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);

  const refresh = useCallback(() => {
    const stored = getStoredUser();
    const hasCreds = hasStoredAuthCredentials();
    const ok = Boolean(hasCreds && stored && Object.keys(stored).length);
    setAuthed(ok);
    setUser(ok ? stored : null);
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const role = user ? getUserRole(user) : null;
  const dashboardPath = user ? getDashboardPath(user) : "/login";
  const profilePath = user ? profilePathForDashboard(dashboardPath) : "/login";

  const logout = useCallback(async () => {
    await clearAuthSession();
    refresh();
    window.location.href = "/";
  }, [refresh]);

  return { authed, user, role, dashboardPath, profilePath, logout, refresh };
}
