import type { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { Icon } from '@/components/ui/icons';
import { AddCustomerPanel } from './add-customer-panel';
import { CustomersTable, type CustomerRow } from './customers-table';
import { SendHeldButton } from './review-row-actions';
import { formatUKDate, formatUKDateTime } from '@/lib/uk-defaults';

export const metadata: Metadata = { title: 'Customers' };

function formatDate(value: string) {
  return formatUKDate(new Date(value));
}

function formatDateTime(value: string) {
  return formatUKDateTime(new Date(value));
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { add?: string };
}) {
  const business = await requireBusiness();
  const supabase = createClient();

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, email, created_at, review_requests(status, send_at, sent_at)')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load customers: ${error.message}`);
  }

  // Latest review request per customer from the import / scheduling pipeline.
  const { data: reviewMessages } = await supabase
    .from('messages')
    .select('id, customer_id, status, send_at, sent_at')
    .eq('business_id', business.id)
    .eq('purpose', 'review_request')
    .in('status', ['queued', 'pending', 'sent', 'failed'])
    .order('created_at', { ascending: false })
    .limit(5000);
  const latestReview = new Map<string, NonNullable<typeof reviewMessages>[number]>();
  (reviewMessages ?? []).forEach((m) => latestReview.has(m.customer_id) || latestReview.set(m.customer_id, m));
  const heldCount = (reviewMessages ?? []).filter((m) => m.status === 'queued').length;

  // Dates are formatted here (server) and passed down as strings: formatting
  // in the client component would differ between server and browser locale
  // and trigger hydration mismatches.
  const rows: CustomerRow[] = (customers ?? []).map((customer) => {
    const request = Array.isArray(customer.review_requests)
      ? customer.review_requests[0]
      : customer.review_requests;

    const review = latestReview.get(customer.id);
    if (review) {
      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        addedLabel: formatDate(customer.created_at),
        status: review.status === 'queued' ? 'held' : review.status,
        requestLabel:
          review.status === 'sent' && review.sent_at
            ? `Sent ${formatDateTime(review.sent_at)}`
            : review.status === 'queued'
              ? 'Waiting for you to send'
              : review.status === 'failed'
                ? 'Failed after retries'
                : `Scheduled ${formatDateTime(review.send_at)}`,
        messageId: review.status === 'queued' || review.status === 'pending' ? review.id : null,
      };
    }

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      addedLabel: formatDate(customer.created_at),
      status: request?.status ?? null,
      requestLabel: request
        ? request.status === 'sent' && request.sent_at
          ? `Sent ${formatDateTime(request.sent_at)}`
          : `Due ${formatDateTime(request.send_at)}`
        : null,
      messageId: null,
    };
  });

  const wantsAdd = searchParams?.add === '1';

  return (
    <div>
      <PageHeader
        title="Customers"
        icon="users"
        tone="sky"
        description={`${rows.length.toLocaleString('en-US')} ${
          rows.length === 1 ? 'customer' : 'customers'
        }. Review requests are sent automatically at 8:00am, ${business.review_request_window_days ?? 1} ${(business.review_request_window_days ?? 1) === 1 ? 'day' : 'days'} after a completed service.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {heldCount > 0 && <SendHeldButton count={heldCount} />}
            <Link href="/customers/import" className="btn btn-secondary">
              <Icon name="upload" className="h-4 w-4" />
              Import CSV
            </Link>
          </div>
        }
      />

      <AddCustomerPanel defaultOpen={wantsAdd || rows.length === 0} autoFocus={wantsAdd} />

      <CustomersTable rows={rows} />
    </div>
  );
}
