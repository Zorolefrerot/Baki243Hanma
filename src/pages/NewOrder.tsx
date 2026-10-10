import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useReady } from '../app/useReady';
import { useApp } from '../app/AppContext';
import { createOrder, BusinessError } from '../db/repo';
import { DEFAULT_CATEGORIES, DELIVERY_STATUS_LABELS, PAYMENT_LABELS, PAYMENT_STATUS_LABELS, type DeliveryStatus, type PaymentMethod, type PaymentStatus, type Product } from '../domain/types';
import { validateDelivery } from '../domain/validation';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Sheet, TextArea, TextInput } from '../components/ui';
import { IconCart, IconClipboard, IconPlus, IconSearch, IconTruck, IconWhatsApp } from '../components/icons';
import { useToast } from '../components/Toast';
import { formatFC, formatInt, multiplyAmount, addAmounts } from '../lib/money';
import { addDays, startOfDay, toDateInput } from '../lib/dates';
import { newId, orderRef } from '../lib/ids';
import { matchesSearch, normalizeText } from '../lib/text';
import { normalizePhone, formatPhone, parseWhatsAppMessage, orderWhatsAppMessage, whatsappLink } from '../lib/whatsapp';
import type { CreatedOrder } from '../db/repo';

interface CartLine {
  product_id: string;
  quantity: number;
}

interface DeliveryDraft {
  enabled: boolean;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_date: string;
  payment_status: PaymentStatus;
  delivery_status: DeliveryStatus;
}

interface Draft {
  id: string;
  lines: CartLine[];
  payment: PaymentMethod | null;
  delivery: DeliveryDraft;
}

const PAYMENTS: PaymentMethod[] = ['cash', 'mobile_money', 'other'];

function emptyDelivery(): DeliveryDraft {
  return {
    enabled: false,
    customer_name: '',
    customer_phone: '',
    delivery_address: '',
    delivery_date: toDateInput(addDays(startOfDay(new Date()), 1)),
    payment_status: 'unpaid',
    delivery_status: 'to_prepare',
  };
}

/** Associe un libellé de message au produit du catalogue le plus proche. */
function matchProduct(label: string, products: Product[]): Product | null {
  const n = normalizeText(label);
  if (!n) return null;
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of products) {
    const pn = normalizeText(p.name);
    let score = 0;
    if (pn === n) score = 100;
    else if (pn.startsWith(n) || n.startsWith(pn)) score = 80;
    else if (pn.includes(n) || n.includes(pn)) score = 60;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore >= 60 ? best : null;
}

export function NewOrderPage() {
  const { db, shop } = useReady();
  const { online, mode } = useApp();
  const toast = useToast();

  const products = useLiveQuery(() => db.products.toArray(), [db], undefined);
  const [draft, setDraft] = useState<Draft>(() => ({ id: newId(), lines: [], payment: null, delivery: emptyDelivery() }));
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState('Toutes');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedOrder | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const savingRef = useRef(false);

  // Restaure le panier en cours (si l'application a été fermée pendant une vente).
  useEffect(() => {
    let cancelled = false;
    void db.meta.get('draftOrder').then((row) => {
      if (cancelled) return;
      const saved = row?.value as Draft | undefined;
      if (saved && Array.isArray(saved.lines) && saved.lines.length > 0) {
        setDraft({ ...saved, delivery: { ...emptyDelivery(), ...(saved.delivery ?? {}), enabled: saved.delivery?.enabled ?? false } });
        toast.show('Panier restauré après la fermeture de l’application.', 'info');
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  // Sauvegarde immédiate du brouillon à chaque changement.
  useEffect(() => {
    if (!hydrated || result) return;
    if (draft.lines.length === 0 && draft.payment === null && !draft.delivery.enabled) {
      void db.meta.delete('draftOrder');
    } else {
      void db.meta.put({ key: 'draftOrder', value: draft });
    }
  }, [db, draft, hydrated, result]);

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  const lines = useMemo(
    () =>
      draft.lines
        .map((l) => ({ line: l, product: byId.get(l.product_id) }))
        .filter((x): x is { line: CartLine; product: Product } => Boolean(x.product)),
    [draft.lines, byId],
  );

  const total = useMemo(() => addAmounts(0, ...lines.map(({ line, product }) => multiplyAmount(product.sale_price, line.quantity))), [lines]);
  const itemCount = lines.reduce((s, { line }) => s + line.quantity, 0);

  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    for (const p of products ?? []) if (p.category) set.add(p.category);
    return ['Toutes', ...[...set].sort((a, b) => a.localeCompare(b, 'fr'))];
  }, [products]);

  const catalogue = useMemo(
    () =>
      (products ?? [])
        .filter((p) => p.status === 'active')
        .filter((p) => category === 'Toutes' || p.category === category)
        .filter((p) => matchesSearch(p.name, deferredQuery))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [products, category, deferredQuery],
  );

  function setLineQuantity(productId: string, quantity: number) {
    const product = byId.get(productId);
    if (!product) return;
    setError(null);
    if (quantity <= 0) {
      setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.product_id !== productId) }));
      return;
    }
    if (quantity > product.quantity) {
      setError(`Stock insuffisant pour « ${product.name} » : ${formatInt(product.quantity)} disponible(s).`);
      setDraft((d) => ({
        ...d,
        lines: d.lines.map((l) => (l.product_id === productId ? { ...l, quantity: product.quantity } : l)),
      }));
      return;
    }
    setDraft((d) => {
      const exists = d.lines.some((l) => l.product_id === productId);
      return {
        ...d,
        lines: exists
          ? d.lines.map((l) => (l.product_id === productId ? { ...l, quantity } : l))
          : [...d.lines, { product_id: productId, quantity }],
      };
    });
  }

  function addOne(product: Product) {
    if (product.quantity <= 0) {
      setError(`« ${product.name} » est en rupture de stock.`);
      return;
    }
    const current = draft.lines.find((l) => l.product_id === product.id)?.quantity ?? 0;
    setLineQuantity(product.id, current + 1);
  }

  function applyDeliveryPatch(patch: Partial<DeliveryDraft>) {
    setDraft((d) => ({ ...d, delivery: { ...d.delivery, ...patch } }));
  }

  async function confirmOrder() {
    if (savingRef.current) return; // Protection contre la double validation.
    if (!draft.payment) {
      setError('Choisissez le mode de paiement.');
      return;
    }
    const d = draft.delivery;
    if (d.enabled) {
      const deliveryErrors = validateDelivery({
        customer_name: d.customer_name,
        customer_phone: d.customer_phone,
        delivery_address: d.delivery_address,
        delivery_date: d.delivery_date,
        payment_status: d.payment_status,
        delivery_status: d.delivery_status,
      });
      const firstError = Object.values(deliveryErrors)[0];
      if (firstError) {
        setError(firstError);
        setReviewOpen(false);
        return;
      }
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const created = await createOrder(db, shop.id, {
        id: draft.id,
        lines: lines.map(({ line }) => ({ product_id: line.product_id, quantity: line.quantity })),
        payment_method: draft.payment,
        customer: d.enabled
          ? {
              customer_name: d.customer_name.trim(),
              customer_phone: normalizePhone(d.customer_phone) ?? d.customer_phone.trim(),
              delivery_address: d.delivery_address.trim(),
              delivery_date: d.delivery_date,
              payment_status: d.payment_status,
              delivery_status: d.delivery_status,
            }
          : { payment_status: 'paid' },
      });
      await db.meta.delete('draftOrder');
      setResult(created);
      setReviewOpen(false);
      toast.show('Commande enregistrée.', 'success');
    } catch (e) {
      const msg = e instanceof BusinessError ? e.message : 'La commande n’a pas pu être enregistrée. Rien n’a été modifié. Réessayez.';
      setError(msg);
      setReviewOpen(false);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function startNew() {
    setResult(null);
    setDraft({ id: newId(), lines: [], payment: null, delivery: emptyDelivery() });
    setError(null);
  }

  if (products === undefined || !hydrated) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Nouvelle commande" />
        <div className="sf-skeleton h-24 w-full" />
        <div className="sf-skeleton h-64 w-full" />
      </div>
    );
  }

  if (result) {
    const o = result.order;
    const phoneIntl = o.customer_phone ? normalizePhone(o.customer_phone) : null;
    const waMessage = orderWhatsAppMessage({
      shopName: shop.name,
      orderId: orderRef(o.id),
      lines: result.items.map((i) => ({ product_name: i.product_name, quantity: i.quantity, line_total: i.line_total })),
      total: o.total_amount,
      deliveryDate: o.delivery_date,
      address: o.delivery_address,
    });
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Commande enregistrée" />
        <Card className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="sf-pop flex h-16 w-16 items-center justify-center rounded-full bg-mint-100 text-mint-700 dark:bg-mint-500/15 dark:text-mint-500" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path className="sf-check" d="M4.5 12.5 9.5 17.5 19.5 7" />
            </svg>
          </div>
          <div>
            <p className="sf-ink text-lg font-bold">{o.customer_name ? o.customer_name : `Commande ${orderRef(o.id)}`}</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-brand-700 dark:text-brand-300">{formatFC(o.total_amount)}</p>
            <p className="sf-muted mt-1 text-sm">
              {PAYMENT_LABELS[o.payment_method]} · {formatInt(o.total_quantity)} article(s)
              {o.delivery_date ? ` · livraison ${o.delivery_date.split('-').reverse().join('/')}` : ''}
            </p>
          </div>
          <p className="sf-muted max-w-sm text-sm leading-relaxed">
            {mode === 'remote'
              ? online
                ? 'La commande est enregistrée et le stock a été mis à jour.'
                : 'La commande est conservée sur cet appareil et sera envoyée dès le retour d’Internet.'
              : 'La commande est enregistrée et le stock a été mis à jour.'}
          </p>
          <div className="flex w-full max-w-sm flex-col gap-2">
            <Button block onClick={startNew}>
              <IconPlus size={18} /> Commande suivante
            </Button>
            {o.delivery_status && phoneIntl && (
              <a
                href={whatsappLink(phoneIntl, waMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-mint-600 px-5 font-semibold text-white transition hover:bg-mint-700 active:scale-[0.98]"
              >
                <IconWhatsApp size={20} /> Prévenir le client sur WhatsApp
              </a>
            )}
            {o.delivery_status && (
              <Link to="/livraisons" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition hover:bg-brand-50 dark:text-brand-300 dark:ring-white/15 dark:hover:bg-white/5">
                <IconTruck size={18} /> Voir la livraison
              </Link>
            )}
            <Link to={`/historique/${o.id}`} className="sf-muted inline-flex min-h-12 items-center justify-center rounded-xl font-semibold ring-1 ring-inset ring-slate-300 transition hover:opacity-80 dark:ring-white/15">
              Voir la commande
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      <PageHeader title="Nouvelle commande" subtitle="Ajoutez les articles, vérifiez le total, puis validez." />

      {error && <Banner tone="danger">{error}</Banner>}

      {(products ?? []).filter((p) => p.status === 'active').length === 0 ? (
        <EmptyState
          title="Aucun article à vendre"
          action={
            <Link to="/articles/nouveau" className="inline-flex min-h-12 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white">
              Créer un article
            </Link>
          }
        >
          Une commande se compose d’articles existants. Créez d’abord vos produits avec leur prix et leur stock.
        </EmptyState>
      ) : (
        <>
          <Card className="flex flex-col gap-4" as="section">
            <div className="flex items-center justify-between gap-2">
              <h2 className="sf-ink flex items-center gap-2 text-base font-bold">
                <IconCart size={20} className="text-brand-700 dark:text-brand-300" /> Panier
              </h2>
              {lines.length > 0 && <Badge tone="brand">{formatInt(itemCount)} article(s)</Badge>}
            </div>

            {lines.length === 0 ? (
              <p className="sf-muted rounded-xl p-4 text-sm" style={{ background: 'var(--sf-surface-2)' }}>
                Le panier est vide. Touchez un article ci-dessous pour l’ajouter.
              </p>
            ) : (
              <ul className="sf-divider divide-y">
                {lines.map(({ line, product }) => (
                  <li key={line.product_id} className="flex flex-col gap-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="sf-ink truncate font-semibold">{product.name}</p>
                        <p className="sf-muted text-sm">{formatFC(product.sale_price)} l’unité</p>
                      </div>
                      <p className="sf-ink shrink-0 font-bold tabular-nums">{formatFC(multiplyAmount(product.sale_price, line.quantity))}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Stepper value={line.quantity} max={product.quantity} label={product.name} onChange={(q) => setLineQuantity(product.id, q)} />
                      <button type="button" onClick={() => setLineQuantity(product.id, 0)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-coral-700 transition hover:bg-coral-100/50 dark:text-coral-500 dark:hover:bg-coral-500/10">
                        Retirer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--sf-line)' }}>
              <span className="sf-ink text-base font-semibold">Total</span>
              <span className="sf-ink text-2xl font-extrabold tabular-nums" aria-live="polite">{formatFC(total)}</span>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="sf-ink mb-1 text-sm font-semibold">
                Mode de paiement <span className="text-coral-600">*</span>
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={draft.payment === p}
                    onClick={() => setDraft((d) => ({ ...d, payment: p }))}
                    className={`min-h-12 rounded-xl px-2 text-sm font-semibold ring-1 ring-inset transition ${
                      draft.payment === p
                        ? 'bg-brand-600 text-white ring-brand-600 shadow-[0_6px_16px_-6px_rgba(11,104,120,0.55)]'
                        : 'sf-surface sf-ink ring-slate-300 hover:opacity-90 dark:ring-white/15'
                    }`}
                  >
                    {PAYMENT_LABELS[p]}
                  </button>
                ))}
              </div>
              {!draft.payment && lines.length > 0 && <p className="sf-muted text-sm">Choisissez le mode de paiement pour pouvoir valider.</p>}
            </fieldset>

            {/* Livraison (commandes WhatsApp). */}
            <div className="rounded-2xl border p-3.5" style={{ borderColor: 'var(--sf-line)', background: 'var(--sf-surface-2)' }}>
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-white/10 dark:text-brand-300">
                    <IconTruck size={19} />
                  </span>
                  <span>
                    <span className="sf-ink block text-sm font-semibold">Commande à livrer</span>
                    <span className="sf-faint block text-xs">Client, adresse et date prévue</span>
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.delivery.enabled}
                  onClick={() => applyDeliveryPatch({ enabled: !draft.delivery.enabled })}
                  className={`relative h-7 w-12 rounded-full transition-colors ${draft.delivery.enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/20'}`}
                >
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${draft.delivery.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </label>

              {draft.delivery.enabled && (
                <div className="sf-fade-in mt-3 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setImportOpen(true)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/70 px-4 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition hover:bg-white dark:bg-white/5 dark:text-brand-300 dark:ring-white/15"
                  >
                    <IconClipboard size={17} /> Coller un message WhatsApp
                  </button>
                  <TextInput
                    placeholder="Nom du client *"
                    value={draft.delivery.customer_name}
                    onChange={(e) => applyDeliveryPatch({ customer_name: e.target.value })}
                  />
                  <TextInput
                    placeholder="Numéro WhatsApp (ex. 081 234 56 78)"
                    inputMode="tel"
                    value={draft.delivery.customer_phone}
                    onChange={(e) => applyDeliveryPatch({ customer_phone: e.target.value })}
                  />
                  <TextInput
                    placeholder="Adresse de livraison"
                    value={draft.delivery.delivery_address}
                    onChange={(e) => applyDeliveryPatch({ delivery_address: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Date prévue
                      <input
                        type="date"
                        value={draft.delivery.delivery_date}
                        onChange={(e) => applyDeliveryPatch({ delivery_date: e.target.value })}
                        className="sf-input"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Paiement
                      <select
                        value={draft.delivery.payment_status}
                        onChange={(e) => applyDeliveryPatch({ payment_status: e.target.value as PaymentStatus })}
                        className="sf-input appearance-none"
                      >
                        <option value="unpaid">{PAYMENT_STATUS_LABELS.unpaid}</option>
                        <option value="paid">{PAYMENT_STATUS_LABELS.paid}</option>
                      </select>
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    État de la livraison
                    <select
                      value={draft.delivery.delivery_status}
                      onChange={(e) => applyDeliveryPatch({ delivery_status: e.target.value as DeliveryStatus })}
                      className="sf-input appearance-none"
                    >
                      <option value="to_prepare">{DELIVERY_STATUS_LABELS.to_prepare}</option>
                      <option value="ready">{DELIVERY_STATUS_LABELS.ready}</option>
                    </select>
                  </label>
                </div>
              )}
            </div>

            <Button block disabled={lines.length === 0 || !draft.payment || saving} onClick={() => setReviewOpen(true)}>
              Vérifier et valider la commande
            </Button>
          </Card>

          <section aria-labelledby="catalogue-title" className="flex flex-col gap-3">
            <h2 id="catalogue-title" className="sf-muted text-sm font-bold uppercase tracking-[0.14em]">Articles à vendre</h2>
            <label className="relative block">
              <span className="sr-only">Rechercher un article</span>
              <IconSearch size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un article…"
                className="sf-input pl-12"
              />
            </label>
            <div role="group" aria-label="Filtrer par catégorie" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                    category === c ? 'bg-brand-600 text-white' : 'sf-surface sf-ink ring-1 ring-inset ring-slate-300 dark:ring-white/15'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {catalogue.length === 0 && <p className="sf-muted py-4 text-center text-sm">Aucun article ne correspond à votre recherche.</p>}

            <ul className="flex flex-col gap-2">
              {catalogue.map((p) => {
                const inCart = draft.lines.find((l) => l.product_id === p.id)?.quantity ?? 0;
                const out = p.quantity <= 0;
                return (
                  <li key={p.id} className={`sf-card sf-pop flex items-center justify-between gap-3 p-3 ${out ? 'opacity-60' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="sf-ink truncate font-semibold">{p.name}</p>
                      <p className="sf-muted text-sm">
                        <span className="font-semibold tabular-nums">{formatFC(p.sale_price)}</span> ·{' '}
                        <span className={out ? 'font-semibold text-coral-700 dark:text-coral-500' : ''}>{out ? 'Rupture' : `${formatInt(p.quantity)} en stock`}</span>
                      </p>
                    </div>
                    {inCart > 0 ? (
                      <Stepper value={inCart} max={p.quantity} label={p.name} onChange={(q) => setLineQuantity(p.id, q)} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => addOne(p)}
                        disabled={out}
                        aria-label={`Ajouter ${p.name} au panier`}
                        className="inline-flex min-h-12 min-w-24 items-center justify-center gap-1 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(11,104,120,0.55)] transition active:scale-95 disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-700"
                      >
                        <IconPlus size={18} /> Ajouter
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <Sheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Récapitulatif"
        footer={
          <div className="flex flex-col gap-2">
            <Button block onClick={() => void confirmOrder()} disabled={saving}>
              {saving ? 'Enregistrement…' : `Confirmer · ${formatFC(total)}`}
            </Button>
            <Button variant="secondary" block onClick={() => setReviewOpen(false)} disabled={saving}>
              Modifier la commande
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <ul className="sf-divider divide-y">
            {lines.map(({ line, product }) => (
              <li key={line.product_id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="sf-ink truncate font-semibold">{product.name}</p>
                  <p className="sf-muted text-sm">
                    {formatInt(line.quantity)} × {formatFC(product.sale_price)}
                  </p>
                </div>
                <p className="sf-ink font-bold tabular-nums">{formatFC(multiplyAmount(product.sale_price, line.quantity))}</p>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between rounded-xl bg-brand-50 p-4 dark:bg-white/5">
            <span className="font-semibold text-brand-800 dark:text-brand-300">Total</span>
            <span className="text-xl font-extrabold tabular-nums text-brand-800 dark:text-brand-300">{formatFC(total)}</span>
          </div>
          <p className="sf-muted text-sm">
            Paiement : <span className="sf-ink font-semibold">{draft.payment ? PAYMENT_LABELS[draft.payment] : '—'}</span>
            {draft.delivery.enabled && draft.delivery.payment_status === 'unpaid' && ' · à encaisser'}
          </p>
          {draft.delivery.enabled && (
            <div className="rounded-xl bg-brand-50 p-4 text-sm dark:bg-white/5">
              <p className="flex items-center gap-2 font-semibold text-brand-800 dark:text-brand-300">
                <IconTruck size={17} /> Livraison
              </p>
              <p className="sf-muted mt-1 leading-relaxed">
                {draft.delivery.customer_name.trim() || '—'}
                {draft.delivery.customer_phone.trim() ? ` · ${draft.delivery.customer_phone.trim()}` : ''}
                {draft.delivery.delivery_address.trim() ? <><br />{draft.delivery.delivery_address.trim()}</> : null}
                <br />Prévue le {draft.delivery.delivery_date.split('-').reverse().join('/')}
              </p>
            </div>
          )}
          <p className="sf-faint text-xs leading-relaxed">
            En confirmant, la vente est enregistrée et le stock est diminué. Une commande confirmée ne se supprime pas : elle peut seulement être annulée, avec restauration du stock.
          </p>
        </div>
      </Sheet>

      <ImportWhatsAppSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        products={(products ?? []).filter((p) => p.status === 'active')}
        onApply={(values, matchedLines) => {
          applyDeliveryPatch({ enabled: true, ...values });
          setDraft((d) => {
            const next = [...d.lines];
            for (const m of matchedLines) {
              const existing = next.find((l) => l.product_id === m.product_id);
              if (existing) existing.quantity = Math.min(existing.quantity + m.quantity, byId.get(m.product_id)?.quantity ?? m.quantity);
              else next.push(m);
            }
            return { ...d, lines: next };
          });
          setImportOpen(false);
          toast.show('Informations importées. Vérifiez-les avant de valider.', 'info');
        }}
      />
    </div>
  );
}

/** Analyse un message WhatsApp collé et propose les informations reconnues. */
function ImportWhatsAppSheet({
  open,
  onClose,
  products,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onApply: (
    values: { customer_name: string; customer_phone: string; delivery_address: string },
    matchedLines: CartLine[],
  ) => void;
}) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseWhatsAppMessage> | null>(null);

  function analyze() {
    setParsed(parseWhatsAppMessage(text));
  }

  const matched = useMemo(() => {
    if (!parsed) return [];
    return parsed.lines
      .map((l) => {
        const product = matchProduct(l.label, products);
        return product ? { product, quantity: Math.min(l.quantity, Math.max(product.quantity, 1)) } : null;
      })
      .filter((x): x is { product: Product; quantity: number } => Boolean(x));
  }, [parsed, products]);

  const unmatched = useMemo(() => (parsed ? parsed.lines.filter((l) => !matchProduct(l.label, products)) : []), [parsed, products]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Importer un message WhatsApp"
      footer={
        parsed ? (
          <div className="flex flex-col gap-2">
            <Button block disabled={parsed.name === null && parsed.phones.length === 0 && matched.length === 0} onClick={() =>
              onApply(
                {
                  customer_name: parsed!.name ?? '',
                  customer_phone: parsed!.phones[0] ? formatPhone(parsed!.phones[0]) : '',
                  delivery_address: parsed!.address ?? '',
                },
                matched.map((m) => ({ product_id: m.product.id, quantity: m.quantity })),
              )
            }>
              Utiliser ces informations
            </Button>
            <Button variant="secondary" block onClick={() => setParsed(null)}>
              Modifier le texte
            </Button>
          </div>
        ) : (
          <Button block disabled={text.trim().length < 5} onClick={analyze}>
            Analyser le message
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p className="sf-muted text-sm leading-relaxed">
          Collez le message de votre client. L’application propose les informations qu’elle reconnaît :
          vous pourrez tout vérifier et corriger avant d’enregistrer la commande.
        </p>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Ex. : Bonjour, c’est Marie 081 234 56 78\n2 x Brume coco\n1 Parfum Vanille\nLivraison demain, 12 av. Lemba\nTotal 25000'}
        />
        {parsed && (
          <div className="flex flex-col gap-2">
            <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--sf-surface-2)' }}>
              <p className="sf-ink font-semibold">Informations reconnues</p>
              <p className="sf-muted mt-1 leading-relaxed">
                Client : <span className="sf-ink font-medium">{parsed.name ?? 'non reconnu'}</span>
                <br />
                Téléphone : <span className="sf-ink font-medium">{parsed.phones[0] ? formatPhone(parsed.phones[0]) : 'non reconnu'}</span>
                <br />
                Adresse : <span className="sf-ink font-medium">{parsed.address ?? 'non reconnue'}</span>
                {parsed.totalAmount !== null && (
                  <>
                    <br />
                    Montant cité : <span className="sf-ink font-medium">{formatFC(parsed.totalAmount)}</span>
                  </>
                )}
              </p>
            </div>
            {matched.length > 0 && (
              <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--sf-surface-2)' }}>
                <p className="sf-ink font-semibold">Articles trouvés dans votre catalogue</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {matched.map((m) => (
                    <li key={m.product.id} className="sf-muted flex items-center justify-between gap-2">
                      <span>{m.quantity} × {m.product.name}</span>
                      <Badge tone="success">Ajouté</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {unmatched.length > 0 && (
              <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--sf-surface-2)' }}>
                <p className="sf-ink font-semibold">À vérifier (non trouvés dans le catalogue)</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {unmatched.map((l, i) => (
                    <li key={i} className="sf-muted">
                      {l.quantity} × {l.label}
                    </li>
                  ))}
                </ul>
                <p className="sf-faint mt-2 text-xs">Ajoutez-les manuellement au panier si nécessaire.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Stepper({ value, max, label, onChange }: { value: number; max: number; label: string; onChange: (q: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="inline-flex items-center rounded-xl p-1" style={{ background: 'var(--sf-surface-2)' }} role="group" aria-label={`Quantité de ${label}`}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label="Diminuer" className="sf-surface sf-ink flex h-12 w-12 items-center justify-center rounded-lg text-2xl font-bold shadow-sm transition active:scale-95">
        −
      </button>
      <input
        inputMode="numeric"
        aria-label={`Quantité pour ${label}`}
        value={text ?? String(value)}
        onFocus={(e) => {
          setText(String(value));
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
        onBlur={() => {
          if (text !== null) {
            const n = Number(text === '' ? 0 : text);
            setText(null);
            if (n !== value) onChange(n);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        }}
        className="sf-ink h-12 w-14 bg-transparent text-center text-lg font-bold tabular-nums focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Augmenter"
        className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-2xl font-bold text-white shadow-sm transition active:scale-95 disabled:bg-slate-300 dark:disabled:bg-slate-700"
      >
        +
      </button>
    </div>
  );
}
