import type { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/business';
import { generateApiKey, getApiKeyInfo } from '@/lib/api-keys';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { CopyButton } from '@/components/ui/copy-button';
import { SettingsTabs } from '@/components/settings-tabs';
import { ApiKeyPanel } from './api-key-panel';
import { ActionButton } from './sync-demo-button';
import { getAppUrl } from '@/lib/brand';
import { Notice } from '@/components/ui/notice';
import { getConnectionWithTokens, getPublicConnection } from '@/lib/google-connection';
import { describeGoogleError, getGoogleConfig, listAllLocations } from '@/lib/google-business';
import { isTokenEncryptionConfigured } from '@/lib/google-token-crypto';
import { getAccessToken } from '@/lib/google-review-sync';
import { GooglePanel, type GooglePanelState } from './google-panel';

export const metadata: Metadata = { title: 'Integrations' };

const ICON = { imported: '✅', updated: '✅', duplicate: '➖', failed: '❌' } as const;

const GOOGLE_ERRORS: Record<string, string> = {
  denied: 'Google access was declined, so nothing was connected.',
  invalid_state: 'The Google sign-in session expired or was invalid. Please try again.',
  not_configured: 'Google sign-in is not configured on this server.',
  encryption_not_configured: 'Secure token storage is not configured on this server (GOOGLE_TOKEN_ENCRYPTION_KEY).',
  no_refresh_token: 'Google did not grant offline access. Remove Pentriq under your Google account permissions and try again.',
  no_accounts: 'No Google Business Profile accounts were found for that Google login.',
  api_access: 'Google rejected the Business Profile API request. The API must be enabled and approved for this Google Cloud project.',
  exchange_failed: 'Could not complete the Google sign-in. Please try again.',
  invalid_client: 'Google rejected the OAuth client ID or secret. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
  code_expired: 'The Google sign-in code expired or was already used. Please try again.',
  redirect_uri_mismatch: 'The redirect URI sent to Google does not match the one registered in Google Cloud Console.',
  redirect_origin_mismatch: 'GOOGLE_REDIRECT_URI / NEXT_PUBLIC_APP_URL points at a different address than the one you are using. Set GOOGLE_REDIRECT_URI to this address plus /api/google-business/callback and register it in Google Cloud Console.',
  scope_missing: 'Business Profile permission was not granted. On the Google consent screen, tick the box to manage your Business Profile, then try again.',
  api_not_enabled: 'A Business Profile API is not enabled for your Google Cloud project. Enable the Business Profile APIs in APIs & Services → Library.',
  api_not_approved: 'Google has not approved this Cloud project for Business Profile API access yet (quota is 0). Submit the Business Profile API access request form and wait for approval.',
  google_error: 'Google reported an error during sign-in. Please try again.',
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams?: { google?: string; reason?: string };
}) {
  const business = await requireBusiness();

  // Google Business Profile: tokens stay on the server; the panel only gets safe fields.
  const googleConnection = await getPublicConnection(business.id);
  let googleState: GooglePanelState =
    !getGoogleConfig() || !isTokenEncryptionConfigured()
      ? 'not_configured'
      : !googleConnection
        ? 'disconnected'
        : googleConnection.status === 'needs_reconnect'
          ? 'needs_reconnect'
          : googleConnection.status === 'pending_location'
            ? 'select'
            : 'active';
  let googleLocations: Awaited<ReturnType<typeof listAllLocations>> = [];
  let googleLocationsError: string | null = null;
  if (googleState === 'select') {
    try {
      const conn = await getConnectionWithTokens(business.id);
      const token = await getAccessToken(createAdminClient(), conn!);
      googleLocations = await listAllLocations(token);
    } catch (err) {
      googleLocationsError = describeGoogleError(err);
      // The token may have been revoked while choosing; re-read the status it set.
      const fresh = await getPublicConnection(business.id);
      if (fresh?.status === 'needs_reconnect') googleState = 'needs_reconnect';
    }
  }
  const googleFlash = searchParams?.google;

  // Every organisation gets a key automatically on first visit (shown once).
  const info = await getApiKeyInfo(business.id);
  const newKey = info ? null : await generateApiKey(business.id);

  const base = getAppUrl();
  const endpoint = `${base}/api/integrations/service-completed`;

  const { data: events } = await createAdminClient()
    .from('integration_events')
    .select('id, status, message, source, created_at')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div>
      <PageHeader
        title="Integrations"
        icon="cog"
        tone="slate"
        description="Connect Google Business Profile, or let Zapier, Make or your CRM tell Pentriq when a service is completed."
        tabs={<SettingsTabs />}
      />
      <div className="space-y-6">
        <SectionCard
          title="Google Business Profile"
          description="Connect with Google to import reviews, track your rating, reply from Pentriq and get alerts."
        >
          {googleFlash === 'error' && (
            <Notice variant="error" className="mb-4">
              {GOOGLE_ERRORS[searchParams?.reason ?? ''] ?? GOOGLE_ERRORS.google_error}
            </Notice>
          )}
          {googleFlash === 'reconnected' && (
            <Notice variant="success" className="mb-4">
              Google account reconnected. Syncing will resume.
            </Notice>
          )}
          <GooglePanel
            state={googleState}
            connection={googleConnection}
            locations={googleLocations}
            locationsError={googleLocationsError}
          />
        </SectionCard>

        <SectionCard title="Endpoint" description="Customers are created or updated by email, and a service visit is recorded.">
          <label className="label">Pentriq endpoint (POST)</label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="input flex-1 select-all overflow-x-auto font-mono text-sm">{endpoint}</code>
            <CopyButton value={endpoint} label="Copy endpoint" />
          </div>
        </SectionCard>

        <SectionCard title="API key" description="Send it in the x-api-key header. Treat it like a password.">
          <ApiKeyPanel initialKey={newKey} prefix={info?.key_prefix ?? null} />
        </SectionCard>

        <SectionCard
          title="Zapier setup"
          description={<>Google Sheets → Zapier → Pentriq. <Link href="/integrations/docs" className="underline">Full guide</Link></>}
        >
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Create a Google Sheet with columns: <code>Name, Email, Phone, AmountSpent, ServiceDate</code>.</li>
            <li>In Zapier, create a Zap: trigger <b>Google Sheets → New Spreadsheet Row</b>.</li>
            <li>Add action <b>Webhooks by Zapier → POST</b>. URL: the endpoint above. Payload Type: <b>Json</b>.</li>
            <li>Map the data: customerName ← Name, email ← Email, phone ← Phone, amountSpent ← AmountSpent, serviceDate ← ServiceDate.</li>
            <li>Under Headers add <code>x-api-key</code> with your API key. Test the Zap, then add a row to your sheet.</li>
          </ol>
        </SectionCard>

        <SectionCard title="Test import" description="Sends a sample customer through the same pipeline as the endpoint, no Zapier needed.">
          <ActionButton label="Test Import" />
        </SectionCard>

        <SectionCard
          title="Recent events"
          description="The last 20 requests received."
          action={<Link href="/settings/integrations" className="btn btn-ghost btn-sm">Refresh</Link>}
        >
          {events && events.length > 0 ? (
            <ul className="divide-y divide-line text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5">
                  <span aria-label={e.status}>{ICON[e.status]}</span>
                  <span className="min-w-0 flex-1 break-words text-ink">
                    {e.message}
                    {e.source === 'test' && <span className="ml-2 text-xs text-ink-4">(test)</span>}
                  </span>
                  <time className="text-xs text-ink-4" dateTime={e.created_at}>
                    {new Date(e.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No events yet. Click Test Import, or add a row to your Google Sheet.</p>
          )}
        </SectionCard>

      </div>
    </div>
  );
}
