'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { logout } from '@/app/(app)/actions';
import { searchCustomers, type CustomerSearchResult } from '@/app/(app)/search-actions';
import { useTheme } from '@/components/theme-context';
import { Avatar } from '@/components/ui/avatar';
import { Icon, type IconName } from '@/components/ui/icons';

type Command = {
  id: string;
  group: 'Actions' | 'Go to' | 'Preferences' | 'Customers';
  label: string;
  hint?: string;
  icon: IconName;
  keywords?: string;
  run: () => void;
  customer?: CustomerSearchResult;
};

type PaletteContextValue = { open: () => void; isMac: boolean };

const PaletteContext = createContext<PaletteContextValue | undefined>(undefined);

export function useCommandPalette() {
  const context = useContext(PaletteContext);
  if (!context) throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
  return context;
}

const GROUP_ORDER: Command['group'][] = ['Customers', 'Actions', 'Go to', 'Preferences'];

/**
 * Keyboard-first command palette (Cmd/Ctrl+K from anywhere, including inside
 * inputs). One surface for navigation, actions and finding a customer.
 * Focus stays in the search field while arrow keys move the highlight
 * (aria-activedescendant), Enter runs, Escape closes and restores focus.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [customers, setCustomers] = useState<CustomerSearchResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  const open = useCallback(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setActive(0);
    setCustomers([]);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    previousFocus.current?.focus?.();
  }, []);

  // Global shortcut. Fires even while typing in a field, by design.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (isOpen) close();
        else open();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, open, close]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Debounced customer lookup; stale responses are discarded.
  useEffect(() => {
    if (!isOpen) return;
    const term = query.trim();
    if (term.length < 2) {
      setCustomers([]);
      return;
    }
    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchCustomers(term);
        if (id === requestId.current) setCustomers(results);
      } catch {
        if (id === requestId.current) setCustomers([]);
      }
    }, 160);
    return () => window.clearTimeout(timer);
  }, [query, isOpen]);

  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      router.push(href);
    },
    [router]
  );

  const commands = useMemo<Command[]>(() => {
    const nav = (id: string, label: string, href: string, icon: IconName, keywords = ''): Command => ({
      id,
      group: 'Go to',
      label,
      icon,
      keywords,
      run: () => go(href),
    });

    return [
      {
        id: 'add-customer',
        group: 'Actions',
        label: 'Add a customer',
        hint: 'Schedules a review request',
        icon: 'plus',
        keywords: 'new create',
        run: () => go('/customers?add=1'),
      },
      {
        id: 'import',
        group: 'Actions',
        label: 'Import customers from CSV',
        icon: 'upload',
        keywords: 'upload bulk',
        run: () => go('/customers/import'),
      },
      {
        id: 'segment',
        group: 'Actions',
        label: 'Create a segment',
        icon: 'funnel',
        keywords: 'filter audience',
        run: () => go('/segments'),
      },
      {
        id: 'referral',
        group: 'Actions',
        label: 'Generate a referral code',
        icon: 'gift',
        keywords: 'refer invite',
        run: () => go('/referrals'),
      },
      nav('go-dashboard', 'Dashboard', '/dashboard', 'dashboard', 'home overview'),
      nav('go-analytics', 'Analytics', '/analytics', 'chart', 'reports rebooking revenue health'),
      nav('go-reviews', 'Reviews Analytics', '/reviews', 'star', 'google reviews ratings replies alerts'),
      nav('go-customers', 'Customers', '/customers', 'users', 'contacts people'),
      nav('go-segments', 'Segments', '/segments', 'funnel', 'audiences'),
      nav('go-referrals', 'Referrals', '/referrals', 'userPlus', 'codes'),
      nav('go-feedback', 'Feedback inbox', '/feedback-inbox', 'chat', 'private reviews messages'),
      nav('go-settings', 'Settings', '/settings', 'cog', 'business profile delay google'),
      nav('go-services', 'Services', '/settings/services', 'tag', 'rebooking interval price'),
      nav('go-loyalty', 'Loyalty program', '/settings/loyalty', 'gift', 'points rewards'),
      nav('go-how', 'How it works', '/how-it-works', 'lightbulb', 'help guide'),
      {
        id: 'theme',
        group: 'Preferences',
        label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        icon: theme === 'dark' ? 'sun' : 'moon',
        keywords: 'theme appearance dark light',
        run: () => {
          setIsOpen(false);
          toggle();
        },
      },
      {
        id: 'logout',
        group: 'Preferences',
        label: 'Log out',
        icon: 'logout',
        keywords: 'sign out',
        run: () => {
          setIsOpen(false);
          startTransition(() => {
            logout();
          });
        },
      },
    ];
  }, [go, theme, toggle]);

  const results = useMemo<Command[]>(() => {
    const term = query.trim().toLowerCase();
    const matched = term
      ? commands.filter((command) => `${command.label} ${command.keywords ?? ''}`.toLowerCase().includes(term))
      : commands;

    const customerCommands: Command[] = customers.map((customer) => ({
      id: `customer-${customer.id}`,
      group: 'Customers',
      label: customer.name,
      hint: customer.email,
      icon: 'users',
      customer,
      run: () => go(`/customers/${customer.id}`),
    }));

    return [...customerCommands, ...matched].sort(
      (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    );
  }, [commands, customers, query, go]);

  // Keep the highlight valid as results change, and in view.
  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (results.length ? (current + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (results.length ? (current - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      results[active]?.run();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  let lastGroup: string | null = null;

  return (
    <PaletteContext.Provider value={{ open, isMac }}>
      {children}

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <div
            aria-hidden="true"
            onClick={close}
            className="absolute inset-0 animate-fade-in bg-ink/45 backdrop-blur-[3px]"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-xl animate-palette-in overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-float backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Icon name="search" className="h-5 w-5 flex-shrink-0 text-ink-4" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKeyDown}
                role="combobox"
                aria-expanded="true"
                aria-controls="command-list"
                aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
                aria-label="Search commands and customers"
                placeholder="Search customers, jump to a page, or run an action…"
                autoComplete="off"
                spellCheck={false}
                className="h-14 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4"
              />
              <kbd className="font-sans hidden rounded-md border border-line-strong bg-surface-muted px-1.5 py-0.5 text-2xs font-medium text-ink-3 sm:block">
                esc
              </kbd>
            </div>

            <div ref={listRef} id="command-list" role="listbox" className="scroll-thin max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-ink-3">
                  No results for &ldquo;{query.trim()}&rdquo;
                </p>
              ) : (
                results.map((command, index) => {
                  const showHeading = command.group !== lastGroup;
                  lastGroup = command.group;
                  const selected = index === active;
                  return (
                    <div key={command.id}>
                      {showHeading && (
                        <p className={`eyebrow px-3 pb-1.5 text-ink-4 ${index === 0 ? 'pt-1' : 'pt-3'}`}>
                          {command.group}
                        </p>
                      )}
                      <div
                        id={`cmd-${command.id}`}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => setActive(index)}
                        onClick={() => command.run()}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-100 ${
                          selected ? 'bg-brand-500/10 ring-1 ring-inset ring-brand-500/20' : ''
                        }`}
                      >
                        {command.customer ? (
                          <Avatar name={command.customer.name} size="md" />
                        ) : (
                          <span
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                              selected
                                ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_6px_12px_-4px_rgb(16_185_129/0.6)]'
                                : 'bg-surface-muted text-ink-3'
                            }`}
                          >
                            <Icon name={command.icon} className="h-4 w-4" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{command.label}</span>
                          {command.hint && <span className="block truncate text-xs text-ink-3">{command.hint}</span>}
                        </span>
                        {selected && (
                          <span className="flex items-center gap-1 text-2xs font-medium text-ink-3">
                            <kbd className="font-sans rounded border border-line-strong bg-surface px-1.5 py-0.5">↵</kbd>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line bg-surface-subtle/80 px-4 py-2.5 text-2xs text-ink-3">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="font-sans rounded border border-line-strong bg-surface px-1.5 py-0.5">↑</kbd>
                  <kbd className="font-sans rounded border border-line-strong bg-surface px-1.5 py-0.5">↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-sans rounded border border-line-strong bg-surface px-1.5 py-0.5">↵</kbd>
                  select
                </span>
              </span>
              <span>Type 2+ letters to find a customer</span>
            </div>
          </div>
        </div>
      )}
    </PaletteContext.Provider>
  );
}
