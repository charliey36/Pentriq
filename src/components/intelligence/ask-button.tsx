'use client';

import { useCommandPalette } from '@/components/command-palette';
import { Icon } from '@/components/ui/icons';
import { Kbd } from '@/components/ui/kbd';

/** Opens the command palette in "Ask Pentriq" mode (natural-language questions about customers). */
export function AskPentriqButton({ className = '' }: { className?: string }) {
  const { open, isMac } = useCommandPalette();
  return (
    <button type="button" onClick={() => open({ ask: true })} className={`btn btn-secondary btn-sm ${className}`}>
      <Icon name="sparkles" className="h-4 w-4 text-brand-600 dark:text-brand-400" />
      Ask Pentriq
      <Kbd className="hidden sm:inline-flex">{isMac ? '⌘' : 'Ctrl'} K</Kbd>
    </button>
  );
}
