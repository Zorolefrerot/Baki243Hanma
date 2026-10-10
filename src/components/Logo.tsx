/** Logo ShopFlow RDC — emblème « le panier qui monte » + signature typographique. */

const MARK_PATHS = {
  /** Panier + liseré. */
  basket: 'M18 29 H46 L43.4 50.5 Q42.8 55.5 38.2 55.5 H25.8 Q21.2 55.5 20.6 50.5 Z',
  rim: 'M14.5 23.5 H49.5 A3.25 3.25 0 0 1 49.5 30 H14.5 A3.25 3.25 0 0 1 14.5 23.5 Z',
  handle: 'M23 23.5 C 22 11 35 8 44 11.5',
  arrow: 'M50 6.5 L41.5 10.5 L45.5 17 Z',
} as const;

export type LogoTone = 'light' | 'dark' | 'mono';

/**
 * Emblème seul (utilisable comme icône).
 * - light : couleurs pleines sur fond clair (en-tête, connexion…)
 * - dark : couple turquoise/blanc sur fond sombre
 * - mono : blanc monochrome (barre d'application, impression)
 */
export function LogoMark({ size = 40, tone = 'light' }: { size?: number; tone?: LogoTone }) {
  const body = tone === 'dark' ? '#2e9aab' : tone === 'mono' ? '#ffffff' : '#0b6878';
  const bar1 = tone === 'mono' ? '#ffffff' : '#3ecf9a';
  const bar2 = tone === 'mono' ? '#ffffff' : tone === 'dark' ? '#9fd9e1' : '#2e9aab';
  const bar3 = tone === 'mono' ? '#ffffff' : tone === 'dark' ? '#ffffff' : '#0b6878';
  const arrow = tone === 'mono' ? '#ffffff' : '#f2705b';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d={MARK_PATHS.basket} fill={body} />
      <path d={MARK_PATHS.rim} fill={body} />
      <path d="M26.5 43 V50" stroke={bar1} strokeWidth="4.6" strokeLinecap="round" fill="none" />
      <path d="M32.5 38.5 V50" stroke={bar2} strokeWidth="4.6" strokeLinecap="round" fill="none" />
      <path d="M38.5 33.5 V50" stroke={bar3} strokeWidth="4.6" strokeLinecap="round" fill="none" />
      <path d={MARK_PATHS.handle} stroke={body} strokeWidth="4.6" strokeLinecap="round" fill="none" />
      <path d={MARK_PATHS.arrow} fill={arrow} />
    </svg>
  );
}

/**
 * Logo complet : emblème + « ShopFlow » + badge RDC.
 * La typographie est en HTML pour un rendu net sur toutes les plateformes.
 */
export function LogoFull({
  size = 36,
  tone = 'light',
  showBadge = true,
}: {
  size?: number;
  tone?: LogoTone;
  showBadge?: boolean;
}) {
  const ink = tone === 'dark' || tone === 'mono' ? 'text-white' : 'text-navy-800';
  const flow = tone === 'dark' ? 'text-brand-200' : tone === 'mono' ? 'text-white' : 'text-brand-600';
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} tone={tone} />
      <span className={`text-[1.35em] font-extrabold leading-none tracking-tight ${ink}`} style={{ fontSize: size * 0.55 }}>
        Shop<span className={`font-bold ${flow}`}>Flow</span>
        {showBadge && (
          <span
            className={`ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 align-middle text-[0.38em] font-extrabold tracking-widest ${
              tone === 'dark' ? 'bg-navy-700 text-mint-500' : tone === 'mono' ? 'bg-white/20 text-white' : 'bg-mint-100 text-mint-700'
            }`}
          >
            RDC
          </span>
        )}
      </span>
    </span>
  );
}
