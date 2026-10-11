/**
 * Images des articles : compression côté appareil, conversions base64 pour la synchronisation.
 *
 * Une photo de téléphone pèse souvent 2 à 5 Mo. Elle est redimensionnée et recompressée
 * avant stockage (image complète + miniature) : l'application reste rapide et les envois
 * restent courts, y compris sur une connexion lente.
 */

export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const IMAGE_MAX_DIM = 1024;
export const THUMB_MAX_DIM = 256;
export const IMAGE_QUALITY = 0.72;
export const THUMB_QUALITY = 0.65;

export interface ProductImageSet {
  /** Image affichée dans la fiche article. */
  blob: Blob;
  /** Miniature pour les listes (léger, décodé vite). */
  thumb: Blob;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_ unreadable'));
    };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('image_encode_failed'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Compresse une photo choisie par l'utilisateur (fichier ou capture caméra).
 * Refuse les fichiers trop gros ; redimensionne et recomprime toujours.
 */
export async function compressProductImage(file: Blob): Promise<ProductImageSet> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not_an_image');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('image_too_large');
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    throw new Error('image_unreadable');
  }
  const [blob, thumb] = await Promise.all([
    toBlob(drawScaled(img, IMAGE_MAX_DIM), IMAGE_QUALITY),
    toBlob(drawScaled(img, THUMB_MAX_DIM), THUMB_QUALITY),
  ]);
  return { blob, thumb };
}

/** Convertit un binaire en base64 (sans le préfixe data URL), pour la synchronisation. */
export function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  });
}

/** Reconstruit un binaire depuis le base64 reçu du serveur. */
export function base64ToBlob(base64: string, mime = 'image/jpeg'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
