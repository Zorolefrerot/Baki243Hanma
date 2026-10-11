import { describe, expect, it } from 'vitest';
import { base64ToBlob, blobToBase64, compressProductImage, MAX_SOURCE_BYTES } from '../../src/lib/images';

describe('images des articles', () => {
  it('refuse les photos de plus de 15 Mo', async () => {
    const huge = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: 'image/jpeg' });
    // On simule une taille supérieure au maximum sans allouer 15 Mo réels.
    Object.defineProperty(huge, 'size', { value: MAX_SOURCE_BYTES + 1 });
    await expect(compressProductImage(huge)).rejects.toThrow('image_too_large');
  });

  it('refuse un fichier qui n’est pas une image', async () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await expect(compressProductImage(pdf)).rejects.toThrow('not_an_image');
  });

  it('convertisseur base64 ↔ binaire (aller-retour)', async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/png' });
    const b64 = await blobToBase64(original);
    expect(b64).toMatch(/^[A-Za-z0-9+/=]+$/);
    const back = base64ToBlob(b64, 'image/png');
    expect(back.type).toBe('image/png');
    expect(back.size).toBe(4);
    const text = new TextDecoder().decode(await base64ToBlob(await blobToBase64(new Blob(['ok'])), 'text/plain').arrayBuffer());
    expect(text).toBe('ok');
  });
});
