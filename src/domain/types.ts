/** Types du domaine partagés entre l'interface, la base locale et la synchronisation. */

export type ProductStatus = 'active' | 'archived';
export type PaymentMethod = 'cash' | 'mobile_money' | 'other';
export type OrderStatus = 'confirmed' | 'cancelled';
export type MovementType = 'initial' | 'entry' | 'sale' | 'cancel_restock' | 'correction';

/** État du paiement d'une commande (intégralement payé ou non). */
export type PaymentStatus = 'paid' | 'unpaid';

/** Étape de préparation / livraison d'une commande à livrer. */
export type DeliveryStatus = 'to_prepare' | 'ready' | 'delivered';

/** État de synchronisation d'une donnée métier. */
export type EntitySyncStatus = 'pending' | 'synced' | 'failed' | 'conflict' | 'void';

/** État d'une opération de la file de synchronisation. */
export type OpStatus = 'pending' | 'syncing' | 'done' | 'failed' | 'conflict' | 'void';

export type OpType = 'upsert_product' | 'stock_movement' | 'create_order' | 'cancel_order' | 'update_order' | 'update_product_image' | 'update_shop';

export interface Product {
  id: string;
  shop_id: string;
  name: string;
  category: string | null;
  /** Prix d'achat unitaire de référence, en FC entiers. */
  purchase_price: number;
  /** Prix de vente unitaire, en FC entiers. */
  sale_price: number;
  /** Quantité disponible (toujours modifiée par un mouvement de stock). */
  quantity: number;
  alert_threshold: number;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** Dernière version connue côté serveur (0 = jamais synchronisé). Sert à détecter les conflits. */
  version: number;
  sync_status: EntitySyncStatus;
  /** Photo de l'article (stockée sur l'appareil, jamais dans les opérations du catalogue). */
  image: Blob | null;
  /** Miniature de la photo (listes). */
  image_thumb: Blob | null;
  /** Date de dernière mise à jour de la photo (ISO UTC), pour la synchronisation. */
  image_updated_at: string | null;
  /** Le serveur détient une photo pour cet article (photo d'un autre appareil à récupérer). */
  has_remote_image?: boolean;
}

/** Informations client / livraison portées par une commande (optionnelles). */
export interface OrderCustomer {
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  /** Jour de livraison prévu, format AAAA-MM-JJ (heure locale de l'appareil). */
  delivery_date: string | null;
  payment_status: PaymentStatus;
  /** null = vente au comptoir (rien à livrer). */
  delivery_status: DeliveryStatus | null;
}

export interface Order extends OrderCustomer {
  id: string;
  shop_id: string;
  /** Date de la vente (saisie sur l'appareil), ISO UTC. */
  created_at: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  total_amount: number;
  total_cost: number;
  gross_margin: number;
  total_quantity: number;
  cancelled_at: string | null;
  cancel_reason: string | null;
  updated_at: string;
  sync_status: EntitySyncStatus;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  /** Instantanés conservés au moment de la vente. */
  product_name: string;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  line_total: number;
  line_cost: number;
}

export interface StockMovement {
  id: string;
  shop_id: string;
  product_id: string;
  order_id: string | null;
  type: MovementType;
  quantity_delta: number;
  quantity_after: number;
  reason: string | null;
  created_at: string;
}

export interface SyncOperation {
  /** Clé auto-incrémentée locale : fixe l'ordre d'envoi (FIFO). */
  seq?: number;
  /** Identifiant unique de l'opération (clé d'idempotence côté serveur). */
  op_id: string;
  type: OpType;
  /** Entité concernée : identifiant de produit, de commande ou de boutique. */
  entity_id: string;
  payload: Record<string, unknown>;
  status: OpStatus;
  attempts: number;
  error_code: string | null;
  last_error: string | null;
  /** Données serveur reçues lors d'un conflit (pour affichage). */
  server_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile money',
  other: 'Autre',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: 'Payé',
  unpaid: 'À encaisser',
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  to_prepare: 'À préparer',
  ready: 'Prête à livrer',
  delivered: 'Livrée',
};

export const DEFAULT_CATEGORIES = [
  'Brumes',
  'Parfums',
  'Faux ongles',
  'Bagues',
  'Colliers',
  'Bracelets',
  'Autres accessoires',
];
