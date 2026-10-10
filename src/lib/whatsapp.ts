/**
 * Outils WhatsApp : numéros de téléphone, lien de discussion, import d'un message collé.
 *
 * L'import est une aide à la saisie : l'application propose ce qu'elle reconnaît dans le
 * texte collé, puis le commerçant vérifie et confirme. Aucune conversation privée n'est lue.
 */

/** Nettoie un numéro saisi et le met au format international (sans « + »), null si invalide. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits === '') return null;
  // Numéros RDC : 08xxxxxxxx -> 2438xxxxxxxx, 8xxxxxxxx -> 2438xxxxxxxx.
  if (digits.startsWith('243')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  // Un numéro mobile RDC fait 9 chiffres (opérateurs : 8x… et 9x…).
  if (digits.length === 9 && /^[89]/.test(digits)) {
    return `243${digits}`;
  }
  // Autres pays : au moins 7 chiffres, on garde tel quel si déjà international.
  const full = trimmed.replace(/[^\d+]/g, '');
  if (full.startsWith('+') && digits.length >= 7) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

/** Affiche un numéro RDC de façon lisible : +243 81 234 56 78. */
export function formatPhone(intl: string): string {
  const digits = intl.replace(/\D/g, '');
  if (digits.startsWith('243') && digits.length === 12) {
    const n = digits.slice(3);
    return `+243 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  }
  return `+${digits}`;
}

/** Lien pour ouvrir la conversation WhatsApp du client avec un message préparé. */
export function whatsappLink(phoneIntl: string, message: string): string {
  const digits = phoneIntl.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export interface ParsedMessageLine {
  /** Texte reconnu comme article. */
  label: string;
  quantity: number;
}

export interface ParsedWhatsAppMessage {
  /** Lignes ressemblant à des articles (libellé + quantité). */
  lines: ParsedMessageLine[];
  /** Numéros trouvés (format international normalisé). */
  phones: string[];
  /** Nom de client probable, sinon null. */
  name: string | null;
  /** Adresse probable, sinon null. */
  address: string | null;
  /** Montant total probable en FC, sinon null. */
  totalAmount: number | null;
}

const AMOUNT_RE = /(\d[\d\s\u00A0.,]{2,})\s*(?:fc|fr|cdf)?\b/i;
const QTY_BEFORE_RE = /^(\d{1,3})\s*(?:x|×|\*|fois)?\s+(?:de\s+|la\s+|le\s+|les\s+)?(.+)$/i;
const QTY_AFTER_RE = /^(.+?)\s*(?:x|×|\*|:|-)?\s*(\d{1,3})$/i;
const ADDRESS_HINTS = /\b(adresse|av\.?|avenue|boulevard|bd\.?|n°|numéro|quartier|commune|avenue|kinshasa|limete|gombe|kintambo|ngaliema|bandalungwa|masina|limete)\b/i;
const NAME_HINTS = /^(?:nom|client|madame|monsieur|mme|m\.|mlle)\s*[:\-]?\s*/i;

function parseAmountValue(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00A0.]/g, '').replace(',', '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Analyse un message WhatsApp collé et propose les informations reconnues.
 * L'utilisateur doit toujours vérifier et confirmer avant la création de la commande.
 */
export function parseWhatsAppMessage(text: string): ParsedWhatsAppMessage {
  const result: ParsedWhatsAppMessage = { lines: [], phones: [], name: null, address: null, totalAmount: null };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    // Téléphones.
    for (const match of line.matchAll(/(\+?\d[\d\s\-().]{6,}\d)/g)) {
      const intl = normalizePhone(match[1]);
      if (intl && !result.phones.includes(intl)) result.phones.push(intl);
    }

    // Adresse.
    if (result.address === null && ADDRESS_HINTS.test(line)) {
      const cleaned = line.replace(/^(?:adresse|livraison)\s*[:\-]\s*/i, '').trim();
      if (cleaned.length >= 5) result.address = cleaned.slice(0, 200);
      continue;
    }

    // Montant total.
    if (/\b(total|montant|à payer|a payer|somme)\b/i.test(line) && result.totalAmount === null) {
      const m = AMOUNT_RE.exec(line);
      if (m) result.totalAmount = parseAmountValue(m[1]);
      continue;
    }

    // Articles : « 2 x Parfum Chanel », « Brume x3 », « Faux ongles : 4 »…
    const before = QTY_BEFORE_RE.exec(line);
    const after = !before ? QTY_AFTER_RE.exec(line) : null;
    if (before) {
      const qty = Number(before[1]);
      const label = before[2].replace(/\s*[:\-–]\s*$/, '').trim();
      if (qty > 0 && label.length >= 2 && !/^\d+$/.test(label)) {
        result.lines.push({ label: label.slice(0, 120), quantity: qty });
        continue;
      }
    }
    if (after) {
      const label = after[1].replace(/\s*[:\-–]\s*$/, '').trim();
      const qty = Number(after[2]);
      if (qty > 0 && label.length >= 2 && !/^\d+$/.test(label) && !/^(total|montant)/i.test(label)) {
        result.lines.push({ label: label.slice(0, 120), quantity: qty });
        continue;
      }
    }

    // Nom probable : « c’est Marie », « je suis Jean », première ligne courte, ou « nom : ».
    if (result.name === null) {
      const intro = /(?:c['’]est|je suis|moi c['’]est)\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})/i.exec(line);
      const hint = NAME_HINTS.exec(line);
      if (intro) {
        const name = intro[1].trim().replace(/\s+/g, ' ');
        if (name.length >= 2) result.name = name.slice(0, 120);
      } else if (hint) {
        const name = line.slice(hint[0].length).trim();
        if (name.length >= 2) result.name = name.slice(0, 120);
      } else if (
        result.phones.length === 0 &&
        /^[A-Za-zÀ-ÖØ-öø-ÿ' ]{2,40}$/.test(line) &&
        !/\b(bonjour|salut|merci|ok|stp|svp|combien|disponible|commande)\b/i.test(line)
      ) {
        result.name = line.slice(0, 120);
      }
    }
  }
  return result;
}

/** Message WhatsApp préparé à partir du récapitulatif d'une commande. */
export function orderWhatsAppMessage(params: {
  shopName: string;
  orderId: string;
  lines: { product_name: string; quantity: number; line_total: number }[];
  total: number;
  deliveryDate?: string | null;
  address?: string | null;
}): string {
  const money = (v: number) => `${v.toLocaleString('fr-FR').replace(/\u202F/g, ' ')} FC`;
  const items = params.lines.map((l) => `• ${l.quantity} × ${l.product_name} — ${money(l.line_total)}`).join('\n');
  const parts = [
    `Bonjour ! Votre commande chez ${params.shopName} est enregistrée :`,
    items,
    `Total : ${money(params.total)}`,
  ];
  if (params.deliveryDate) parts.push(`Livraison prévue : ${params.deliveryDate}`);
  if (params.address) parts.push(`Adresse : ${params.address}`);
  return parts.join('\n');
}
