import { useCallback, useState } from "react";

export const URL_CHANGE_EVENT = "yala:admin-url-change";

export function readUrlParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch (error) {
    return null;
  }
}

/** Tab state mirrored in `?tab=` so sidebar sub-items can deep-link into a page tab. */
export default function useUrlTab(allowedIds, fallback) {
  const [tab, setTabState] = useState(() => {
    const requested = readUrlParam("tab");
    return requested && allowedIds.includes(requested) ? requested : fallback;
  });

  const setTab = useCallback(
    (next) => {
      setTabState(next);
      try {
        const url = new URL(window.location.href);
        if (next === fallback) url.searchParams.delete("tab");
        else url.searchParams.set("tab", next);
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        window.dispatchEvent(new Event(URL_CHANGE_EVENT));
      } catch (error) {
        /* URL sync is best-effort only */
      }
    },
    [fallback]
  );

  return [tab, setTab];
}
