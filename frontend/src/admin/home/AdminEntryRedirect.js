import React, { useEffect } from "react";

import { resolveAdminHomeRoute } from "../layouts/permissions/adminPermissionsApi";
import { AdminPageLoader } from "../layouts/loading/AdminLoaders";

/** Redirect /admin to role home_route from permissions API */
export default function AdminEntryRedirect() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const homeRoute = await resolveAdminHomeRoute({ force: true });
        if (cancelled) return;
        window.location.replace(homeRoute);
      } catch (error) {
        if (!cancelled) {
          window.location.replace("/admin/home/ops");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <AdminPageLoader label="Redirecting to your workspace…" />;
}
