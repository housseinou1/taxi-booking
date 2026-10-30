import React, { useEffect, useRef, useState } from "react";

import { fetchPhoto } from "./employeesApi";

/**
 * Renders an employee photograph fetched as an authenticated blob.
 * A missing (404) or forbidden (403) photo falls back to a neutral placeholder
 * and never throws — a failed photo must not break the surrounding row/view.
 * The created object URL is revoked on unmount and before every refetch so the
 * blob is never leaked and never persisted anywhere.
 */
export default function EmployeePhotoThumb({
  employeeNumber,
  className = "emp-thumb",
  placeholderLabel = "No photo",
  refreshKey = 0,
}) {
  const [objectUrl, setObjectUrl] = useState(null);
  const urlRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const revoke = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };

    async function load() {
      revoke();
      if (!cancelled) setObjectUrl(null);
      try {
        const response = await fetchPhoto(employeeNumber);
        if (cancelled) return;
        const url = URL.createObjectURL(response.data);
        urlRef.current = url;
        setObjectUrl(url);
      } catch (err) {
        // 404 (no photo) / 403 (not permitted) / any error → placeholder only.
        if (!cancelled) setObjectUrl(null);
      }
    }

    load();

    return () => {
      cancelled = true;
      revoke();
    };
  }, [employeeNumber, refreshKey]);

  if (objectUrl) {
    return <img className={className} src={objectUrl} alt="Employee photograph" />;
  }

  return (
    <span className={`${className} emp-photo__placeholder`} aria-label={placeholderLabel}>
      {placeholderLabel}
    </span>
  );
}
