import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useReady } from '../app/useReady';
import { loadDashboard } from '../db/queries';
import { computePeriod, formatDateTime, type PeriodKind } from '../lib/dates';
import { formatFC, formatInt } from '../lib/money';
import { Badge, Card, EmptyState, PageHeader, SkeletonRows, Stat } from '../components/ui';
import { IconAlert, IconCart, IconTruck, IconTrend, IconWallet, IconBox } from '../components/icons';
import { OrderStatusBadge } from '../components/status';
import { PeriodFilter, defaultCustomRange, type CustomRange } from '../components/PeriodFilter';
import { orderRef } from '../lib/ids';

export function DashboardPage() {
  const { db, shop } = useReady();
  const [kind, setKind] = useState<PeriodKind>('today');
  const [custom, setCustom] = useState<CustomRange>(() => defaultCustomRange());

  const period = useMemo(() => computePeriod(kind, new Date(), custom), [kind, custom]);

  const data = useLiveQuery(() => loadDashboard(db, period), [db, period.kind, period.start, period.end], undefined);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`Bonjour${shop.name ? '' : ''}`} subtitle={<>Boutique <span className="sf-ink font-semibold">{shop.name}</span> · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</>} />

      {!data && <SkeletonRows rows={4} />}

      {data && (
        <>
          {/* Aujourd'hui : l'essentiel, immédiatement. */}
          <section aria-labelledby="today-title" className="relative overflow-hidden rounded-3xl p-5 text-white shadow-[0_16px_40px_-16px_rgba(11,104,120,0.55)]" style={{ background: 'linear-gradient(135deg, #0b2239 0%, #0b4450 55%, #0b6878 100%)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="today-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-mint-500">Aujourd’hui</p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight sm:text-4xl">{formatFC(data.today.revenue)}</p>
                <p className="mt-1 text-sm text-white/80">Chiffre d’affaires du jour</p>
              </div>
              <Link to="/commande" className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white/15 px-4 text-sm font-bold text-white ring-1 ring-white/25 transition hover:bg-white/25 active:scale-95">
                <IconCart size={18} /> Vendre
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/15 pt-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/70">Marge brute</p>
                <p className="mt-0.5 font-bold tabular-nums text-mint-500">{formatFC(data.today.grossMargin)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/70">Commandes</p>
                <p className="mt-0.5 font-bold tabular-nums">{formatInt(data.today.orderCount)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/70">Taux de marge</p>
                <p className="mt-0.5 font-bold tabular-nums">{data.today.marginPercent} %</p>
              </div>
            </div>
          </section>

          {/* Suivi du jour : préparations, livraisons, encaissements. */}
          {(data.toPrepareCount > 0 || data.deliveriesToday.length > 0 || data.deliveriesTomorrow.length > 0 || data.unpaidCount > 0) && (
            <section aria-label="À traiter aujourd’hui" className="flex flex-col gap-2">
              {data.toPrepareCount > 0 && (
                <Link to="/livraisons" className="sf-card sf-pop flex items-center justify-between gap-3 p-4">
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><IconBox size={20} /></span>
                    <span>
                      <span className="sf-ink block font-semibold">{data.toPrepareCount} commande(s) à préparer</span>
                      <span className="sf-faint block text-xs">Préparez les colis pour la livraison</span>
                    </span>
                  </span>
                  <Badge tone="warning">Voir</Badge>
                </Link>
              )}
              {data.deliveriesToday.length > 0 && (
                <Link to="/livraisons" className="sf-card sf-pop flex items-center justify-between gap-3 p-4">
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-white/10 dark:text-brand-300"><IconTruck size={20} /></span>
                    <span>
                      <span className="sf-ink block font-semibold">{data.deliveriesToday.length} livraison(s) aujourd’hui</span>
                      <span className="sf-faint block text-xs">Clients à contacter et colis à remettre</span>
                    </span>
                  </span>
                  <Badge tone="brand">Voir</Badge>
                </Link>
              )}
              {data.deliveriesTomorrow.length > 0 && (
                <Link to="/livraisons" className="sf-card sf-pop flex items-center justify-between gap-3 p-4">
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"><IconTruck size={20} /></span>
                    <span>
                      <span className="sf-ink block font-semibold">{data.deliveriesTomorrow.length} livraison(s) demain</span>
                      <span className="sf-faint block text-xs">À préparer dès ce soir</span>
                    </span>
                  </span>
                  <Badge tone="info">Voir</Badge>
                </Link>
              )}
              {data.unpaidCount > 0 && (
                <Link to="/historique" className="sf-card sf-pop flex items-center justify-between gap-3 p-4">
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral-100 text-coral-700 dark:bg-coral-500/15 dark:text-coral-500"><IconWallet size={20} /></span>
                    <span>
                      <span className="sf-ink block font-semibold">{data.unpaidCount} commande(s) à encaisser</span>
                      <span className="sf-faint block text-xs">Paiements en attente de la part des clients</span>
                    </span>
                  </span>
                  <Badge tone="danger">Voir</Badge>
                </Link>
              )}
            </section>
          )}

          <PeriodFilter value={kind} onChange={setKind} custom={custom} onCustomChange={setCustom} />

          <section aria-labelledby="kpi-title" className="flex flex-col gap-3">
            <h2 id="kpi-title" className="sf-muted text-sm font-bold uppercase tracking-[0.14em]">{period.label}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Chiffre d’affaires" value={formatFC(data.revenue)} tone="brand" icon={<IconTrend size={17} />} hint="Ventes confirmées (hors annulées)." />
              <Stat label="Marge brute estimée" value={formatFC(data.grossMargin)} tone="success" icon={<IconWallet size={17} />} hint={`${data.marginPercent} % du chiffre d’affaires.`} />
              <Stat label="Commandes" value={formatInt(data.orderCount)} hint={data.orderCount === 0 ? 'Aucune vente sur cette période.' : undefined} />
              <Stat label="Articles vendus" value={formatInt(data.quantitySold)} />
            </div>
            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
              <p className="text-[13px] leading-relaxed text-amber-950 dark:text-amber-100">
                <span className="font-semibold">Marge brute estimée</span> = chiffre d’affaires − coût d’achat des articles vendus.
                Elle ne tient pas compte du loyer, du transport ni des salaires : <span className="font-semibold">ce n’est pas le bénéfice net.</span>
              </p>
            </div>
          </section>

          <section aria-labelledby="stock-title" className="flex flex-col gap-3">
            <h2 id="stock-title" className="sf-muted text-sm font-bold uppercase tracking-[0.14em]">Stock</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Valeur du stock" value={formatFC(data.stockValue)} hint="Quantités × prix d’achat." />
              <Stat label="Articles en stock" value={formatInt(data.productsInStock)} hint={`${formatInt(data.lowStock.length)} en stock faible`} tone={data.lowStock.length > 0 ? 'warning' : 'default'} />
            </div>

            {!data.hasAnyProduct ? (
              <EmptyState
                title="Aucun article pour l’instant"
                action={
                  <Link to="/articles/nouveau" className="inline-flex min-h-12 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white">
                    Créer mon premier article
                  </Link>
                }
              >
                Ajoutez vos produits une seule fois : prix, stock et seuil d’alerte. Vous pourrez ensuite enregistrer des commandes.
              </EmptyState>
            ) : data.lowStock.length > 0 ? (
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <IconAlert size={18} className="text-amber-600" />
                  <h3 className="sf-ink font-semibold">Stock faible</h3>
                </div>
                <ul className="sf-divider divide-y">
                  {data.lowStock.slice(0, 8).map((p) => (
                    <li key={p.id}>
                      <Link to={`/articles/${p.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2">
                        <span className="sf-ink min-w-0 truncate font-medium">{p.name}</span>
                        <Badge tone={p.quantity <= 0 ? 'danger' : 'warning'}>
                          {p.quantity <= 0 ? 'Rupture' : `Reste ${formatInt(p.quantity)}`}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="sf-muted text-sm">Aucun article en stock faible.</p>
            )}
          </section>

          <section aria-labelledby="series-title" className="flex flex-col gap-3">
            <h2 id="series-title" className="sf-muted text-sm font-bold uppercase tracking-[0.14em]">Évolution des ventes</h2>
            <Card>
              {data.series.length === 0 ? (
                <p className="sf-muted py-6 text-center text-sm">Aucune vente enregistrée sur cette période.</p>
              ) : (
                <SalesChart series={data.series} granularity={data.seriesGranularity} />
              )}
            </Card>
          </section>

          <section aria-labelledby="recent-title" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="recent-title" className="sf-muted text-sm font-bold uppercase tracking-[0.14em]">Dernières commandes</h2>
              <Link to="/historique" className="text-sm font-semibold text-brand-700 dark:text-brand-300">Tout voir</Link>
            </div>
            {data.recentOrders.length === 0 ? (
              <EmptyState title="Aucune commande">Vos commandes apparaîtront ici dès la première vente.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link to={`/historique/${o.id}`} className="sf-card sf-pop flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="sf-ink truncate font-semibold">
                          {o.customer_name ? o.customer_name : `Commande ${orderRef(o.id)}`}
                        </p>
                        <p className="sf-faint text-xs">{formatDateTime(o.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="sf-ink font-bold tabular-nums">{formatFC(o.total_amount)}</span>
                        <OrderStatusBadge status={o.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SalesChart({
  series,
  granularity,
}: {
  series: { key: string; label: string; revenue: number; orders: number }[];
  granularity: 'hour' | 'day' | 'month';
}) {
  const max = Math.max(...series.map((s) => s.revenue), 1);
  const total = series.reduce((sum, s) => sum + s.revenue, 0);
  const unit = granularity === 'hour' ? 'par heure' : granularity === 'day' ? 'par jour' : 'par mois';
  return (
    <div className="flex flex-col gap-3">
      <p className="sf-muted text-sm">
        Chiffre d’affaires {unit}. Total : <span className="sf-ink font-semibold">{formatFC(total)}</span>
      </p>
      <div role="img" aria-label={`Graphique des ventes ${unit} : ${series.map((s) => `${s.label} ${formatFC(s.revenue)}`).join(', ')}`} className="flex h-44 items-end gap-2 overflow-x-auto pb-1">
        {series.map((s) => {
          const height = Math.max(4, Math.round((s.revenue / max) * 100));
          return (
            <div key={s.key} className="flex h-full min-w-10 flex-1 flex-col items-center justify-end gap-1" title={`${s.label} : ${formatFC(s.revenue)} (${s.orders} commande(s))`}>
              <span className="tabular-nums text-[10px] font-semibold text-brand-700 dark:text-brand-300">{s.revenue > 0 ? formatCompact(s.revenue) : ''}</span>
              <div className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 transition-all duration-300" style={{ height: `${height}%` }} />
              <span className="sf-faint text-[10px]">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(value);
}
