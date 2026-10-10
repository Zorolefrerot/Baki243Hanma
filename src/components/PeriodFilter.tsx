/** Sélecteur de période : aujourd'hui, hier, 7 jours, mois en cours, personnalisée, tout. */
import type { PeriodKind } from '../lib/dates';
import { toDateInput } from '../lib/dates';

export const PERIOD_OPTIONS: { kind: PeriodKind; label: string }[] = [
  { kind: 'today', label: 'Aujourd’hui' },
  { kind: 'yesterday', label: 'Hier' },
  { kind: 'last7', label: '7 jours' },
  { kind: 'month', label: 'Ce mois' },
  { kind: 'custom', label: 'Personnalisée' },
];

export interface CustomRange {
  from: string;
  to: string;
}

export function defaultCustomRange(now: Date = new Date()): CustomRange {
  const d = toDateInput(now);
  return { from: d, to: d };
}

export function PeriodFilter({
  value,
  onChange,
  custom,
  onCustomChange,
  includeAll = false,
  ariaLabel = 'Choisir la période',
}: {
  value: PeriodKind;
  onChange: (kind: PeriodKind) => void;
  custom: CustomRange;
  onCustomChange: (range: CustomRange) => void;
  includeAll?: boolean;
  ariaLabel?: string;
}) {
  const options = includeAll ? [...PERIOD_OPTIONS, { kind: 'all' as PeriodKind, label: 'Tout' }] : PERIOD_OPTIONS;
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={ariaLabel} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {options.map((o) => {
          const active = value === o.kind;
          return (
            <button
              key={o.kind}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.kind)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                active ? 'bg-brand-600 text-white shadow-sm' : 'sf-surface sf-ink ring-1 ring-inset ring-slate-300 dark:ring-white/15 hover:bg-slate-50 dark:bg-white/5'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {value === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold sf-muted">
            Du
            <input
              type="date"
              value={custom.from}
              max={custom.to}
              onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
              className="min-h-12 rounded-xl border sf-surface border-slate-300 dark:border-white/15 px-3 py-2 text-base font-normal sf-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold sf-muted">
            Au
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
              className="min-h-12 rounded-xl border sf-surface border-slate-300 dark:border-white/15 px-3 py-2 text-base font-normal sf-ink"
            />
          </label>
        </div>
      )}
    </div>
  );
}
