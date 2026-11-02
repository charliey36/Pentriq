'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_SHORTCUTS, GO_SHORTCUTS, OPEN_SHORTCUTS_EVENT, SEQUENCE_TIMEOUT_MS, isTypingTarget, resolveGo } from '@/lib/shortcuts';
import { useRole } from '@/components/role-context';
import { can } from '@/lib/permissions';
import { Icon } from '@/components/ui/icons';
import { Kbd } from '@/components/ui/kbd';

/**
 * Global keyboard navigation: "g" then a letter jumps to a section, "n" adds a customer, "?" shows the
 * cheat sheet. Single-letter keys are ignored while typing in a field and when a modifier is held, so they
 * never fight with forms or browser shortcuts. A small hint chip confirms a pending "g".
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const role = useRole();
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);
  const timer = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const allowed = GO_SHORTCUTS.filter((s) => !s.capability || role === null || can(role, s.capability));

  const clearPending = useCallback(() => {
    setPendingG(false);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const openHelp = useCallback(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHelpOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    previousFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    const onOpen = () => openHelp();
    window.addEventListener(OPEN_SHORTCUTS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, onOpen);
  }, [openHelp]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      // Any open modal (palette, confirm dialogs) owns the keyboard.
      if (!helpOpen && document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      if (helpOpen) {
        if (event.key === 'Escape' || event.key === '?') {
          event.preventDefault();
          closeHelp();
        }
        return;
      }

      if (pendingG) {
        const target = resolveGo(event.key);
        clearPending();
        if (target && allowed.includes(target)) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }

      if (event.key === 'g' || event.key === 'G') {
        setPendingG(true);
        timer.current = window.setTimeout(() => setPendingG(false), SEQUENCE_TIMEOUT_MS);
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        openHelp();
        return;
      }
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        router.push('/customers?add=1');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allowed, clearPending, closeHelp, helpOpen, openHelp, pendingG, router]);

  useEffect(() => {
    if (helpOpen) dialogRef.current?.focus();
  }, [helpOpen]);

  useEffect(() => () => clearPending(), [clearPending]);

  return (
    <>
      {pendingG && (
        <div role="status" className="pointer-events-none fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 animate-pop-in rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs text-ink-2 shadow-pop backdrop-blur print:hidden">
          <Kbd>G</Kbd> then… <span className="text-ink-4">{allowed.map((s) => s.key.toUpperCase()).join(' ')}</span>
        </div>
      )}

      {helpOpen && (
        <div className="fixed inset-0 z-[65] flex items-start justify-center px-4 pt-[10vh]">
          <div aria-hidden="true" onClick={closeHelp} className="absolute inset-0 animate-fade-in bg-ink/45 backdrop-blur-[3px]" />
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            className="relative w-full max-w-2xl animate-palette-in overflow-hidden rounded-2xl border border-line bg-surface shadow-float outline-none"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 id="shortcuts-title" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Icon name="keyboard" className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                Keyboard shortcuts
              </h2>
              <button type="button" onClick={closeHelp} className="btn btn-ghost btn-icon h-8 w-8" aria-label="Close">
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-6 p-5 sm:grid-cols-2">
              <div>
                <p className="eyebrow text-ink-4">Go to</p>
                <ul className="mt-2 space-y-1.5">
                  {allowed.map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
                      {s.label}
                      <span className="flex items-center gap-1">
                        <Kbd>G</Kbd>
                        <Kbd>{s.key.toUpperCase()}</Kbd>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow text-ink-4">Actions</p>
                <ul className="mt-2 space-y-1.5">
                  {ACTION_SHORTCUTS.map((s) => (
                    <li key={s.label} className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
                      {s.label}
                      <span className="flex items-center gap-1">
                        {s.keys.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 rounded-lg bg-surface-subtle px-3 py-2 text-xs leading-5 text-ink-3 ring-1 ring-inset ring-line">
                  Tip: in the command palette you can ask questions like &ldquo;lapsed customers who spent over £200&rdquo;.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
