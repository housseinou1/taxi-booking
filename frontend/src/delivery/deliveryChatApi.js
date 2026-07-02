import { API_URL } from "../apiConfig";

function parseJsonResponse(xhr) {
  try {
    return JSON.parse(xhr.responseText || "{}");
  } catch (_) {
    return {};
  }
}

export function sendDeliveryChatMessage(deliveryId, { message = "", imageFile = null, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!deliveryId) {
      reject(new Error("Missing delivery id."));
      return;
    }

    const form = new FormData();
    const trimmed = String(message || "").trim();
    if (trimmed) form.append("message", trimmed);
    if (imageFile) form.append("image", imageFile, imageFile.name || "chat-photo.jpg");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/deliveries/${deliveryId}/messages/send/`);

    const token = localStorage.getItem("access");
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    if (xhr.upload && typeof onProgress === "function") {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      const data = parseJsonResponse(xhr);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      const details = Object.values(data)
        .flat()
        .filter((value) => typeof value === "string" && value.trim())
        .join(" ");
      reject(
        new Error(data.detail || data.error || details || `Upload failed (HTTP ${xhr.status}).`)
      );
    };

    xhr.onerror = () => reject(new Error("Connection error. Check your internet and try again."));
    xhr.send(form);
  });
}
