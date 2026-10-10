/** Vue des livraisons : aujourd'hui, demain, plus tard — avec suivi et contact WhatsApp. */
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useReady } from '../app/useReady';
import { loadDeliveries } from '../db/queries';
import { updateOrderFulfillment } from '../db/repo';
import type { Order, OrderItem } from '../domain/types';
import { Badge, Button, Card, EmptyState, PageHeader, SkeletonRows } from '../components/ui';
import { IconCalendar, IconCheck, IconPhone, IconPin, IconTruck, IconWhatsApp, IconWallet } from '../components/icons';
import { DeliveryStatusBadge, PaymentStatusBadge } from '../components/status';
import { useToast } from '../components/Toast';
import { useAsyncAction } from '../components/Confirm';
import { formatFC, formatInt } from '../lib/money';
import { orderRef } from '../lib/ids';
import { formatPhone, normalizePhone, orderWhatsAppMessage, whatsappLink } from '../lib/whatsapp';
import type { ShopDatabase } from '../db/database';

export function LivraisonsPage() {
  const { db, shop } = useReady();
  const data = useLiveQuery(() => loadDeliveries(db), [db], undefined);
  const itemsByOrder = useLiveQuery(
    async () => {
      const rows = await db.order_items.toArray();
      const map = new Map<string, OrderItem[]>();
      for (const it of rows) {
        const list = map.get(it.order_id) ?? [];
        list.push(it);
        map.set(it.order_id, list);
      }
      return map;
    },
    [db],
    undefined,
  );

  const hasAny = data && data.today.length + data.tomorrow.length + data.later.length + data.doneRecently.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Livraisons"
        subtitle="Commandes à livrer, regroupées par jour. Touchez le bouton vert pour prévenir le client."
      />

      {!data || !itemsByOrder ? (
        <SkeletonRows rows={3} />
      ) : !hasAny ? (
        <EmptyState
          title="Aucune livraison prévue"
          icon={<IconTruck size={26} />}
          action={
            <Link to="/commande" className="inline-flex min-h-12 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white">
              Créer une commande à livrer
            </Link>
          }
        >
          Lorsque vous enregistrez une commande avec « Commande à livrer », elle apparaît ici avec les informations du client.
        </EmptyState>
      ) : (
        <>
          <DeliveryGroup title="Aujourd’hui" tone="brand" orders={data.today} itemsByOrder={itemsByOrder} shopName={shop.name} db={db} />
          <DeliveryGroup title="Demain" tone="info" orders={data.tomorrow} itemsByOrder={itemsByOrder} shopName={shop.name} db={db} />
          <DeliveryGroup title="Plus tard" tone="neutral" orders={data.later} itemsByOrder={itemsByOrder} shopName={shop.name} db={db} />
          {data.doneRecently.length > 0 && (
            <DeliveryGroup title="Terminées / annulées" tone="muted" orders={data.doneRecently} itemsByOrder={itemsByOrder} shopName={shop.name} db={db} />
          )}
        </>
      )}
    </div>
  );
}

function DeliveryGroup({
  title,
  tone,
  orders,
  itemsByOrder,
  shopName,
  db,
}: {
  title: string;
  tone: 'brand' | 'info' | 'neutral' | 'muted';
  orders: Order[];
  itemsByOrder: Map<string, OrderItem[]>;
  shopName: string;
  db: ShopDatabase;
}) {
  if (orders.length === 0) return null;
  const dot =
    tone === 'brand' ? 'bg-brand-600' : tone === 'info' ? 'bg-sky-500' : tone === 'neutral' ? 'bg-slate-400' : 'bg-slate-300 dark:bg-slate-600';
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="sf-muted flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
        {title} · {orders.length}
      </h2>
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <DeliveryCard key={o.id} order={o} items={itemsByOrder.get(o.id) ?? []} shopName={shopName} db={db} />
        ))}
      </ul>
    </section>
  );
}

function DeliveryCard({ order, items, shopName, db }: { order: Order; items: OrderItem[]; shopName: string; db: ShopDatabase }) {
  const toast = useToast();
  const action = useAsyncAction();
  const phoneIntl = order.customer_phone ? normalizePhone(order.customer_phone) : null;
  const live = order.status === 'confirmed';

  const message = orderWhatsAppMessage({
    shopName,
    orderId: orderRef(order.id),
    lines: items.map((i) => ({ product_name: i.product_name, quantity: i.quantity, line_total: i.line_total })),
    total: order.total_amount,
    deliveryDate: order.delivery_date ? order.delivery_date.split('-').reverse().join('/') : null,
    address: order.delivery_address,
  });

  async function setDelivery(status: 'to_prepare' | 'ready' | 'delivered') {
    const ok = await action.run(async () => {
      await updateOrderFulfillment(db, order.id, { delivery_status: status });
    });
    if (ok) {
      toast.show(status === 'delivered' ? 'Livraison confirmée.' : 'État de la livraison mis à jour.', 'success');
    } else if (action.error) {
      toast.show(action.error, 'error');
    }
  }

  async function setPaid() {
    const ok = await action.run(async () => {
      await updateOrderFulfillment(db, order.id, { payment_status: 'paid' });
    });
    if (ok) toast.show('Paiement enregistré.', 'success');
    else if (action.error) toast.show(action.error, 'error');
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sf-ink truncate text-base font-bold">{order.customer_name ?? `Commande ${orderRef(order.id)}`}</p>
          <p className="sf-faint text-xs">
            Commande {orderRef(order.id)} · {formatInt(order.total_quantity)} article(s)
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="sf-ink font-extrabold tabular-nums">{formatFC(order.total_amount)}</span>
          <PaymentStatusBadge status={order.payment_status} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        {phoneIntl && (
          <p className="sf-muted flex items-center gap-2">
            <IconPhone size={16} className="text-brand-700 dark:text-brand-300" />
            {formatPhone(phoneIntl)}
          </p>
        )}
        {order.delivery_address && (
          <p className="sf-muted flex items-start gap-2">
            <IconPin size={16} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300" />
            {order.delivery_address}
          </p>
        )}
        {order.delivery_date && (
          <p className="sf-muted flex items-center gap-2">
            <IconCalendar size={16} className="text-brand-700 dark:text-brand-300" />
            Prévue le {order.delivery_date.split('-').reverse().join('/')}
          </p>
        )}
      </div>

      <details className="rounded-xl text-sm" style={{ background: 'var(--sf-surface-2)' }}>
        <summary className="sf-muted cursor-pointer list-none px-3.5 py-2.5 font-medium">
          Articles ({items.length}) · {formatFC(order.total_amount)}
        </summary>
        <ul className="sf-divider divide-y px-3.5 pb-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2">
              <span className="sf-muted truncate">
                {formatInt(i.quantity)} × {i.product_name}
              </span>
              <span className="sf-ink shrink-0 tabular-nums">{formatFC(i.line_total)}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <DeliveryStatusBadge status={order.delivery_status} />
          {order.status === 'cancelled' && <Badge tone="danger">Annulée</Badge>}
        </div>
        {live && (
          <Link
            to={`/historique/${order.id}`}
            className="sf-faint text-xs font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Détails
          </Link>
        )}
      </div>

      {live && (
        <div className="flex flex-col gap-2">
          {phoneIntl && (
            <a
              href={whatsappLink(phoneIntl, message)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-mint-600 px-4 font-semibold text-white shadow-[0_6px_16px_-6px_rgba(34,177,132,0.55)] transition hover:bg-mint-700 active:scale-[0.98]"
            >
              <IconWhatsApp size={20} /> Ouvrir la discussion WhatsApp
            </a>
          )}
          <div className="grid grid-cols-2 gap-2">
            {order.delivery_status === 'to_prepare' && (
              <Button variant="secondary" size="md" onClick={() => void setDelivery('ready')} disabled={action.busy}>
                <IconCheck size={17} /> Marquer prête
              </Button>
            )}
            {(order.delivery_status === 'ready' || order.delivery_status === 'to_prepare') && (
              <Button variant="primary" size="md" onClick={() => void setDelivery('delivered')} disabled={action.busy}>
                <IconTruck size={17} /> Marquer livrée
              </Button>
            )}
            {order.delivery_status === 'delivered' && order.payment_status === 'unpaid' && (
              <Button variant="mint" size="md" onClick={() => void setPaid()} disabled={action.busy}>
                <IconWallet size={17} /> Encaisser
              </Button>
            )}
            {order.payment_status === 'unpaid' && order.delivery_status !== 'delivered' && (
              <Button variant="secondary" size="md" onClick={() => void setPaid()} disabled={action.busy}>
                <IconWallet size={17} /> Encaisser
              </Button>
            )}
            {order.delivery_status === 'delivered' && order.payment_status === 'paid' && (
              <span className="col-span-2 text-center text-sm text-mint-700 dark:text-mint-500">
                Livraison terminée et payée ✓
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
