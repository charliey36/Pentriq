'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/submit-button';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { formatUKDateTime } from '@/lib/uk-defaults';
import type { PublicGoogleConnection } from '@/lib/google-connection';
import type { GoogleLocationOption } from '@/lib/google-business';
import {
  disconnectGoogle,
  selectGoogleLocation,
  startChangeLocation,
  syncGoogleNow,
  updateRatingThreshold,
  type ActionResult,
} from './google-actions';

function GoogleG({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

export type GooglePanelState = 'not_configured' | 'disconnected' | 'select' | 'active' | 'needs_reconnect';

export function GooglePanel({
  state,
  connection,
  locations,
  locationsError,
}: {
  state: GooglePanelState;
  connection: PublicGoogleConnection | null;
  locations: GoogleLocationOption[];
  locationsError: string | null;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState(
    connection?.google_location_id ? locations.find((l) => l.locationId === connection.google_location_id) : undefined
  );
  const [threshold, setThreshold] = useState(String(connection?.rating_alert_threshold ?? 4));

  function run(action: () => Promise<ActionResult>) {
    start(async () => setResult(await action()));
  }

  const connectButton = (label: string) => (
    // A plain anchor on purpose: this navigates away to Google, so it must not be prefetched by next/link.
    <a href="/api/google-business/connect" className="btn btn-primary">
      <GoogleG className="h-4 w-4 rounded-sm bg-white p-px" />
      {label}
    </a>
  );

  if (state === 'not_configured') {
    return (
      <Notice variant="warning">
        Google sign-in isn&apos;t configured on this server yet. An administrator needs to set <code>GOOGLE_CLIENT_ID</code>,{' '}
        <code>GOOGLE_CLIENT_SECRET</code> and <code>GOOGLE_TOKEN_ENCRYPTION_KEY</code>. See the README for setup steps.
      </Notice>
    );
  }

  if (state === 'disconnected') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-2">
          Sign in with Google to import your reviews, track your rating over time, reply from Pentriq and get alerts. No
          review URL needed.
        </p>
        {connectButton('Connect Google Business')}
      </div>
    );
  }

  if (state === 'needs_reconnect') {
    return (
      <div className="space-y-4">
        <Notice variant="error">
          Pentriq no longer has access to your Google Business Profile{connection?.location_name ? ` (${connection.location_name})` : ''}.
          Reconnect to resume syncing.
        </Notice>
        <div className="flex flex-wrap items-center gap-2">
          {connectButton('Reconnect Google')}
          <ConfirmActionButton label="Disconnect" ariaLabel="Disconnect Google Business Profile" onConfirm={() => disconnectGoogle().then(setResult)} />
        </div>
        {result && <Notice variant={result.ok ? 'success' : 'error'}>{result.message}</Notice>}
      </div>
    );
  }

  if (state === 'select') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-2">Choose the business location whose reviews Pentriq should track.</p>
        {locationsError ? (
          <Notice variant="error">Couldn&apos;t load your locations: {locationsError}</Notice>
        ) : locations.length === 0 ? (
          <Notice variant="warning">
            No locations were found on this Google account. Make sure the account manages a verified Business Profile, then reconnect.
          </Notice>
        ) : (
          <fieldset className="space-y-2" disabled={pending}>
            <legend className="sr-only">Google Business locations</legend>
            {locations.map((l) => {
              const checked = selected?.accountId === l.accountId && selected?.locationId === l.locationId;
              return (
                <label
                  key={`${l.accountId}/${l.locationId}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${
                    checked ? 'border-brand-500/60 bg-brand-50/60 dark:bg-brand-500/10' : 'border-line hover:bg-surface-muted/60'
                  }`}
                >
                  <input type="radio" name="location" className="mt-1" checked={checked} onChange={() => setSelected(l)} />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{l.title}</span>
                    <span className="block text-xs text-ink-3">{[l.address, l.accountName].filter(Boolean).join(' · ')}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !selected}
            onClick={() => selected && run(() => selectGoogleLocation(`${selected.accountId}/${selected.locationId}`))}
          >
            {pending ? (
              <>
                <Spinner /> Importing reviews&hellip;
              </>
            ) : (
              'Save location & import reviews'
            )}
          </button>
          <ConfirmActionButton label="Disconnect" ariaLabel="Disconnect Google Business Profile" onConfirm={() => disconnectGoogle().then(setResult)} />
        </div>
        {result && <Notice variant={result.ok ? 'success' : 'error'}>{result.message}</Notice>}
      </div>
    );
  }

  // active
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
            Connected{connection?.location_name ? ` to ${connection.location_name}` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            {connection?.last_sync_at ? `Last synced ${formatUKDateTime(new Date(connection.last_sync_at))}` : 'Not synced yet'} &middot;
            syncs automatically once a day, or use Sync now
          </p>
        </div>
        <Link href="/reviews" className="btn btn-secondary btn-sm">
          View Reviews Analytics
        </Link>
      </div>

      {connection?.last_sync_error && <Notice variant="warning">Last sync problem: {connection.last_sync_error}</Notice>}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateRatingThreshold(Number(threshold)));
        }}
      >
        <div>
          <label htmlFor="rating-threshold" className="label">
            Alert me if my average rating falls below
          </label>
          <input
            id="rating-threshold"
            type="number"
            inputMode="decimal"
            min={1}
            max={5}
            step={0.1}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="input mt-1.5 w-28"
          />
        </div>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
          Save threshold
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(syncGoogleNow)}>
          {pending && <Spinner className="h-3.5 w-3.5" />}
          Sync now
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(startChangeLocation)}>
          Change location
        </button>
        <ConfirmActionButton
          label="Disconnect"
          ariaLabel="Disconnect Google Business Profile"
          onConfirm={() => disconnectGoogle().then(setResult)}
        />
      </div>

      {result && <Notice variant={result.ok ? 'success' : 'error'}>{result.message}</Notice>}
    </div>
  );
}
