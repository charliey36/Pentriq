import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { averageRating, isUuid, pickWidgetReviews } from '@/lib/review-widget';
import { APP_NAME } from '@/lib/brand';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customer reviews', robots: { index: false, follow: false } };

const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

/** Public, iframe-able reviews wall. 404s unless the business switched the widget on. */
export default async function ReviewWidgetPage({ params: paramsPromise }: { params: Promise<{ businessId: string }> }) {
  const params = await paramsPromise;
  if (!isUuid(params.businessId)) notFound();
  const db = createAdminClient();
  const { data: business } = await db.from('businesses').select('id, name, widget_enabled').eq('id', params.businessId).maybeSingle();
  if (!business || !business.widget_enabled) notFound();

  const { data } = await db
    .from('google_reviews')
    .select('reviewer_name, rating, comment, review_date')
    .eq('business_id', business.id)
    .order('review_date', { ascending: false })
    .limit(200);
  const all = data ?? [];
  const shown = pickWidgetReviews(all);
  const avg = averageRating(all.map((r) => r.rating));
  if (shown.length === 0) notFound();

  return (
    <main style={{ fontFamily: '-apple-system, Helvetica, Arial, sans-serif', color: '#0f172a', padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <header style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{business.name}</p>
        {avg !== null && (
          <p style={{ margin: '4px 0 0', color: '#b45309' }}>
            <span aria-hidden="true">{stars(avg)}</span> <span style={{ color: '#475569' }}>{avg.toFixed(1)} from {all.length} Google review{all.length === 1 ? '' : 's'}</span>
          </p>
        )}
      </header>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {shown.map((r, i) => (
          <li key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
            <p style={{ margin: 0, color: '#b45309' }} aria-label={`${r.rating} out of 5 stars`}><span aria-hidden="true">{stars(r.rating)}</span></p>
            <p style={{ margin: '6px 0', lineHeight: 1.5 }}>{r.comment}</p>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{r.reviewer_name}</p>
          </li>
        ))}
      </ul>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
        Collected with <a href={SITE_URL} target="_blank" rel="noopener" style={{ color: '#64748b' }}>{APP_NAME}</a>
      </p>
    </main>
  );
}
