'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/business-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptToken, isTokenEncryptionConfigured } from '@/lib/google-token-crypto';
import { recordAudit } from '@/lib/audit';
import { deliver, newSecret, validateWebhookUrl, WEBHOOK_EVENTS, type EndpointRow } from '@/lib/webhooks';

export type WebhookActionResult = { error?: string; success?: boolean; message?: string; secret?: string };

const db = () => createAdminClient() as never as { from(t: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Creates or updates the business's webhook endpoint. A new endpoint returns its signing secret ONCE. */
export async function saveWebhook(url: string, events: string[]): Promise<WebhookActionResult> {
  const { business, userId, email } = await requireCapability('integrations.manage');
  if (!isTokenEncryptionConfigured()) return { error: 'Secure storage is not configured on this server (GOOGLE_TOKEN_ENCRYPTION_KEY), so webhooks cannot be enabled.' };
  const checked = validateWebhookUrl(String(url ?? ''));
  if (!checked.ok) return { error: checked.error };
  const chosen = (Array.isArray(events) ? events : []).filter((e): e is (typeof WEBHOOK_EVENTS)[number] => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (chosen.length === 0) return { error: 'Choose at least one event to send.' };

  const d = db();
  const { data: existing } = await d.from('webhook_endpoints').select('id').eq('business_id', business.id).maybeSingle();
  let secret: string | undefined;
  if (existing) {
    const { error } = await d.from('webhook_endpoints').update({ url: checked.url, events: chosen, is_active: true, consecutive_failures: 0, disabled_reason: null }).eq('id', existing.id).eq('business_id', business.id);
    if (error) return { error: 'Could not save the webhook. Please try again.' };
  } else {
    secret = newSecret();
    const { error } = await d.from('webhook_endpoints').insert({ business_id: business.id, url: checked.url, events: chosen, secret_encrypted: encryptToken(secret) });
    if (error) return { error: 'Could not save the webhook. Please try again.' };
  }
  await recordAudit({ action: 'webhook.configured', businessId: business.id, actorId: userId, actorEmail: email, metadata: { events: chosen.length } });
  revalidatePath('/settings/integrations');
  return { success: true, secret, message: 'Webhook saved.' };
}

export async function rotateWebhookSecret(): Promise<WebhookActionResult> {
  const { business, userId, email } = await requireCapability('integrations.manage');
  const secret = newSecret();
  const { data, error } = await db().from('webhook_endpoints').update({ secret_encrypted: encryptToken(secret) }).eq('business_id', business.id).select('id');
  if (error || !data?.length) return { error: 'Set up a webhook first.' };
  await recordAudit({ action: 'webhook.secret_rotated', businessId: business.id, actorId: userId, actorEmail: email });
  return { success: true, secret };
}

export async function sendTestWebhook(): Promise<WebhookActionResult> {
  const { business } = await requireCapability('integrations.manage');
  const d = db();
  const { data: endpoint } = await d.from('webhook_endpoints').select('id, business_id, url, secret_encrypted, events, is_active, consecutive_failures').eq('business_id', business.id).maybeSingle();
  if (!endpoint) return { error: 'Set up a webhook first.' };
  const res = await deliver(d, endpoint as EndpointRow, 'webhook.test', { message: 'This is a test event from Pentriq.' });
  revalidatePath('/settings/integrations');
  return res.ok ? { success: true, message: `Delivered (HTTP ${res.status}).` } : { error: `Delivery failed: ${res.error}.` };
}

export async function deleteWebhook(): Promise<WebhookActionResult> {
  const { business, userId, email } = await requireCapability('integrations.manage');
  await db().from('webhook_endpoints').delete().eq('business_id', business.id);
  await recordAudit({ action: 'webhook.deleted', businessId: business.id, actorId: userId, actorEmail: email });
  revalidatePath('/settings/integrations');
  return { success: true };
}
