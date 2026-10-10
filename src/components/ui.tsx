/** Composants d'interface réutilisables : boutons, champs, cartes, badges, fenêtres, états. */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning' | 'mint';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgba(11,104,120,0.55)] hover:bg-brand-700 disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-700 dark:disabled:text-slate-400',
  secondary:
    'sf-surface sf-ink ring-1 ring-inset hover:brightness-[0.98] disabled:opacity-50',
  danger: 'bg-coral-600 text-white shadow-[0_6px_16px_-6px_rgba(221,84,64,0.55)] hover:bg-coral-700 disabled:bg-coral-500 disabled:opacity-60',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 disabled:bg-amber-200 dark:disabled:bg-amber-900',
  mint: 'bg-mint-600 text-white shadow-[0_6px_16px_-6px_rgba(34,177,132,0.55)] hover:bg-mint-700 disabled:bg-slate-300 dark:disabled:bg-slate-700',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-white/5',
};

export function Button({
  variant = 'primary',
  block = false,
  size = 'lg',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; block?: boolean; size?: 'md' | 'lg' }) {
  const sizing = size === 'lg' ? 'min-h-12 px-5 py-3 text-base' : 'min-h-10 px-4 py-2 text-sm';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${sizing} ${BUTTON_VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
}

export function Card({ children, className = '', as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <Tag className={`sf-card p-4 ${className}`}>{children}</Tag>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="sf-ink truncate text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <div className="sf-muted mt-1 text-sm">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  required?: boolean;
}

export function Field({ label, error, hint, children, required }: FieldProps) {
  const id = useId();
  const hintId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="sf-ink text-sm font-semibold">
        {label}
        {required && <span className="text-coral-600"> *</span>}
      </label>
      {children(id, hintId)}
      {error ? (
        <p id={hintId} className="text-sm font-medium text-coral-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="sf-faint text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ error, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      className={`sf-input ${error ? 'border-coral-500 bg-coral-100/40 dark:bg-coral-500/10' : ''} ${className}`}
      aria-invalid={error || undefined}
      {...rest}
    />
  );
}

export function TextArea({ error, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      className={`sf-input min-h-28 resize-y ${error ? 'border-coral-500 bg-coral-100/40 dark:bg-coral-500/10' : ''} ${className}`}
      aria-invalid={error || undefined}
      {...rest}
    />
  );
}

export function SelectInput({ error, className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select className={`sf-input appearance-none ${error ? 'border-coral-500' : ''} ${className}`} aria-invalid={error || undefined} {...rest}>
      {children}
    </select>
  );
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
  success: 'bg-mint-100 text-mint-700 dark:bg-mint-500/15 dark:text-mint-500',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-coral-100 text-coral-700 dark:bg-coral-500/15 dark:text-coral-500',
  info: 'bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300',
  brand: 'bg-brand-100 text-brand-800 dark:bg-brand-400/15 dark:text-brand-300',
};

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const styles = {
    info: 'bg-sky-50 text-sky-950 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-100 dark:ring-sky-500/30',
    warning: 'bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/30',
    danger: 'bg-coral-100 text-coral-700 ring-coral-200 dark:bg-coral-500/10 dark:text-coral-500 dark:ring-coral-500/30',
    success: 'bg-mint-100 text-mint-700 ring-mint-500/30 dark:bg-mint-500/10 dark:text-mint-500 dark:ring-mint-500/30',
  } as const;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`sf-fade-in flex flex-col gap-2 rounded-2xl p-4 ring-1 ${styles[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className="text-sm leading-relaxed">{children}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center" style={{ borderColor: 'var(--sf-line)' }}>
      {icon ?? (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-400/15 dark:text-brand-300" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
      )}
      <p className="sf-ink text-base font-semibold">{title}</p>
      {children && <div className="sf-muted max-w-sm text-sm leading-relaxed">{children}</div>}
      {action}
    </div>
  );
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600 dark:border-white/10 dark:border-t-brand-400" aria-hidden="true" />
      <p className="sf-muted text-sm">{label}</p>
    </div>
  );
}

/** Blocs de chargement discrets (liste / cartes). */
export function SkeletonRows({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sf-skeleton h-16 w-full" />
      ))}
    </div>
  );
}

/** Fenêtre modale (feuille du bas sur mobile). Fermable par Échap et par le bouton « Fermer ». */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sf-sheet-up sf-surface flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="sf-divider flex items-center justify-between gap-3 border-b px-5 py-4">
          <h2 id={titleId} className="sf-ink text-lg font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="sf-muted rounded-lg px-3 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">
            Fermer
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom sf-divider sf-surface border-t px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** Grande carte d'indicateur (tableau de bord). */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'brand' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
}) {
  const valueTone = {
    default: 'sf-ink',
    brand: 'text-brand-700 dark:text-brand-300',
    success: 'text-mint-700 dark:text-mint-500',
    warning: 'text-amber-700 dark:text-amber-300',
    danger: 'text-coral-700 dark:text-coral-500',
  }[tone];
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-white/10 dark:text-brand-300" aria-hidden="true">
            {icon}
          </span>
        )}
        <p className="sf-muted text-sm font-medium">{label}</p>
      </div>
      <p className={`text-xl font-extrabold tracking-tight tabular-nums sm:text-2xl ${valueTone}`}>{value}</p>
      {hint && <p className="sf-faint text-xs leading-relaxed">{hint}</p>}
    </Card>
  );
}

export function Spacer({ className = '' }: { className?: string }) {
  return <div className={className} aria-hidden="true" />;
}
