import React, { createContext, useContext } from "react";

/**
 * Carries the selected sidebar entry's label from AdminShell down to module pages, so a page
 * shared by several menu items shows the heading of the item that opened it. Outside the shell
 * (tests, standalone rendering) the module's own title is used.
 */
export const AdminPageHeadingContext = createContext("");

export function useAdminPageHeading() {
  return useContext(AdminPageHeadingContext);
}

export function AdminPageTitle({ children }) {
  const label = useAdminPageHeading();
  return <>{label || children}</>;
}
