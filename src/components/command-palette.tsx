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
import { Kbd } from '@/components/ui/kbd';
import { useRole } from '@/components/role-context';
import { can, type Capability } from '@/lib/permissions';
import { parseRecent, pushRecent, rankCommands } from '@/lib/command-search';
import { parseCustomerQuery } from '@/lib/intelligence/nl-query';
import { OPEN_SHORTCUTS_EVENT, shortcutHintFor } from '@/lib/shortcuts';
import { STORAGE_KEYS } from '@/lib/brand';

type Group = 'Ask Pentriq' | 'Recent' | 'Customers' | 'Actions' | 'Go to' | 'Preferences' | 'Try asking';

type Command = {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  shortcut?: string;
  icon: IconName;
  keywords?: string;
  run: () => void;
  customer?: CustomerSearchResult;
};

export type OpenOptions = { ask?: boolean; query?: string };
type PaletteContextValue = { open: (options?: OpenOptions) => void; isMac: boolean };

const PaletteContext = createContext<PaletteContextValue | undefined>(undefined);

export function useCommandPalette() {
  const context = useContext(PaletteContext);
  if (!context) throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
  return context;
}

const GROUP_ORDER: Group[] = ['Ask Pentriq', 'Recent', 'Customers', 'Actions', 'Go to', 'Try asking', 'Preferences'];

const COMMAND_CAPABILITY: Record<string, Capability> = {
  'go-settings': 'settings.write',
  'go-services': 'settings.write',
  'go-loyalty': 'settings.write',
  'go-team': 'team.manage',
  'go-security': 'team.manage',
  'go-integrations': 'integrations.manage',
  'go-billing': 'billing.manage',
};

const ASK_EXAMPLES = [
  "Customers who haven't visited in 2 months and spent over £200",
  'Who is due to rebook?',
  'VIP tagged customers with more than 5 visits',
  'New customers this month',
  'Failed review requests',
];

function readRecent(): string[] {
  try {
    return parseRecent(window.localStorage.getItem(STORAGE_KEYS.recentCommands));
  } catch {
    return [];
  }
}

function writeRecent(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.recentCommands, JSON.stringify(ids));
  } catch {
    /* private mode: recents are a convenience only */
  }
}

/**
 * Keyboard-first command palette (Cmd/Ctrl+K from anywhere, including inside inputs). One surface for
 * navigation, actions, finding a customer and asking questions in plain English ("Ask Pentriq").
 * Results are fuzzy-ranked; recently used commands are remembered on this device. Focus stays in the input
 * while arrow keys move the highlight (aria-activedescendant); Enter runs, Escape closes and restores focus.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [askMode, setAskMode] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [customers, setCustomers] = useState<CustomerSearchResult[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  const open = useCallback((options?: OpenOptions) => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery(options?.query ?? '');
    setAskMode(Boolean(options?.ask));
    setActive(0);
    setCustomers([]);
    setRecent(readRecent());
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

  // Debounced customer lookup; stale responses are discarded. Skipped when the query reads as a question.
  useEffect(() => {
    if (!isOpen) return;
    const term = query.trim();
    if (term.length < 2 || parseCustomerQuery(term)) {
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

  const remember = useCallback((id: string) => {
    const next = pushRecent(readRecent(), id);
    writeRecent(next);
    setRecent(next);
  }, []);

  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      router.push(href);
    },
    [router]
  );

  const role = useRole();
  const allCommands = useMemo<Command[]>(() => {
    const nav = (id: string, label: string, href: string, icon: IconName, keywords = ''): Command => ({
      id,
      group: 'Go to',
      label,
      icon,
      keywords,
      shortcut: shortcutHintFor(href),
      run: () => go(href),
    });

    return [
      { id: 'add-customer', group: 'Actions', label: 'Add a customer', hint: 'Schedules a review request', shortcut: 'N', icon: 'plus', keywords: 'new create', run: () => go('/customers?add=1') },
      { id: 'import', group: 'Actions', label: 'Import customers from CSV', icon: 'upload', keywords: 'upload bulk csv spreadsheet', run: () => go('/customers/import') },
      { id: 'segment', group: 'Actions', label: 'Create a segment', icon: 'funnel', keywords: 'filter audience campaign', run: () => go('/segments') },
      { id: 'triage', group: 'Actions', label: 'Triage feedback', hint: 'Most urgent first, with reply drafts', icon: 'chat', keywords: 'reply complaints inbox urgent', run: () => go('/feedback-inbox?view=open') },
      { id: 'report', group: 'Actions', label: 'Print the executive report', icon: 'printer', keywords: 'pdf export summary board owner partner', run: () => go('/reports') },
      { id: 'referral', group: 'Actions', label: 'Generate a referral code', icon: 'gift', keywords: 'refer invite', run: () => go('/referrals') },
      {
        id: 'shortcuts',
        group: 'Actions',
        label: 'Keyboard shortcuts',
        shortcut: '?',
        icon: 'keyboard',
        keywords: 'keys hotkeys help',
        run: () => {
          setIsOpen(false);
          window.dispatchEvent(new CustomEvent(OPEN_SHORTCUTS_EVENT));
        },
      },
      nav('go-dashboard', 'Dashboard', '/dashboard', 'dashboard', 'home overview'),
      nav('go-insights', 'Insights', '/insights', 'sparkles', 'health score ai recommendations forecast next actions'),
      nav('go-reports', 'Executive report', '/reports', 'report', 'kpi summary period comparison print'),
      nav('go-activity', 'Activity', '/activity', 'activity', 'timeline feed history log events'),
      nav('go-analytics', 'Analytics', '/analytics', 'chart', 'reports rebooking revenue health'),
      nav('go-reviews', 'Reviews', '/reviews', 'star', 'google reviews ratings replies alerts themes'),
      nav('go-customers', 'Customers', '/customers', 'users', 'contacts people clients'),
      nav('go-segments', 'Segments', '/segments', 'funnel', 'audiences lapsed vip due'),
      nav('go-referrals', 'Referrals', '/referrals', 'userPlus', 'codes'),
      nav('go-feedback', 'Feedback inbox', '/feedback-inbox', 'chat', 'private reviews messages complaints'),
      nav('go-settings', 'Settings', '/settings', 'cog', 'business profile delay google'),
      nav('go-services', 'Services', '/settings/services', 'tag', 'rebooking interval price'),
      nav('go-loyalty', 'Loyalty program', '/settings/loyalty', 'gift', 'points rewards'),
      nav('go-team', 'Team & roles', '/settings/team', 'users', 'invite members staff admin permissions access'),
      nav('go-security', 'Security & audit log', '/settings/security', 'shield', 'audit log retention compliance gdpr security'),
      nav('go-integrations', 'Integrations & API key', '/settings/integrations', 'bolt', 'google square acuity calendly api webhook zapier'),
      nav('go-billing', 'Billing', '/settings/billing', 'lock', 'subscription plan invoice card pause cancel'),
      nav('go-qr', 'QR code & review link', '/review-link', 'star', 'qr print poster desk invoice receipt widget'),
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

  // Hide commands the signed-in role cannot use (the pages and actions enforce it too).
  const commands = useMemo(
    () => allCommands.filter((c) => !COMMAND_CAPABILITY[c.id] || role === null || can(role, COMMAND_CAPABILITY[c.id] as Capability)),
    [allCommands, role]
  );

  const results = useMemo<Command[]>(() => {
    const term = query.trim();
    const out: Command[] = [];

    // Natural-language answer first, when the query reads as a question about customers.
    const answer = term.length >= 3 ? parseCustomerQuery(term) : null;
    if (answer) {
      out.push({
        id: 'ask-answer',
        group: 'Ask Pentriq',
        label: answer.kind === 'segment' ? 'Show matching customers' : answer.summary,
        hint: answer.kind === 'segment' ? answer.summary : 'Opens the customers list with this filter',
        icon: 'sparkles',
        run: () => go(answer.href),
      });
    }

    if (!term) {
      if (askMode) {
        ASK_EXAMPLES.forEach((example, i) =>
          out.push({ id: `example-${i}`, group: 'Try asking', label: example, icon: 'sparkles', run: () => { setQuery(example); setActive(0); } })
        );
        return out;
      }
      const byId = new Map(commands.map((c) => [c.id, c]));
      const recents = recent.map((id) => byId.get(id)).filter((c): c is Command => Boolean(c));
      for (const c of recents) out.push({ ...c, id: `recent-${c.id}`, group: 'Recent' });
      const recentIds = new Set(recents.map((c) => c.id));
      out.push(...commands.filter((c) => !recentIds.has(c.id)));
      return out;
    }

    out.push(
      ...customers.map((customer) => ({
        id: `customer-${customer.id}`,
        group: 'Customers' as const,
        label: customer.name,
        hint: customer.email,
        icon: 'users' as IconName,
        customer,
        run: () => go(`/customers/${customer.id}`),
      }))
    );
    const ranked = rankCommands(commands, term);
    out.push(...ranked);
    if (!answer && ranked.length === 0 && customers.length === 0 && term.length >= 3) {
      out.push({
        id: 'ask-fallback',
        group: 'Ask Pentriq',
        label: `Search customers for “${term}”`,
        icon: 'search',
        run: () => go(`/customers?q=${encodeURIComponent(term)}`),
      });
    }
    // Stable group order, preserving rank within each group.
    return out
      .map((c, i) => ({ c, i }))
      .sort((a, b) => GROUP_ORDER.indexOf(a.c.group) - GROUP_ORDER.indexOf(b.c.group) || a.i - b.i)
      .map((x) => x.c);
  }, [commands, customers, query, go, askMode, recent]);

  const runCommand = useCallback(
    (command: Command) => {
      const baseId = command.id.replace(/^recent-/, '');
      if (!baseId.startsWith('customer-') && !baseId.startsWith('example-') && !baseId.startsWith('ask-')) remember(baseId);
      command.run();
    },
    [remember]
  );

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
      const command = results[active];
      if (command) runCommand(command);
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
          <div aria-hidden="true" onClick={close} className="absolute inset-0 animate-fade-in bg-ink/45 backdrop-blur-[3px]" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={askMode ? 'Ask Pentriq' : 'Command palette'}
            className="relative w-full max-w-xl animate-palette-in overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-float backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Icon name={askMode ? 'sparkles' : 'search'} className={`h-5 w-5 flex-shrink-0 ${askMode ? 'text-brand-600 dark:text-brand-400' : 'text-ink-4'}`} />
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
                aria-label={askMode ? 'Ask a question about your customers' : 'Search commands and customers'}
                placeholder={askMode ? 'Ask about your customers, e.g. “lapsed VIPs”' : 'Search, jump to a page, or ask a question…'}
                autoComplete="off"
                spellCheck={false}
                className="h-14 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4"
              />
              <Kbd className="hidden sm:inline-flex">esc</Kbd>
            </div>

            <div ref={listRef} id="command-list" role="listbox" className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-ink-3">No results for &ldquo;{query.trim()}&rdquo;</p>
              ) : (
                results.map((command, index) => {
                  const showHeading = command.group !== lastGroup;
                  lastGroup = command.group;
                  const selected = index === active;
                  const isAnswer = command.group === 'Ask Pentriq';
                  return (
                    <div key={command.id}>
                      {showHeading && (
                        <p className={`eyebrow flex items-center gap-1.5 px-3 pb-1.5 ${isAnswer ? 'text-brand-700 dark:text-brand-400' : 'text-ink-4'} ${index === 0 ? 'pt-1' : 'pt-3'}`}>
                          {isAnswer && <Icon name="sparkles" className="h-3 w-3" />}
                          {command.group}
                        </p>
                      )}
                      <div
                        id={`cmd-${command.id}`}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => setActive(index)}
                        onClick={() => runCommand(command)}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-100 ${
                          selected ? 'bg-brand-500/10 ring-1 ring-inset ring-brand-500/20' : isAnswer ? 'bg-brand-500/[0.04]' : ''
                        }`}
                      >
                        {command.customer ? (
                          <Avatar name={command.customer.name} size="md" />
                        ) : (
                          <span
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                              selected || isAnswer
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
                        {command.shortcut && !selected && <span className="hidden text-2xs font-medium text-ink-4 sm:inline">{command.shortcut}</span>}
                        {selected && <Kbd>↵</Kbd>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-subtle/80 px-4 py-2.5 text-2xs text-ink-3">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>↵</Kbd>
                  select
                </span>
              </span>
              <span className="truncate">Ask in plain English, e.g. &ldquo;spent over £200&rdquo;</span>
            </div>
          </div>
        </div>
      )}
    </PaletteContext.Provider>
  );
}
