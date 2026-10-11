/** Affichage et saisie de la photo d'un article (miniature, preneur/capture, aperçu). */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { compressProductImage, type ProductImageSet } from '../lib/images';
import { IconCamera, IconX } from './icons';

/** Met en forme un binaire d'image pour l'affichage (URL révoquée à la destruction). */
export function useImageUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

/** Tuile d'initiale colorée quand l'article n'a pas de photo. */
export function ProductInitial({ name, size = 48 }: { name: string; size?: number }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-xl font-extrabold text-brand-700 dark:text-brand-300"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: 'linear-gradient(135deg, var(--color-brand-100), var(--color-brand-200))',
      }}
    >
      {letter}
    </span>
  );
}

/** Miniature de l'article pour les listes (photo si disponible, sinon initiale). */
export function ProductThumb({
  image,
  thumb,
  name,
  size = 48,
}: {
  image?: Blob | null;
  thumb?: Blob | null;
  name: string;
  size?: number;
}) {
  const url = useImageUrl(thumb ?? image ?? null);
  if (!url) return <ProductInitial name={name} size={size} />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      className="shrink-0 rounded-xl object-cover ring-1 ring-slate-200/70 dark:ring-white/10"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Sélecteur de photo : « Prendre une photo » (caméra) ou « Choisir une photo » (galerie).
 * La photo est compressée à la sélection ; l'aperçu montre le résultat exact.
 */
export function ProductImageInput({
  value,
  name,
  onChange,
  onError,
}: {
  /** Photo déjà enregistrée (aperçu) ou nouvelle sélection. */
  value: ProductImageSet | Blob | null;
  name: string;
  onChange: (image: ProductImageSet | null) => void;
  onError?: (message: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const previewBlob = value instanceof Blob ? value : (value?.blob ?? null);
  const url = useImageUrl(previewBlob);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const image = await compressProductImage(file);
      onChange(image);
    } catch (err) {
      const code = (err as Error).message;
      onError?.(
        code === 'image_too_large'
          ? 'Cette photo est trop lourde (15 Mo maximum). Essayez une autre photo.'
          : 'Cette photo n’a pas pu être lue. Essayez une autre photo.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {url ? (
          <img src={url} alt={`Photo de ${name}`} className="h-20 w-20 rounded-2xl object-cover ring-1 ring-slate-200/70 dark:ring-white/10" />
        ) : (
          <ProductInitial name={name} size={80} />
        )}
        <div className="flex flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60"
          >
            <IconCamera size={18} /> {busy ? 'Traitement…' : 'Prendre une photo'}
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={busy}
            className="sf-ink inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ring-1 ring-inset ring-slate-300 transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 dark:ring-white/15"
          >
            Choisir une photo
          </button>
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Retirer la photo"
            className="flex h-10 w-10 items-center justify-center rounded-full text-coral-700 transition hover:bg-coral-100/50 dark:text-coral-500 dark:hover:bg-coral-500/10"
          >
            <IconX size={20} />
          </button>
        )}
      </div>
      <p className="sf-faint text-xs">
        La photo est automatiquement allégée : rapide à afficher et à envoyer, même avec une connexion lente.
      </p>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={handleFile} />
    </div>
  );
}
