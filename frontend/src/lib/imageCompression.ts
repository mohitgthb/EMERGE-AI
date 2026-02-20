/**
 * Image compression utility for SOS camera captures.
 * Compresses images before upload to reduce bandwidth and improve speed.
 */

const MAX_WIDTH = 1280;
const MAX_HEIGHT = 960;
const QUALITY = 0.75;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export async function compressImage(
  blob: Blob,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<Blob> {
  const maxW = options?.maxWidth ?? MAX_WIDTH;
  const maxH = options?.maxHeight ?? MAX_HEIGHT;
  const quality = options?.quality ?? QUALITY;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down if necessary
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Compression failed'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export async function compressToMaxSize(
  blob: Blob,
  maxBytes: number = MAX_FILE_SIZE
): Promise<Blob> {
  if (blob.size <= maxBytes) return blob;

  let quality = QUALITY;
  let compressed = await compressImage(blob, { quality });

  // Iteratively reduce quality until under size limit
  while (compressed.size > maxBytes && quality > 0.2) {
    quality -= 0.1;
    compressed = await compressImage(blob, { quality });
  }

  return compressed;
}

export function dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
}
