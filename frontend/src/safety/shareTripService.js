import { createTripShare, fetchTrustedContacts } from "./safetyApi";

function buildShareText(ride = {}, shareUrl = "") {
  const driverName =
    ride.driver_name ||
    [ride.driver_first_name, ride.driver_last_name].filter(Boolean).join(" ") ||
    "my driver";
  const vehicle =
    [ride.vehicle_make, ride.vehicle_model].filter(Boolean).join(" ") || ride.vehicle || "";
  const plate = ride.plate_number || ride.vehicle_plate || "";
  const status = String(ride.status || "active").replaceAll("_", " ");
  const lines = [
    `I'm on a Yala ride with ${driverName}.`,
    vehicle ? `Vehicle: ${vehicle}` : null,
    plate ? `Plate: ${plate}` : null,
    `Status: ${status}`,
    `Track my trip: ${shareUrl}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function shareActiveTrip(ride, { notifyPrimary = false } = {}) {
  if (!ride?.id) {
    throw new Error("An active ride is required to share your trip.");
  }

  const data = await createTripShare(ride.id);
  const shareUrl = data.share_url;
  const shareText = buildShareText(ride, shareUrl);
  const payload = { title: "Yala live trip", text: shareText, url: shareUrl };

  let method = "prompt";
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(payload);
      method = "native";
    } catch (error) {
      if (error?.name === "AbortError") {
        return { shareUrl, method: "cancelled" };
      }
    }
  }

  if (method === "prompt" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(shareText);
    method = "clipboard";
  }

  if (notifyPrimary) {
    try {
      const contacts = await fetchTrustedContacts();
      const primary = (contacts || []).find((item) => item.is_primary) || contacts?.[0];
      if (primary?.phone_number) {
        const smsBody = encodeURIComponent(shareText);
        window.location.href = `sms:${primary.phone_number}?body=${smsBody}`;
        method = `${method}+sms`;
      }
    } catch {
      // Non-blocking — share link still created.
    }
  }

  return { shareUrl, method, expiresAt: data.expires_at };
}
