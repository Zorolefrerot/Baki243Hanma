/** Validation des saisies (même règles côté interface et côté couche locale). */
import { isValidAmount } from '../lib/money';
import type { DeliveryStatus, PaymentMethod, PaymentStatus } from './types';

export interface ProductFormValues {
  name: string;
  category: string | null;
  purchase_price: number;
  sale_price: number;
  alert_threshold: number;
  initial_quantity: number;
}

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

export const MAX_NAME = 120;
export const MAX_CATEGORY = 60;

export function validateProduct(values: ProductFormValues, mode: 'create' | 'edit'): {
  errors: FieldErrors<keyof ProductFormValues>;
  warnings: string[];
} {
  const errors: FieldErrors<keyof ProductFormValues> = {};
  const warnings: string[] = [];
  const name = values.name.trim();

  if (name.length === 0) errors.name = 'Donnez un nom à l’article.';
  else if (name.length > MAX_NAME) errors.name = `Le nom ne doit pas dépasser ${MAX_NAME} caractères.`;

  if (values.category && values.category.trim().length > MAX_CATEGORY) {
    errors.category = `La catégorie ne doit pas dépasser ${MAX_CATEGORY} caractères.`;
  }

  if (!isValidAmount(values.purchase_price)) {
    errors.purchase_price = 'Entrez un prix d’achat en FC (0 ou plus).';
  }

  if (!isValidAmount(values.sale_price) || values.sale_price <= 0) {
    errors.sale_price = 'Le prix de vente doit être supérieur à 0 FC.';
  }

  if (!isValidAmount(values.alert_threshold)) {
    errors.alert_threshold = 'Le seuil d’alerte doit être un nombre entier (0 ou plus).';
  }

  if (mode === 'create') {
    if (!isValidAmount(values.initial_quantity)) {
      errors.initial_quantity = 'La quantité initiale doit être un nombre entier (0 ou plus).';
    }
  }

  if (!errors.sale_price && !errors.purchase_price && values.sale_price < values.purchase_price) {
    warnings.push('Attention : le prix de vente est inférieur au prix d’achat. Vous vendriez à perte.');
  }

  return { errors, warnings };
}

export function validatePaymentMethod(value: string): value is PaymentMethod {
  return value === 'cash' || value === 'mobile_money' || value === 'other';
}

export const MAX_CUSTOMER_NAME = 120;
export const MAX_PHONE = 25;
export const MAX_ADDRESS = 200;

export interface DeliveryFormValues {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_date: string;
  payment_status: PaymentStatus;
  delivery_status: DeliveryStatus;
}

export function validatePaymentStatus(value: string): value is PaymentStatus {
  return value === 'paid' || value === 'unpaid';
}

export function validateDeliveryStatus(value: string): value is DeliveryStatus {
  return value === 'to_prepare' || value === 'ready' || value === 'delivered';
}

/** Valide les informations client / livraison d'une commande à livrer. */
export function validateDelivery(values: DeliveryFormValues): FieldErrors<keyof DeliveryFormValues> {
  const errors: FieldErrors<keyof DeliveryFormValues> = {};
  const name = values.customer_name.trim();
  const phone = values.customer_phone.trim();
  const address = values.delivery_address.trim();

  if (name.length === 0) errors.customer_name = 'Indiquez le nom du client.';
  else if (name.length > MAX_CUSTOMER_NAME) errors.customer_name = `Le nom ne doit pas dépasser ${MAX_CUSTOMER_NAME} caractères.`;

  if (phone.length > MAX_PHONE) errors.customer_phone = `Le numéro ne doit pas dépasser ${MAX_PHONE} caractères.`;

  if (address.length > MAX_ADDRESS) errors.delivery_address = `L’adresse ne doit pas dépasser ${MAX_ADDRESS} caractères.`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.delivery_date)) {
    errors.delivery_date = 'Indiquez la date prévue de livraison.';
  }

  if (!validatePaymentStatus(values.payment_status)) {
    errors.payment_status = 'Choisissez l’état du paiement.';
  }
  if (!validateDeliveryStatus(values.delivery_status)) {
    errors.delivery_status = 'Choisissez l’état de la livraison.';
  }
  return errors;
}

export const CANCEL_REASONS = [
  'Erreur de saisie',
  'Le client a annulé',
  'Article non remis',
  'Autre',
] as const;

export function validateReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < 3) return 'Indiquez la raison de l’annulation (3 caractères minimum).';
  if (trimmed.length > 300) return 'La raison ne doit pas dépasser 300 caractères.';
  return null;
}
