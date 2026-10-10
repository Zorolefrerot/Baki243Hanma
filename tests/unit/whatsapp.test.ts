/** Tests des outils WhatsApp : numéros, lien de discussion, import de message. */
import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone, orderWhatsAppMessage, parseWhatsAppMessage, whatsappLink } from '../../src/lib/whatsapp';

describe('normalizePhone', () => {
  it('met les numéros RDC au format international', () => {
    expect(normalizePhone('081 234 56 78')).toBe('243812345678');
    expect(normalizePhone('812345678')).toBe('243812345678');
    expect(normalizePhone('+243 81 234 56 78')).toBe('243812345678');
    expect(normalizePhone('243812345678')).toBe('243812345678');
    expect(normalizePhone('099 876 54 32')).toBe('243998765432');
  });

  it('accepte les numéros internationaux valides et refuse le reste', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('33612345678');
    expect(normalizePhone('bonjour')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});

describe('formatPhone', () => {
  it('affiche les numéros RDC de façon lisible', () => {
    expect(formatPhone('243812345678')).toBe('+243 81 234 56 78');
    expect(formatPhone('33612345678')).toBe('+33612345678');
  });
});

describe('whatsappLink', () => {
  it('construit un lien wa.me avec le message encodé', () => {
    const link = whatsappLink('243812345678', 'Bonjour !');
    expect(link).toBe('https://wa.me/243812345678?text=Bonjour%20!');
  });
});

describe('parseWhatsAppMessage', () => {
  it('reconnaît client, téléphone, adresse, articles et total', () => {
    const parsed = parseWhatsAppMessage(
      'Bonjour c’est Marie\n081 234 56 78\n2 x Brume coco\n1 Parfum Vanille\nLivraison demain, adresse : 12 av. Lemba, Limete\nTotal 25000',
    );
    expect(parsed.name).toBe('Marie');
    expect(parsed.phones).toContain('243812345678');
    expect(parsed.address).toContain('12 av. Lemba');
    expect(parsed.lines).toEqual(
      expect.arrayContaining([
        { label: 'Brume coco', quantity: 2 },
        { label: 'Parfum Vanille', quantity: 1 },
      ]),
    );
    expect(parsed.totalAmount).toBe(25000);
  });

  it('reconnaît les quantités après le libellé', () => {
    const parsed = parseWhatsAppMessage('Brume coco x3');
    expect(parsed.lines).toEqual([{ label: 'Brume coco', quantity: 3 }]);
  });

  it('reste vide pour un texte sans information exploitable', () => {
    const parsed = parseWhatsAppMessage('ok merci');
    expect(parsed.lines).toEqual([]);
    expect(parsed.phones).toEqual([]);
    expect(parsed.name).toBeNull();
    expect(parsed.totalAmount).toBeNull();
  });
});

describe('orderWhatsAppMessage', () => {
  it('compose un récapitulatif lisible pour le client', () => {
    const message = orderWhatsAppMessage({
      shopName: 'Boutique Mama Grace',
      orderId: '1A2B3C4D',
      lines: [{ product_name: 'Brume coco', quantity: 2, line_total: 10000 }],
      total: 10000,
      deliveryDate: '11/10/2026',
      address: '12 av. Lemba',
    });
    expect(message).toContain('Boutique Mama Grace');
    expect(message).toContain('2 × Brume coco');
    expect(message).toContain('10 000 FC');
    expect(message).toContain('11/10/2026');
    expect(message).toContain('12 av. Lemba');
  });
});
