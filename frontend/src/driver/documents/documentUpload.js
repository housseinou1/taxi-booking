import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import { compressImageDataUrl, takePhoto, pickFromGallery } from "../../native/camera";
import { validateDocumentFile } from "../utils/documentReview";

const OFFLINE_QUEUE_KEY = "yala_driver_document_upload_queue";

export function dataUrlToFile(dataUrl, filename = "document.jpg") {
  const [header, encoded] = String(dataUrl).split(",");
  const mime = header?.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: mime });
}

function readOfflineQueue() {
  try {
    const raw = sessionStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(items) {
  try {
    sessionStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors
  }
}

export function queueOfflineUpload(entry) {
  const queue = readOfflineQueue();
  queue.push({ ...entry, queuedAt: Date.now() });
  writeOfflineQueue(queue);
}

export function getOfflineUploadQueue() {
  return readOfflineQueue();
}

export function clearOfflineUploadQueue() {
  writeOfflineQueue([]);
}

export async function pickPdfFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.onchange = (event) => {
      resolve(event.target.files?.[0] || null);
    };
    input.click();
  });
}

export async function captureDocumentFromCamera() {
  const shot = await takePhoto();
  if (!shot?.dataUrl) return null;
  const file = dataUrlToFile(shot.dataUrl, `camera-${Date.now()}.jpg`);
  return file;
}

export async function pickDocumentFromGallery() {
  const shot = await pickFromGallery();
  if (!shot?.dataUrl) return null;
  const file = dataUrlToFile(shot.dataUrl, `gallery-${Date.now()}.jpg`);
  return file;
}

export async function prepareDocumentUploadFile(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return file;
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const compressed = await compressImageDataUrl(dataUrl);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "document";
  return dataUrlToFile(compressed, `${baseName}.jpg`);
}

export async function uploadDriverDocument({
  file,
  documentType,
  expiresAt,
  onProgress,
  signal,
}) {
  const validation = validateDocumentFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const preparedFile = await prepareDocumentUploadFile(file);
  const formData = new FormData();
  formData.append("file", preparedFile);
  formData.append("document_type", documentType);
  if (expiresAt) {
    formData.append("expires_at", expiresAt);
  }

  const response = await authenticatedApi.post(
    `${API_URL}/drivers/me/documents/upload/`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      signal,
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    },
  );

  return response.data;
}

export async function flushOfflineUploadQueue({ onItemProgress, onItemComplete, onItemError } = {}) {
  const queue = readOfflineQueue();
  if (!queue.length) return { flushed: 0, failed: 0 };

  let flushed = 0;
  let failed = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      const blob = await fetch(item.dataUrl).then((response) => response.blob());
      const file = new File([blob], item.fileName || "retry-upload.jpg", {
        type: item.mimeType || blob.type || "image/jpeg",
      });
      const result = await uploadDriverDocument({
        file,
        documentType: item.documentType,
        expiresAt: item.expiresAt,
        onProgress: (pct) => onItemProgress?.(item, pct),
      });
      flushed += 1;
      onItemComplete?.(item, result);
    } catch (error) {
      failed += 1;
      remaining.push(item);
      onItemError?.(item, error);
    }
  }

  writeOfflineQueue(remaining);
  return { flushed, failed, remaining: remaining.length };
}
