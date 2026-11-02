'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

/** Copies `value` to the clipboard and confirms with a brief "Copied" state. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (insecure context / denied) - nothing to do.
    }
  }

  return (
    <button type="button" onClick={copy} className="btn btn-ghost btn-sm" aria-label={value.length <= 80 ? `${label} ${value}` : label}>
      <Icon
        name={copied ? 'check' : 'copy'}
        className={`h-3.5 w-3.5 ${copied ? 'text-brand-600 dark:text-brand-400' : ''}`}
        strokeWidth={copied ? 2.2 : 1.6}
      />
      {copied ? 'Copied' : label}
      <span className="sr-only" role="status">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  );
}
