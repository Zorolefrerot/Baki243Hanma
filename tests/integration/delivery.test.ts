/**
 * Tests des commandes à livrer : informations client, états de paiement / livraison,
 * mise à jour du suivi et regroupement par jour de livraison.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShopDatabase } from '../../src/db/database';
import { BusinessError, createOrder, createProduct, updateOrderFulfillment } from '../../src/db/repo';
import { loadDeliveries } from '../../src/db/queries';
import { addDays, startOfDay, toDateInput } from '../../src/lib/dates';
import { newId } from '../../src/lib/ids';
import type { ProductFormValues } from '../../src/domain/validation';
import { uniqueDbName } from '../helpers/names';

const SHOP = newId();

function product(over: Partial<ProductFormValues> = {}): ProductFormValues {
  return {
    name: 'Brume vanille',
    category: 'Brumes',
    purchase_price: 2500,
    sale_price: 5000,
    alert_threshold: 3,
    initial_quantity: 10,
    ...over,
  };
}

let db: ShopDatabase;
let name: string;

beforeEach(async () => {
  name = uniqueDbName('delivery');
  db = new ShopDatabase(name);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('commandes à livrer', () => {
  it('enregistre les informations client et les envoie au serveur', async () => {
    const p = await createProduct(db, SHOP, product());
    const tomorrow = toDateInput(addDays(startOfDay(new Date()), 1));
    const { order } = await createOrder(db, SHOP, {
      id: newId(),
      lines: [{ product_id: p.id, quantity: 2 }],
      payment_method: 'mobile_money',
      customer: {
        customer_name: '  Marie Kabeya ',
        customer_phone: '243812345678',
        delivery_address: '12 av. Lemba',
        delivery_date: tomorrow,
        payment_status: 'unpaid',
        delivery_status: 'to_prepare',
      },
    });

    expect(order.customer_name).toBe('Marie Kabeya');
    expect(order.customer_phone).toBe('243812345678');
    expect(order.delivery_address).toBe('12 av. Lemba');
    expect(order.delivery_date).toBe(tomorrow);
    expect(order.payment_status).toBe('unpaid');
    expect(order.delivery_status).toBe('to_prepare');

    const op = (await db.sync_operations.toArray()).find((o) => o.type === 'create_order');
    expect(op).toBeDefined();
    const wireOrder = op!.payload.order as Record<string, unknown>;
    expect(wireOrder.customer_name).toBe('Marie Kabeya');
    expect(wireOrder.delivery_date).toBe(tomorrow);
    expect(wireOrder.payment_status).toBe('unpaid');
    expect(wireOrder.delivery_status).toBe('to_prepare');
  });

  it('une vente au comptoir reste simple (pas de livraison)', async () => {
    const p = await createProduct(db, SHOP, product());
    const { order } = await createOrder(db, SHOP, {
      id: newId(),
      lines: [{ product_id: p.id, quantity: 1 }],
      payment_method: 'cash',
    });
    expect(order.delivery_status).toBeNull();
    expect(order.delivery_date).toBeNull();
    expect(order.payment_status).toBe('paid');
  });

  it('refuse une commande à livrer sans nom de client', async () => {
    const p = await createProduct(db, SHOP, product());
    await expect(
      createOrder(db, SHOP, {
        id: newId(),
        lines: [{ product_id: p.id, quantity: 1 }],
        payment_method: 'cash',
        customer: { delivery_date: toDateInput(new Date()), customer_name: '   ' },
      }),
    ).rejects.toThrow(BusinessError);
  });

  it('met à jour le suivi (paiement, livraison) et journalise l’opération', async () => {
    const p = await createProduct(db, SHOP, product());
    const { order } = await createOrder(db, SHOP, {
      id: newId(),
      lines: [{ product_id: p.id, quantity: 1 }],
      payment_method: 'cash',
      customer: {
        customer_name: 'Marie',
        delivery_date: toDateInput(new Date()),
        payment_status: 'unpaid',
        delivery_status: 'to_prepare',
      },
    });

    const ready = await updateOrderFulfillment(db, order.id, { delivery_status: 'ready' });
    expect(ready.delivery_status).toBe('ready');
    const paid = await updateOrderFulfillment(db, order.id, { payment_status: 'paid' });
    expect(paid.payment_status).toBe('paid');
    expect(paid.delivery_status).toBe('ready');

    const ops = await db.sync_operations.toArray();
    const updates = ops.filter((o) => o.type === 'update_order');
    expect(updates).toHaveLength(2);
    expect(updates[0].payload).toMatchObject({ order_id: order.id, delivery_status: 'ready' });
    expect(updates[1].payload).toMatchObject({ order_id: order.id, payment_status: 'paid' });
  });

  it('regroupe les livraisons par jour et masque les livrées du suivi', async () => {
    const p = await createProduct(db, SHOP, product());
    const today = toDateInput(new Date());
    const later = toDateInput(addDays(startOfDay(new Date()), 3));

    const a = await createOrder(db, SHOP, {
      id: newId(),
      lines: [{ product_id: p.id, quantity: 1 }],
      payment_method: 'cash',
      customer: { customer_name: 'A', delivery_date: today },
    });
    await createOrder(db, SHOP, {
      id: newId(),
      lines: [{ product_id: p.id, quantity: 1 }],
      payment_method: 'cash',
      customer: { customer_name: 'B', delivery_date: later },
    });

    let data = await loadDeliveries(db);
    expect(data.today.map((o) => o.customer_name)).toEqual(['A']);
    expect(data.later.map((o) => o.customer_name)).toEqual(['B']);

    await updateOrderFulfillment(db, a.order.id, { delivery_status: 'delivered' });
    data = await loadDeliveries(db);
    expect(data.today).toHaveLength(0);
    expect(data.doneRecently.map((o) => o.customer_name)).toContain('A');
  });
});
