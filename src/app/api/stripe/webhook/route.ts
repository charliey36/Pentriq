import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe';
import { handleStripeEvent } from '@/lib/stripe-sync';

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
  const { error: dupError } = await db.from('stripe_webhook_events').insert({ id: event.id, type: event.type });
  if (dupError) {
    if (dupError.code === '23505') return NextResponse.json({ received: true, duplicate: true });
    console.error('[stripe] could not record event', dupError.message);
    return NextResponse.json({ error: 'Could not record event.' }, { status: 500 });
  }

  try {
    await handleStripeEvent(event);
  } catch (e) {
    console.error(`[stripe] ${event.type} (${event.id}) failed:`, e);
    await db.from('stripe_webhook_events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
