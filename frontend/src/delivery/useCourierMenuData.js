import { useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import {
  getExpiredOrMissingDocuments,
  getRequiredCourierDocumentTypes,
} from "./deliveryDocumentReview";
import { apiRequest } from "./DeliveryShared";

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function resolvePhotoUrl(url) {
  if (!url) return "";
  if (String(url).startsWith("http")) return url;
  return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function useCourierMenuData(open) {
  const [profile, setProfile] = useState(null);
  const [documentAlertCount, setDocumentAlertCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    const storedUser = getStoredUser();

    async function load() {
      setLoading(true);
      try {
        const [account, docsPayload] = await Promise.all([
          apiRequest(`${API_URL}/deliveries/courier/account/`).catch(() => null),
          apiRequest(`${API_URL}/drivers/me/documents/?context=delivery`).catch(() => null),
        ]);

        if (cancelled) return;

        const vehicleType =
          account?.courier_type ||
          docsPayload?.delivery_vehicle_type ||
          "motorcycle";
        const documents = docsPayload?.documents || docsPayload?.results || [];
        const docTypes = getRequiredCourierDocumentTypes(vehicleType);
        const alerts = getExpiredOrMissingDocuments(documents, docTypes);
        const lifetime = account?.lifetime || {};

        setProfile({
          fullName: account?.full_name || storedUser.first_name || "Courier",
          photoUrl: resolvePhotoUrl(account?.photo_url || storedUser.profile_picture || ""),
          rating: Number(account?.rating || 5).toFixed(1),
          courierTypeLabel: account?.courier_type_label || "Courier",
          courierId: account?.courier_id || (storedUser.id ? `YDL-${storedUser.id}` : ""),
          online: Boolean(account?.online),
          completedDeliveries: lifetime.completed_deliveries || 0,
          totalDeliveries: lifetime.total_deliveries || 0,
        });
        setDocumentAlertCount(alerts.length);
      } catch {
        if (!cancelled) {
          const userId = storedUser.id;
          setProfile({
            fullName:
              `${storedUser.first_name || ""} ${storedUser.last_name || ""}`.trim() ||
              "Courier",
            photoUrl: "",
            rating: "—",
            courierTypeLabel: "Courier",
            courierId: userId ? `YDL-${userId}` : "",
            online: false,
            completedDeliveries: 0,
            totalDeliveries: 0,
          });
          setDocumentAlertCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return { profile, documentAlertCount, loading };
}
