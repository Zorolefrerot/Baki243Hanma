/**
 * Requêtes de lecture sur la base locale. Tous les chiffres affichés sont calculés ici
 * à partir des données réellement enregistrées (aucune valeur en dur).
 */
import { isLowStock, marginRate, orderTotals, stockValue } from '../lib/calc';
import { addAmounts } from '../lib/money';
import { computePeriod, inPeriod, startOfDay, addDays, toDateInput, type Period } from '../lib/dates';
import type { Order, OrderItem, Product } from '../domain/types';
import type { ShopDatabase } from './database';

/** Clés de jour (AAAA-MM-JJ) pour aujourd'hui et demain. */
function dayKeys(now: Date): { today: string; tomorrow: string } {
  return { today: toDateInput(now), tomorrow: toDateInput(addDays(startOfDay(now), 1)) };
}

function computeTodayPeriod(): Period {
  return computePeriod('today', new Date());
}

export interface SeriesPoint {
  key: string;
  label: string;
  revenue: number;
  orders: number;
}

export interface DashboardData {
  hasAnyProduct: boolean;
  hasAnyOrder: boolean;
  orderCount: number;
  quantitySold: number;
  revenue: number;
  cost: number;
  grossMargin: number;
  marginPercent: number;
  stockValue: number;
  productsInStock: number;
  lowStock: Product[];
  recentOrders: Order[];
  series: SeriesPoint[];
  seriesGranularity: 'hour' | 'day' | 'month';
  /** Synthèse du jour, toujours visible. */
  today: { revenue: number; grossMargin: number; orderCount: number; marginPercent: number };
  /** Commandes à livrer non encore prêtes. */
  toPrepareCount: number;
  /** Livraisons prévues aujourd'hui et demain. */
  deliveriesToday: Order[];
  deliveriesTomorrow: Order[];
  /** Commandes à encaisser. */
  unpaidCount: number;
}

/** Ventes confirmées (hors annulées) et leurs lignes, pour une période. */
export async function confirmedSalesInPeriod(
  db: ShopDatabase,
  period: Period,
): Promise<{ orders: Order[]; items: OrderItem[] }> {
  const all = await db.orders.toArray();
  const orders = all.filter((o) => o.status === 'confirmed' && inPeriod(o.created_at, period));
  if (orders.length === 0) return { orders: [], items: [] };
  const items = await db.order_items.where('order_id').anyOf(orders.map((o) => o.id)).toArray();
  return { orders, items };
}

function bucketKey(iso: string, granularity: DashboardData['seriesGranularity']): { key: string; label: string } {
  const d = new Date(iso);
  if (granularity === 'hour') {
    const h = String(d.getHours()).padStart(2, '0');
    return { key: `${h}`, label: `${h} h` };
  }
  if (granularity === 'day') {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return { key: `${y}-${m}-${day}`, label: `${day}/${m}` };
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return { key: `${y}-${m}`, label: `${m}/${String(y).slice(2)}` };
}

export async function loadDashboard(db: ShopDatabase, period: Period): Promise<DashboardData> {
  const [products, recentOrders, sales, allOrders] = await Promise.all([
    db.products.toArray(),
    db.orders.orderBy('created_at').reverse().limit(5).toArray(),
    confirmedSalesInPeriod(db, period),
    db.orders.toArray(),
  ]);

  const orderIds = new Set(sales.orders.map((o) => o.id));
  const itemsInPeriod = sales.items.filter((i) => orderIds.has(i.order_id));

  const revenue = addAmounts(0, ...itemsInPeriod.map((i) => i.line_total));
  const cost = addAmounts(0, ...itemsInPeriod.map((i) => i.line_cost));
  const quantitySold = itemsInPeriod.reduce((sum, i) => sum + i.quantity, 0);
  const grossMargin = revenue - cost;

  // Synthèse du jour (indépendante du filtre de période).
  const todayPeriod = computeTodayPeriod();
  const todaySales = await confirmedSalesInPeriod(db, todayPeriod);
  const todayIds = new Set(todaySales.orders.map((o) => o.id));
  const todayItems = todaySales.items.filter((i) => todayIds.has(i.order_id));
  const todayRevenue = addAmounts(0, ...todayItems.map((i) => i.line_total));
  const todayCost = addAmounts(0, ...todayItems.map((i) => i.line_cost));
  const todayMargin = todayRevenue - todayCost;

  // Livraisons : aujourd'hui, demain, et préparation en cours.
  const { today: todayKey, tomorrow: tomorrowKey } = dayKeys(new Date());
  const live = allOrders.filter((o) => o.status === 'confirmed' && o.delivery_date !== null);
  const deliveriesToday = live.filter((o) => o.delivery_date === todayKey).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const deliveriesTomorrow = live.filter((o) => o.delivery_date === tomorrowKey).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const toPrepareCount = live.filter((o) => o.delivery_status === 'to_prepare').length;
  const unpaidCount = allOrders.filter((o) => o.status === 'confirmed' && o.payment_status === 'unpaid').length;

  // Granularité du graphique selon la durée de la période.
  let granularity: DashboardData['seriesGranularity'] = 'day';
  if (period.kind === 'today' || period.kind === 'yesterday') granularity = 'hour';
  else if (period.kind === 'all') granularity = 'month';
  else if (period.kind === 'custom' && period.start && period.end) {
    const days = (new Date(period.end).getTime() - new Date(period.start).getTime()) / 86_400_000;
    if (days > 62) granularity = 'month';
  }

  const buckets = new Map<string, SeriesPoint>();
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of itemsInPeriod) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }
  for (const order of sales.orders) {
    const { key, label } = bucketKey(order.created_at, granularity);
    const point = buckets.get(key) ?? { key, label, revenue: 0, orders: 0 };
    point.revenue += addAmounts(0, ...(itemsByOrder.get(order.id) ?? []).map((i) => i.line_total));
    point.orders += 1;
    buckets.set(key, point);
  }
  const series = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    hasAnyProduct: products.length > 0,
    hasAnyOrder: (await db.orders.count()) > 0,
    orderCount: sales.orders.length,
    quantitySold,
    revenue,
    cost,
    grossMargin,
    marginPercent: marginRate(revenue, grossMargin),
    stockValue: stockValue(products),
    productsInStock: products.filter((p) => p.quantity > 0).length,
    lowStock: products.filter(isLowStock).sort((a, b) => a.quantity - b.quantity),
    recentOrders,
    series,
    seriesGranularity: granularity,
    today: {
      revenue: todayRevenue,
      grossMargin: todayMargin,
      orderCount: todaySales.orders.length,
      marginPercent: marginRate(todayRevenue, todayMargin),
    },
    toPrepareCount,
    deliveriesToday,
    deliveriesTomorrow,
    unpaidCount,
  };
}

export interface DeliveriesData {
  today: Order[];
  tomorrow: Order[];
  later: Order[];
  doneRecently: Order[];
}

/** Toutes les commandes à livrer, regroupées par jour de livraison. */
export async function loadDeliveries(db: ShopDatabase): Promise<DeliveriesData> {
  const { today: todayKey, tomorrow: tomorrowKey } = dayKeys(new Date());
  const all = (await db.orders.toArray())
    .filter((o) => o.delivery_date !== null && (o.status === 'confirmed' || o.cancelled_at !== null))
    .sort((a, b) => (a.delivery_date! === b.delivery_date! ? a.created_at.localeCompare(b.created_at) : a.delivery_date!.localeCompare(b.delivery_date!)));
  const live = all.filter((o) => o.status === 'confirmed');
  return {
    today: live.filter((o) => o.delivery_date === todayKey && o.delivery_status !== 'delivered'),
    tomorrow: live.filter((o) => o.delivery_date === tomorrowKey && o.delivery_status !== 'delivered'),
    later: live.filter((o) => o.delivery_date! > tomorrowKey && o.delivery_status !== 'delivered'),
    doneRecently: all
      .filter((o) => o.delivery_status === 'delivered' || o.status === 'cancelled')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 20),
  };
}

/** Recalcule les totaux d'une commande à partir de ses lignes (contrôle de cohérence). */
export function checkOrderConsistency(order: Order, items: OrderItem[]): boolean {
  const totals = orderTotals(
    items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price, unit_cost: i.unit_cost })),
  );
  return totals.total_amount === order.total_amount && totals.total_cost === order.total_cost;
}
