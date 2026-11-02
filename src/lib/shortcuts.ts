/**
 * Keyboard shortcuts (Linear/GitHub style "g then key" navigation). One table drives the handler, the help
 * overlay and the hints shown in the command palette, so they can never disagree.
 */
import type { Capability } from '@/lib/permissions';

export type GoShortcut = { key: string; href: string; label: string; capability?: Capability };

export const GO_SHORTCUTS: GoShortcut[] = [
  { key: 'd', href: '/dashboard', label: 'Dashboard' },
  { key: 'i', href: '/insights', label: 'Insights' },
  { key: 'p', href: '/reports', label: 'Executive report' },
  { key: 'y', href: '/activity', label: 'Activity' },
  { key: 'a', href: '/analytics', label: 'Analytics' },
  { key: 'r', href: '/reviews', label: 'Reviews' },
  { key: 'f', href: '/feedback-inbox', label: 'Feedback inbox' },
  { key: 'c', href: '/customers', label: 'Customers' },
  { key: 's', href: '/segments', label: 'Segments' },
  { key: 't', href: '/settings', label: 'Settings', capability: 'settings.write' },
];

export const ACTION_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['⌘', 'K'], label: 'Command palette and search' },
  { keys: ['N'], label: 'Add a customer' },
  { keys: ['/'], label: 'Search the current list' },
  { keys: ['?'], label: 'Show keyboard shortcuts' },
  { keys: ['Esc'], label: 'Close a dialog' },
];

export const SEQUENCE_TIMEOUT_MS = 1200;

/** Resolves the second key of a "g" sequence to a destination, or null. */
export function resolveGo(key: string): GoShortcut | null {
  const k = key.toLowerCase();
  return GO_SHORTCUTS.find((s) => s.key === k) ?? null;
}

export function shortcutHintFor(href: string): string | undefined {
  const match = GO_SHORTCUTS.find((s) => s.href === href);
  return match ? `G then ${match.key.toUpperCase()}` : undefined;
}

/** True when the keystroke is going into a text field, so single-letter shortcuts must stay out of the way. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return el.isContentEditable === true;
}

export const OPEN_SHORTCUTS_EVENT = 'pentriq:shortcuts';
