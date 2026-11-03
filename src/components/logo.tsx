import { APP_NAME_ACCENT, APP_NAME_LEAD } from '@/lib/brand';

const PlaneIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M21.44 2.56 2.75 9.77c-.7.27-.69 1.28.02 1.53l6.9 2.44c.32.11.57.36.68.68l2.44 6.9c.25.71 1.26.72 1.53.02l7.21-18.69c.24-.63-.4-1.27-1.03-1.03z"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M21.4 2.6 9.7 14.3" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The brand mark: paper plane on a green tile. Used on its own where space
 * is tight (mobile header, favicons-in-UI) and as part of the lockups below.
 */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-b from-brand-500 to-brand-700 text-white shadow-btn-primary ring-1 ring-inset ring-brand-800/40 ${className}`}
    >
      <PlaneIcon className="h-[56%] w-[56%]" />
    </span>
  );
}

/** Horizontal lockup: mark + wordmark, for light and dark surfaces alike. */
export function Logo({ className = '', size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <span className={`inline-flex items-center ${size === 'lg' ? 'gap-3' : 'gap-2.5'} ${className}`}>
      <LogoMark className={size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'} />
      <span
        className={`font-semibold tracking-[-0.02em] text-ink ${size === 'lg' ? 'text-xl' : 'text-[15px]'}`}
      >
        {APP_NAME_LEAD}<span className="text-brand-700 dark:text-brand-400">{APP_NAME_ACCENT}</span>
      </span>
    </span>
  );
}

/** Lockup for always-dark brand panels (auth side panel, footer band). */
export function LogoOnDark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-8 w-8 ring-white/20" />
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-white">
        {APP_NAME_LEAD}<span className="text-brand-300">{APP_NAME_ACCENT}</span>
      </span>
    </span>
  );
}
