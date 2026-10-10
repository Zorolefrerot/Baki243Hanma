import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useReady } from '../app/useReady';
import { cancelOrder } from '../db/repo';
import { checkOrderConsistency } from '../db/queries';
import { PAYMENT_LABELS, type Order, type OrderItem } from '../domain/types';
import { CANCEL_REASONS, validateReason } from '../domain/validation';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Sheet, Spinner, TextInput, Field } from '../components/ui';
import { IconBack, IconChevron, IconSearch } from '../components/icons';
import { OrderStatusBadge, PaymentStatusBadge, DeliveryStatusBadge, SyncBadge } from '../components/status';
import { IconTruck, IconWhatsApp } from '../components/icons';
import { normalizePhone, orderWhatsAppMessage, whatsappLink } from '../lib/whatsapp';
import { PeriodFilter, defaultCustomRange, type CustomRange } from '../components/PeriodFilter';
import { useToast } from '../components/Toast';
import { useAsyncAction } from '../components/Confirm';
import { computePeriod, formatDateTime, inPeriod, type PeriodKind, type Period } from '../lib/dates';
import { formatFC, formatInt, multiplyAmount } from '../lib/money';
import { orderRef } from '../lib/ids';
import { marginRate } from '../lib/calc';

const PAGE_SIZE = 50;

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function OrdersPage() {
  const { db } = useReady();
  const [kind, setKind] = useState<PeriodKind>('all');
  const [custom, setCustom] = useState<CustomRange>(() => defaultCustomRange());
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const period: Period = useMemo(() => computePeriod(kind, new Date(), custom), [kind, custom]);
  const orders = useLiveQuery(() => db.orders.orderBy('created_at').reverse().toArray(), [db], undefined);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
    return (orders ?? []).filter((o) => {
      if (!inPeriod(o.created_at, period)) return false;
      if (q === '') return true;
      return o.id.replace(/-/g, '').toUpperCase().startsWith(q);
    });
  }, [orders, period, search]);

  const groups = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of filtered.slice(0, limit)) {
      const key = new Date(o.created_at).toDateString();
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return [...map.entries()].map(([key, list]) => ({ key, label: dayLabel(list[0].created_at), orders: list }));
  }, [filtered, limit]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Historique" subtitle="Toutes vos commandes, y compris les annulées." />

      <label className="relative block">
        <span className="sr-only">Rechercher une commande par identifiant</span>
        <IconSearch size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Identifiant, ex. 1A2B3C4D"
          autoCapitalize="characters"
          className="sf-input pl-12 uppercase placeholder:normal-case"
        />
      </label>

      <PeriodFilter value={kind} onChange={setKind} custom={custom} onCustomChange={setCustom} includeAll ariaLabel="Filtrer par date" />

      {orders === undefined && <Spinner />}

      {orders && orders.length === 0 && (
        <EmptyState
          title="Aucune commande enregistrée"
          action={
            <Link to="/commande" className="inline-flex min-h-12 items-center rounded-xl bg-brand-700 px-5 font-semibold text-white">
              Faire une première vente
            </Link>
          }
        >
          Vos commandes apparaîtront ici avec leur date, leur total et leur état de synchronisation.
        </EmptyState>
      )}

      {orders && orders.length > 0 && filtered.length === 0 && (
        <EmptyState title="Aucune commande trouvée">
          {search ? `Aucune commande ne correspond à « ${search} » sur cette période.` : 'Aucune commande sur cette période. Essayez « Tout ».'}
        </EmptyState>
      )}

      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} className="flex flex-col gap-2">
          <h2 className="sf-muted px-1 text-sm font-bold capitalize tracking-wide">{g.label}</h2>
          <ul className="flex flex-col gap-2">
            {g.orders.map((o) => (
              <li key={o.id}>
                <Link to={`/historique/${o.id}`} className="sf-card sf-pop flex min-h-16 items-center justify-between gap-3 p-4 active:scale-[0.99]">
                  <div className="min-w-0">
                    <p className="sf-ink flex items-center gap-2 truncate font-semibold">
                      {o.customer_name ? o.customer_name : `Commande ${orderRef(o.id)}`}
                      <span className="sf-faint text-xs font-normal">{new Date(o.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </p>
                    <p className="sf-muted mt-1 flex flex-wrap items-center gap-2 text-sm">
                      {PAYMENT_LABELS[o.payment_method]} · {formatInt(o.total_quantity)} art.
                      {o.delivery_date && (
                        <span className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-300">
                          <IconTruck size={14} /> {o.delivery_date.split('-').reverse().join('/')}
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <OrderStatusBadge status={o.status} />
                      {o.delivery_status && <DeliveryStatusBadge status={o.delivery_status} />}
                      {o.payment_status === 'unpaid' && o.status === 'confirmed' && <PaymentStatusBadge status={o.payment_status} />}
                      <SyncBadge status={o.sync_status} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`font-bold tabular-nums ${o.status === 'cancelled' ? 'sf-faint line-through' : 'sf-ink'}`}>{formatFC(o.total_amount)}</span>
                    <IconChevron size={18} className="text-slate-400" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {filtered.length > limit && (
        <Button variant="secondary" block onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          Afficher plus de commandes ({formatInt(filtered.length - limit)} restantes)
        </Button>
      )}
    </div>
  );
}

export function OrderDetailPage() {
  const { db, shop } = useReady();
  const { id = '' } = useParams();
  const toast = useToast();
  const order = useLiveQuery(() => db.orders.get(id), [db, id], undefined);
  const items = useLiveQuery(() => db.order_items.where('order_id').equals(id).toArray(), [db, id], [] as OrderItem[]);
  const ops = useLiveQuery(() => db.sync_operations.where('entity_id').equals(id).toArray(), [db, id], []);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { busy, run } = useAsyncAction();

  if (order === undefined) return <Spinner />;
  if (order === null) {
    return (
      <Banner tone="danger" title="Commande introuvable">
        <Link to="/historique" className="font-semibold underline">Retour à l’historique</Link>
      </Banner>
    );
  }

  const consistent = checkOrderConsistency(order, items ?? []);
  const revenue = order.total_amount;
  const cost = order.total_cost;
  const margin = order.gross_margin;
  const latestOp = [...(ops ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).at(-1);

  async function confirmCancel() {
    const finalReason = reason === 'Autre' ? otherReason.trim() : reason;
    const err = validateReason(finalReason);
    if (err) {
      setCancelError(err);
      return;
    }
    setCancelError(null);
    await run(async () => {
      await cancelOrder(db, id, finalReason);
      toast.show('Commande annulée. Le stock a été restauré.', 'success');
      setCancelOpen(false);
    }, setCancelError);
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/historique" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
        <IconBack size={18} /> Historique
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          {order.delivery_status && <DeliveryStatusBadge status={order.delivery_status} />}
          <PaymentStatusBadge status={order.payment_status} />
          <SyncBadge status={order.sync_status} />
        </div>
        <h1 className="sf-ink text-2xl font-extrabold tracking-tight">
          {order.customer_name ? order.customer_name : `Commande ${orderRef(order.id)}`}
        </h1>
        <p className="sf-muted text-sm">
          {formatDateTime(order.created_at)} · {PAYMENT_LABELS[order.payment_method]} · réf. {orderRef(order.id)}
        </p>
        {(order.customer_phone || order.delivery_address || order.delivery_date) && (
          <div className="sf-card mt-1 flex flex-col gap-1.5 p-4 text-sm">
            {order.customer_phone && <p className="sf-muted">Téléphone : <span className="sf-ink font-semibold">{order.customer_phone}</span></p>}
            {order.delivery_address && <p className="sf-muted">Adresse : <span className="sf-ink font-semibold">{order.delivery_address}</span></p>}
            {order.delivery_date && <p className="sf-muted">Livraison prévue : <span className="sf-ink font-semibold">{order.delivery_date.split('-').reverse().join('/')}</span></p>}
          </div>
        )}
        {order.status === 'cancelled' && (
          <Banner tone="danger" title="Commande annulée">
            {order.cancelled_at && <p>Le {formatDateTime(order.cancelled_at)}.</p>}
            {order.cancel_reason && <p>Motif : {order.cancel_reason}</p>}
            <p className="mt-1">Cette commande reste dans l’historique. Le stock des articles a été restauré.</p>
          </Banner>
        )}
      </header>

      {!consistent && (
        <Banner tone="danger" title="Contrôle de cohérence échoué">
          Les totaux de cette commande ne correspondent pas à ses lignes. Ne modifiez rien et signalez-le à votre assistance.
        </Banner>
      )}

      <Card as="section" className="flex flex-col gap-1 p-0">
        <h2 className="sf-muted px-4 pt-4 text-sm font-bold uppercase tracking-[0.14em]">Articles</h2>
        <ul className="sf-divider divide-y px-4">
          {(items ?? []).map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="sf-ink font-semibold">{it.product_name}</p>
                <p className="sf-muted text-sm">
                  {formatInt(it.quantity)} × {formatFC(it.unit_price)}
                </p>
              </div>
              <p className="sf-ink shrink-0 font-bold tabular-nums">{formatFC(multiplyAmount(it.unit_price, it.quantity))}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 border-t px-4 py-4 text-sm" style={{ borderColor: 'var(--sf-line)', background: 'var(--sf-surface-2)' }}>
          <div className="flex justify-between text-base">
            <span className="sf-ink font-semibold">Total</span>
            <span className="sf-ink font-extrabold tabular-nums">{formatFC(revenue)}</span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>Coût d’achat des articles</span>
            <span className="tabular-nums">{formatFC(cost)}</span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>Marge brute estimée</span>
            <span className="font-semibold tabular-nums text-mint-700 dark:text-mint-500">
              {formatFC(margin)} ({marginRate(revenue, margin)} %)
            </span>
          </div>
          <p className="sf-faint pt-1 text-xs">
            Marge brute = total − coût d’achat. Ce n’est pas le bénéfice net.
          </p>
        </div>
      </Card>

      <Card as="section" className="flex flex-col gap-2">
        <h2 className="sf-muted text-sm font-bold uppercase tracking-[0.14em]">Enregistrement</h2>
        <p className="sf-muted text-sm">
          {order.sync_status === 'synced' && 'Cette commande est enregistrée sur le serveur.'}
          {order.sync_status === 'pending' && ('Enregistrée sur cet appareil. Synchronisation en attente.')}
          {order.sync_status === 'failed' && 'L’envoi a échoué. Ouvrez Paramètres > Synchronisation pour voir la raison et choisir quoi faire.'}
          {order.sync_status === 'conflict' && 'Un conflit doit être résolu dans Paramètres > Synchronisation.'}
          {order.sync_status === 'void' && 'Cette commande n’a pas été envoyée au serveur.'}
        </p>
        {latestOp?.last_error && order.sync_status !== 'synced' && <p className="text-sm text-rose-700">{latestOp.last_error}</p>}
        <p className="sf-faint text-xs">Dernière mise à jour : {formatDateTime(order.updated_at)}</p>
      </Card>

      {order.status === 'confirmed' && order.customer_phone && (() => {
        const phoneIntl = normalizePhone(order.customer_phone);
        if (!phoneIntl) return null;
        return (
          <a
            href={whatsappLink(
              phoneIntl,
              orderWhatsAppMessage({
                shopName: shop.name,
                orderId: orderRef(order.id),
                lines: (items ?? []).map((i) => ({ product_name: i.product_name, quantity: i.quantity, line_total: i.line_total })),
                total: order.total_amount,
                deliveryDate: order.delivery_date ? order.delivery_date.split('-').reverse().join('/') : null,
                address: order.delivery_address,
              }),
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-mint-600 px-5 font-semibold text-white shadow-[0_6px_16px_-6px_rgba(34,177,132,0.55)] transition hover:bg-mint-700 active:scale-[0.98]"
          >
            <IconWhatsApp size={20} /> Contacter le client sur WhatsApp
          </a>
        );
      })()}

      {order.status === 'confirmed' && (
        <Button variant="danger" block onClick={() => setCancelOpen(true)} disabled={busy}>
          Annuler cette commande
        </Button>
      )}
      {order.status === 'confirmed' && (
        <p className="sf-faint text-center text-xs">
          Une commande ne se supprime pas. L’annulation la garde dans l’historique et restaure le stock.
        </p>
      )}

      <Sheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Annuler la commande ?"
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="danger" block onClick={() => void confirmCancel()} disabled={busy}>
              {busy ? 'Annulation…' : 'Confirmer l’annulation'}
            </Button>
            <Button variant="secondary" block onClick={() => setCancelOpen(false)} disabled={busy}>
              Retour
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="sf-muted text-sm leading-relaxed">
            Le stock des articles sera restauré. La commande restera visible dans l’historique avec le statut « Annulée ». Cette action est tracée.
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="sf-ink mb-2 text-sm font-semibold">Raison</legend>
            {CANCEL_REASONS.map((r) => (
              <label key={r} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-4 ring-1 ring-inset ${reason === r ? 'bg-brand-50 ring-brand-600 dark:bg-white/10 dark:ring-brand-400' : 'sf-surface ring-slate-300 dark:ring-white/15'}`}>
                <input type="radio" name="cancel-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-5 w-5 accent-brand-600" />
                <span className="sf-ink font-medium">{r}</span>
              </label>
            ))}
          </fieldset>
          {reason === 'Autre' && (
            <Field label="Précisez la raison" required error={cancelError ?? undefined}>
              {(fid, desc) => (
                <TextInput id={fid} aria-describedby={desc} value={otherReason} onChange={(e) => setOtherReason(e.target.value)} maxLength={300} />
              )}
            </Field>
          )}
          {cancelError && reason !== 'Autre' && <Banner tone="danger">{cancelError}</Banner>}
        </div>
      </Sheet>

      {order.status === 'cancelled' && <Badge tone="neutral">Historique conservé</Badge>}
    </div>
  );
}
