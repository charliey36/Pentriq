import { NextResponse, type NextRequest } from 'next/server';
import { requireBusiness } from '@/lib/business';
import { createClient } from '@/lib/supabase/server';
import { buildExport, fetchAllRows, toCsv, CUSTOMER_CSV_COLUMNS, type PageFetcher } from '@/lib/account-export';
import { withinLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Loose = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string): { range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
      };
    };
  };
};

/**
 * GET /api/account/export            → everything, as JSON
 * GET /api/account/export?format=csv → customers only, as a spreadsheet-friendly CSV
 *
 * Uses the signed-in user's own session (not the service role), so row level
 * security guarantees only their business's rows can ever be returned.
 */
export async function GET(request: NextRequest) {
  const business = await requireBusiness(); // redirects to /login when signed out

  if (!(await withinLimit('account-export', business.id, { limit: 5, windowSeconds: 3600 }))) {
    return NextResponse.json({ error: 'Too many exports. Please try again in an hour.' }, { status: 429 });
  }

  const supabase = createClient() as unknown as Loose;
  const fetchPage: PageFetcher = (table, from, to) =>
    supabase.from(table).select('*').eq('business_id', business.id).order('id').range(from, to);

  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { 'Cache-Control': 'no-store' };

  if (request.nextUrl.searchParams.get('format') === 'csv') {
    const { rows, error } = await fetchAllRows(fetchPage, 'customers');
    if (error) return NextResponse.json({ error: 'Could not read your customers.' }, { status: 500 });
    return new NextResponse(toCsv(rows as Record<string, unknown>[], CUSTOMER_CSV_COLUMNS), {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pentriq-customers-${stamp}.csv"`,
      },
    });
  }

  const data = await buildExport(business, fetchPage);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="pentriq-export-${stamp}.json"`,
    },
  });
}
