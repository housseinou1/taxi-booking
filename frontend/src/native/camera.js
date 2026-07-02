/**
 * Camera and photo library abstraction.
 * Provides photo capture and gallery selection with automatic compression to 2MB.
 * Falls back to file input in browser mode.
 */

import { isNative } from './platform';

let Camera = null;
let CameraResultType = null;
let CameraSource = null;
try {
  const mod = require('@capacitor/camera');
  Camera = mod.Camera;
  CameraResultType = mod.CameraResultType;
  CameraSource = mod.CameraSource;
} catch {
  // Camera plugin not available
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Compresses an image by reducing quality until it fits within the size limit.
 * Uses canvas-based compression for browser and native base64 data.
 *
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {number} maxSize - Maximum file size in bytes
 * @returns {Promise<string>} Compressed base64 data URL
 */
async function compressImage(dataUrl, maxSize = MAX_FILE_SIZE) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Scale down if image is very large
      const maxDimension = 2048;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Try decreasing quality until under maxSize
      let quality = 0.9;
      let result = canvas.toDataURL('image/jpeg', quality);

      while (result.length * 0.75 > maxSize && quality > 0.1) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }

      // If still too large, scale down further
      if (result.length * 0.75 > maxSize) {
        const scaleFactor = Math.sqrt(maxSize / (result.length * 0.75));
        canvas.width = Math.round(width * scaleFactor);
        canvas.height = Math.round(height * scaleFactor);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        result = canvas.toDataURL('image/jpeg', 0.7);
      }

      resolve(result);
    };
    img.src = dataUrl;
  });
}

/**
 * Takes a photo using the device camera.
 * In browser mode, opens a file picker limited to camera capture.
 *
 * @returns {Promise<{dataUrl: string, format: string}|null>} Photo data or null if cancelled
 */
export async function takePhoto() {
  if (isNative() && Camera) {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      const compressed = await compressImage(photo.dataUrl);
      return { dataUrl: compressed, format: photo.format || 'jpeg' };
    } catch {
      // User cancelled or camera error
      return null;
    }
  }

  // Browser fallback: file input with capture
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const compressed = await compressImage(reader.result);
        resolve({ dataUrl: compressed, format: 'jpeg' });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

/**
 * Picks a photo from the device gallery/photo library.
 * In browser mode, opens a standard file picker.
 *
 * @returns {Promise<{dataUrl: string, format: string}|null>} Photo data or null if cancelled
 */
export async function pickFromGallery() {
  if (isNative() && Camera) {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });

      const compressed = await compressImage(photo.dataUrl);
      return { dataUrl: compressed, format: photo.format || 'jpeg' };
    } catch {
      // User cancelled or gallery error
      return null;
    }
  }

  // Browser fallback: file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const compressed = await compressImage(reader.result);
        resolve({ dataUrl: compressed, format: 'jpeg' });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
