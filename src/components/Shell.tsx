/** Coque de l'application : en-tête, bannières d'état, contenu et navigation principale. */
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { Banner } from './ui';
import { LogoMark } from './Logo';
import { IconAlert, IconBox, IconCart, IconCog, IconHome, IconList, IconOffline, IconSync, IconTruck } from './icons';
import { formatDateTime } from '../lib/dates';

const NAV = [
  { to: '/', label: 'Accueil', end: true, Icon: IconHome },
  { to: '/articles', label: 'Articles', end: false, Icon: IconBox },
] as const;

const NAV_END = [
  { to: '/livraisons', label: 'Livraisons', end: false, Icon: IconTruck },
  { to: '/historique', label: 'Historique', end: false, Icon: IconList },
] as const;

function SyncPill() {
  const { online, pendingCount, sync, syncNow, mode } = useApp();
  if (mode === 'local') return null;
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:bg-white/10 dark:text-slate-200">
        <IconOffline size={15} /> Hors connexion{pendingCount > 0 ? ` · ${pendingCount} en attente` : ''}
      </span>
    );
  }
  if (sync.running) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-800 dark:bg-brand-400/15 dark:text-brand-300">
        <IconSync size={15} className="animate-spin" /> Synchronisation…
      </span>
    );
  }
  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={syncNow}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300"
      >
        <IconSync size={15} /> {pendingCount} en attente · Synchroniser
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={syncNow}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-mint-100 px-3 py-1.5 text-xs font-semibold text-mint-700 transition hover:bg-mint-100/70 dark:bg-mint-500/15 dark:text-mint-500"
      title="Lancer une synchronisation"
    >
      À jour
    </button>
  );
}

export function Shell() {
  const { shop, mode, online, pendingCount, sync, lastSyncAt } = useApp();
  const location = useLocation();
  const needsAttention = sync.lastReport?.needsAttention ?? 0;

  return (
    <div className="sf-page flex min-h-dvh flex-col">
      <header className="sf-header safe-top sticky top-0 z-30">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark size={38} />
            <div className="min-w-0">
              <p className="sf-ink truncate text-sm font-extrabold leading-tight">{shop?.name ?? 'ShopFlow RDC'}</p>
              <p className="sf-faint truncate text-xs">
                {mode === 'remote' && lastSyncAt
                  ? `Synchronisé le ${formatDateTime(lastSyncAt)}`
                  : mode === 'remote'
                    ? 'Pas encore synchronisé'
                    : 'ShopFlow RDC'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <SyncPill />
            <NavLink
              to="/parametres"
              aria-label="Paramètres"
              className={({ isActive }) =>
                `flex h-10 w-10 items-center justify-center rounded-full transition ${isActive ? 'bg-brand-100 text-brand-800 dark:bg-white/10 dark:text-brand-300' : 'sf-muted hover:bg-black/5 dark:hover:bg-white/10'}`
              }
            >
              <IconCog size={21} />
            </NavLink>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-4">
        <div className="flex flex-col gap-4">
          {!online && mode === 'remote' && (
            <Banner tone="info" title="Vous êtes hors connexion">
              Vos opérations sont conservées sur cet appareil et seront synchronisées dès que la connexion sera rétablie.
            </Banner>
          )}
          {needsAttention > 0 && (
            <Banner
              tone="danger"
              title={`${needsAttention} opération(s) à vérifier`}
              action={
                <NavLink
                  to="/parametres"
                  className="inline-flex min-h-10 items-center rounded-xl bg-coral-600 px-4 text-sm font-semibold text-white"
                >
                  Voir les problèmes
                </NavLink>
              }
            >
              Certaines données n’ont pas pu être envoyées. Rien n’a été perdu : elles restent enregistrées sur cet appareil.
            </Banner>
          )}
          {pendingCount > 0 && needsAttention === 0 && online && !sync.running && mode === 'remote' && (
            <p className="sf-muted flex items-center gap-2 text-sm">
              <IconAlert size={16} className="text-amber-600" /> Synchronisation en attente ({pendingCount}).
            </p>
          )}
          <main key={location.pathname.split('/')[1] ?? 'root'} className="sf-fade-in">
            <Outlet />
          </main>
        </div>
      </div>

      <nav aria-label="Navigation principale" className="sf-navbar safe-bottom fixed inset-x-0 bottom-0 z-40 shadow-[0_-4px_16px_rgba(11,34,57,0.06)]">
        <ul className="mx-auto grid max-w-3xl grid-cols-5 items-end px-2 pt-2">
          {NAV.map(({ to, label, end, Icon }) => (
            <li key={to}>
              <NavItem to={to} end={end} label={label} Icon={Icon} />
            </li>
          ))}
          <li className="flex justify-center">
            <NavLink
              to="/commande"
              aria-label="Nouvelle commande"
              className={({ isActive }) =>
                `-mt-6 flex min-h-16 min-w-20 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-2 text-xs font-bold shadow-lg transition active:scale-95 ${
                  isActive
                    ? 'bg-brand-800 text-white'
                    : 'bg-brand-600 text-white shadow-[0_10px_24px_-8px_rgba(11,104,120,0.7)] hover:bg-brand-700'
                }`
              }
            >
              <IconCart size={24} />
              <span className="max-w-[5.5rem] text-center text-[10px] leading-tight">Nouvelle commande</span>
            </NavLink>
          </li>
          {NAV_END.map(({ to, label, end, Icon }) => (
            <li key={to}>
              <NavItem to={to} end={end} label={label} Icon={Icon} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavItem({ to, end, label, Icon }: { to: string; end: boolean; label: string; Icon: (p: { size?: number }) => React.ReactElement }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition ${
          isActive ? 'text-brand-700 dark:text-brand-300' : 'sf-faint hover:opacity-80'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`flex h-8 w-12 items-center justify-center rounded-full transition ${isActive ? 'bg-brand-100 dark:bg-white/10' : ''}`}>
            <Icon size={22} />
          </span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}
