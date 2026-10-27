'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/submit-button';
import { CONSENT_LABEL } from '@/lib/consent';
import { disconnectBooking, syncBookingNow } from './booking-actions';

export type BookingCard = {
  id: string;
  label: string;
  blurb: string;
  configured: boolean;
  status: 'active' | 'needs_reconnect' | 'disconnected' | null;
  accountLabel: string | null;
  lastSyncedAt: string | null;
  lastMessage: string | null;
  lastStatus: string | null;
};

function ago(iso: string | null) {
  if (!iso) return 'not yet';
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
}

function Card({ card }: { card: BookingCard }) {
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const connected = card.status === 'active';
  const needsReconnect = card.status === 'needs_reconnect';
  const connectHref = `/api/booking/${card.id}/connect?consent=on`;

  return (
    <div className="rounded-xl p-4 ring-1 ring-inset ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-ink">{card.label}</p>
          <p className="text-[13px] text-ink-3">{card.blurb}</p>
        </div>
        {connected && <Badge tone="success" dot>Connected</Badge>}
        {needsReconnect && <Badge tone="warning" dot>Reconnect needed</Badge>}
        {!connected && !needsReconnect && !card.configured && <Badge tone="neutral">Not set up on this server</Badge>}
      </div>

      {connected && (
        <div className="mt-3 space-y-2 text-sm text-ink-2">
          <p>{card.accountLabel ?? card.label} · last synced {ago(card.lastSyncedAt)}</p>
          {card.lastMessage && <p className={card.lastStatus === 'error' ? 'text-red-600 dark:text-red-400' : 'text-ink-3'}>{card.lastMessage}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => setMsg((await syncBookingNow(card.id)).message))}>
              {pending && <Spinner className="h-3.5 w-3.5" />}Sync now
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => setMsg((await disconnectBooking(card.id)).message))}>Disconnect</button>
          </div>
          {msg && <p role="status" className="text-sm text-ink-2">{msg}</p>}
        </div>
      )}

      {!connected && card.configured && (
        <div className="mt-3 space-y-3">
          {needsReconnect && <p className="text-sm text-amber-700 dark:text-amber-300">{card.lastMessage ?? 'Pentriq lost access to your account.'}</p>}
          <label className="flex items-start gap-3 text-[13px] text-ink-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line-strong" />
            <span>{CONSENT_LABEL}</span>
          </label>
          <a href={consent ? connectHref : undefined} aria-disabled={!consent} className={`btn btn-primary btn-sm ${consent ? '' : 'pointer-events-none opacity-50'}`}>
            {needsReconnect ? 'Reconnect' : 'Connect'} {card.label}
          </a>
        </div>
      )}
    </div>
  );
}

export function BookingPanel({ cards }: { cards: BookingCard[] }) {
  return (
    <div className="space-y-3">
      {cards.map((c) => <Card key={c.id} card={c} />)}
    </div>
  );
}
