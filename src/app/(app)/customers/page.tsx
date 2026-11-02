import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAccess } from '@/lib/business';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { Icon } from '@/components/ui/icons';
import { AddCustomerPanel } from './add-customer-panel';
import { CustomersTable, type CustomerRow } from './customers-table';
import { parseListState, serializeListState } from '@/lib/customer-list';
import { createAdminClient } from '@/lib/supabase/admin';
import { SavedViewsBar } from '@/components/saved-views-bar';
import { SendHeldButton } from './review-row-actions';
import { fetchAll } from '@/lib/fetch-all';
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
  searchParams?: { add?: string; q?: string; status?: string; sort?: string; dir?: string };
}) {
  const { business, role, userId } = await requireAccess();
  const supabase = createClient();
  // Team-shared saved filters for this list (server-only table). Loaded alongside the customers.
  const savedViewsPromise = createAdminClient()
    .from('saved_views')
    .select('id, name, query, created_by')
    .eq('business_id', business.id)
    .eq('scope', 'customers')
    .order('created_at')
    .limit(20)
    .then((r) => r.data ?? [], () => []);

  // Paged read: a single query is capped at 1000 rows, which used to hide customers beyond that and misreport the total.
  const customers = await fetchAll((from, to) =>
    supabase
      .from('customers')
      .select('id, name, email, created_at, review_requests(status, send_at, sent_at)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );

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
  const rows: CustomerRow[] = customers.map((customer) => {
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
      addedAt: customer.created_at,
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
      addedAt: customer.created_at,
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
  const initialState = parseListState(
    new URLSearchParams(
      Object.entries({ q: searchParams?.q, status: searchParams?.status, sort: searchParams?.sort, dir: searchParams?.dir }).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  );
  const savedViews = await savedViewsPromise;
  const canManageViews = can(role, 'team.manage');

  return (
    <div>
      <PageHeader
        title="Customers"
        icon="users"
        tone="sky"
        description={`${rows.length.toLocaleString('en-GB')} ${
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

      <SavedViewsBar
        scope="customers"
        quick={[
          { name: 'Needs attention', query: 'status=failed' },
          { name: 'On hold', query: 'status=held' },
          { name: 'Never asked', query: 'status=none' },
        ]}
        views={savedViews.map((v) => ({ id: v.id, name: v.name, query: v.query, canDelete: canManageViews || v.created_by === userId }))}
      />

      {/* Keyed on the URL state so following a saved view or deep link re-initialises the table. */}
      <CustomersTable key={serializeListState(initialState)} rows={rows} canExport={can(role, 'data.export')} initialState={initialState} />
    </div>
  );
}
