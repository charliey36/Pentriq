import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe';
import { handleStripeEvent } from '@/lib/stripe-sync';
import { captureError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Stripe webhook endpoint. Authenticated by signature verification only
 * (no session, no CRON_SECRET). Events are de-duplicated by event id; if a
 * handler fails the id is released and a 500 is returned so Stripe retries.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  const body = await request.text(); // raw body is required for verification
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const db = createAdminClient();
  // Ids only, so a failing event can be found in Stripe from the Sentry issue.
  const obj = event.data.object as { id?: string; customer?: string | { id: string } | null; subscription?: string | { id: string } | null };
  const idOf = (v: unknown) => (typeof v === 'string' ? v : (v as { id?: string } | null)?.id);
  const stripeTags = {
    stripe_event_type: event.type,
    stripe_event_id: event.id,
    stripe_customer_id: idOf(obj.customer),
    stripe_subscription_id: idOf(obj.subscription) ?? (event.type.startsWith('customer.subscription.') ? obj.id : undefined),
  };
  const { error: dupError } = await db.from('stripe_webhook_events').insert({ id: event.id, type: event.type });
  if (dupError) {
    if (dupError.code === '23505') return NextResponse.json({ received: true, duplicate: true });
    captureError(dupError, { area: 'stripe:webhook:record-event', tags: stripeTags });
    return NextResponse.json({ error: 'Could not record event.' }, { status: 500 });
  }

  try {
    await handleStripeEvent(event);
  } catch (e) {
    captureError(e, { area: 'stripe:webhook', tags: stripeTags });
    await db.from('stripe_webhook_events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
