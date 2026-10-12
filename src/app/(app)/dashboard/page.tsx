import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getAuthUser, isAdminEmail, requireBusiness } from '@/lib/business';
import { getBillingState } from '@/lib/billing';
import { SETUP_COLLAPSED_COOKIE } from '@/lib/brand';
import { createClient } from '@/lib/supabase/server';
import { bucketDaily, splitPeriods } from '@/lib/trends';
import {
  REVIEW_PURPOSES,
  computeClickThroughRate,
  countCountedClicks,
  countReviewsReceived,
  countUniqueClicked,
  deliveredFromSent,
  getClickTimestamps,
} from '@/lib/click-analytics';
import { StatCard, type StatTrend } from '@/components/ui/stat-card';
import { SectionCard } from '@/components/ui/section-card';
import { Badge, requestStatusTone } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon, type IconName } from '@/components/ui/icons';
import { CountUp } from '@/components/ui/count-up';
import { ProgressRing } from '@/components/ui/progress-ring';
import { ActivityChart, type ChartSeries } from '@/components/ui/activity-chart';
import { toneStyle, type Tone } from '@/components/ui/tones';
import { SetupChecklist, type SetupStep } from '@/components/setup-checklist';

export const metadata: Metadata = { title: 'Dashboard' };

const WINDOW_DAYS = 14;
// Supabase caps responses at 1000 rows. If a window hits the cap the counts
// would be understated, so trend/delta is hidden rather than shown wrong.
const ROW_CAP = 1000;
const DAY_MS = 86_400_000;

function buildTrend(timestamps: Array<string | null> | undefined): StatTrend | null {
  if (!timestamps || timestamps.length >= ROW_CAP) return null;
  const series = bucketDaily(timestamps, WINDOW_DAYS);
  return { ...splitPeriods(series), series };
}

/**
 * Copy shown on a KPI card when there's no change to report: onboarding
 * guidance for a brand-new metric, or an honest "quiet" note when there's
 * history but nothing recent. Nothing when the trend couldn't be computed.
 */
function quietHint(total: number, firstUse: string, quiet: string, trend: StatTrend | null) {
  if (total === 0) return firstUse;
  return trend ? quiet : undefined;
}

type Insight = { icon: IconName; text: string; href: string };

const quickActions: { href: string; label: string; description: string; icon: IconName; tone: Tone }[] = [
  { href: '/customers?add=1', label: 'Add a customer', description: 'Schedules a review request', icon: 'plus', tone: 'emerald' },
  { href: '/customers/import', label: 'Import from CSV', description: 'Bring your existing list', icon: 'upload', tone: 'sky' },
  { href: '/segments', label: 'Build a segment', description: 'Target lapsed or VIP customers', icon: 'funnel', tone: 'violet' },
  { href: '/referrals', label: 'Create a referral code', description: 'Reward customers who refer', icon: 'gift', tone: 'amber' },
  { href: '/feedback-inbox', label: 'Review private feedback', description: 'Reply to what customers shared', icon: 'chat', tone: 'rose' },
];

export default async function DashboardPage() {
  const business = await requireBusiness();
  const supabase = createClient();

  const isAdmin = isAdminEmail((await getAuthUser())?.email);

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));
  const sinceIso = since.toISOString();

  const [
    customersCount,
    emailsSentCount,
    clicksCount,
    pendingCount,
    failedCount,
    newFeedbackCount,
    recentCustomers,
    newCustomerRows,
    sentRows,
    clickTimestamps,
    uniqueClicked,
    reviewsReceived,
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id),
    supabase
      .from('review_requests')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('status', 'sent'),
    countCountedClicks(supabase, business.id),
    supabase
      .from('review_requests')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('status', 'pending'),
    supabase
      .from('review_requests')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('status', 'failed'),
    supabase
      .from('private_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('status', 'new'),
    supabase
      .from('customers')
      .select('id, name, email, created_at, review_requests(status, send_at, sent_at)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('customers')
      .select('created_at')
      .eq('business_id', business.id)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(ROW_CAP),
    supabase
      .from('review_requests')
      .select('sent_at')
      .eq('business_id', business.id)
      .eq('status', 'sent')
      .gte('sent_at', sinceIso)
      .order('sent_at', { ascending: false })
      .limit(ROW_CAP),
    getClickTimestamps(supabase, business.id, sinceIso, ROW_CAP),
    countUniqueClicked(supabase, business.id),
    countReviewsReceived(supabase, business.id),
  ]);

  const hasReviewUrl = Boolean(business.google_review_url);
  const setupCollapsed = cookies().get(SETUP_COLLAPSED_COOKIE)?.value === '1';

  const customerTotal = customersCount.count ?? 0;
  // Setup is recommended, never required: a brand-new business lands on the dashboard (and sees
  // the setup guide below) instead of being sent to a form, so it can import customers, set up
  // its review link or just look around first.
  // Requests sent from the Review queue / import pipeline live in `messages`.
  const [queueSent, queuePending] = await Promise.all(
    (['sent', 'pending'] as const).map((status) =>
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .in('purpose', [...REVIEW_PURPOSES])
        .eq('status', status)
    )
  );
  const sent = (emailsSentCount.count ?? 0) + (queueSent.count ?? 0);
  const clicks = clicksCount;
  const delivered = deliveredFromSent(sent);
  const pending = (pendingCount.count ?? 0) + (queuePending.count ?? 0);
  const failed = failedCount.count ?? 0;
  const newFeedback = newFeedbackCount.count ?? 0;

  // Click-through rate = counted clicks / delivered emails * 100. Clicks are
  // review-link clicks recorded by /r/{token} (bots and scanners excluded),
  // not confirmed Google reviews - Pentriq cannot read those back from Google.
  const clickRate = computeClickThroughRate(clicks, delivered);

  const customersTrend = buildTrend(newCustomerRows.data?.map((row) => row.created_at));
  const sentTrend = buildTrend(sentRows.data?.map((row) => row.sent_at));
  const clicksTrend = buildTrend(clickTimestamps);

  const hasProfile = Boolean(business.name) && business.name !== 'My Business';
  const trialStarted = getBillingState(business).status !== 'trial_available';
  // Recommended next steps, in the order most businesses want to do them. None is required.
  const setupSteps: SetupStep[] = [
    {
      done: trialStarted,
      title: 'Start free trial',
      description: 'Your 14-day trial begins when you start it. No card needed.',
      href: '/settings/billing',
      cta: 'Start trial',
    },
    {
      done: hasReviewUrl && hasProfile,
      title: 'Add Google review link',
      description: 'Add your business name and review link so requests send customers to your Google reviews. Review requests are held until this is done.',
      href: '/settings',
      cta: 'Open settings',
    },
    {
      done: customerTotal > 0,
      title: 'Import customers',
      description: 'Upload a CSV of your existing customers, or add them one by one.',
      href: '/customers/import',
      cta: 'Import customers',
    },
    {
      done: sent > 0,
      title: 'Send first review request',
      description: customerTotal === 0 ? 'Add a customer and send them a request in one quick form.' : 'Pick a customer and send their first request, or let Pentriq send them automatically.',
      href: customerTotal === 0 ? '/onboarding' : '/customers',
      cta: customerTotal === 0 ? 'Send first request' : 'Choose a customer',
    },
  ];
  // Persist completion so the onboarding card can be hidden for good.
  const onboardingDone = setupSteps.every((step) => step.done);
  if (onboardingDone && !business.onboarding_completed_at) {
    await supabase.from('businesses').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', business.id);
  }

  // Plain-language highlights derived from the numbers above (rule-based, in
  // priority order): things needing attention first, then momentum.
  const insights: Insight[] = [];
  if (newFeedback > 0) {
    insights.push({
      icon: 'chat',
      text: `${newFeedback} new private feedback ${newFeedback === 1 ? 'message needs' : 'messages need'} a reply`,
      href: '/feedback-inbox',
    });
  }
  if (failed > 0) {
    insights.push({
      icon: 'warning',
      text: `${failed} review request${failed === 1 ? '' : 's'} failed after retries`,
      href: '/customers',
    });
  }
  if (clicksTrend && clicksTrend.previous > 0 && clicksTrend.current !== clicksTrend.previous) {
    const pct = Math.round(((clicksTrend.current - clicksTrend.previous) / clicksTrend.previous) * 100);
    insights.push({
      icon: pct > 0 ? 'arrowUp' : 'arrowDown',
      text: `Link clicks ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% vs the previous 7 days`,
      href: '/analytics',
    });
  } else if (sentTrend && sentTrend.current > 0) {
    insights.push({
      icon: 'mail',
      text: `${sentTrend.current} review request${sentTrend.current === 1 ? '' : 's'} sent in the last 7 days`,
      href: '/customers',
    });
  }
  if (pending > 0) {
    insights.push({
      icon: 'clock',
      text: `${pending} request${pending === 1 ? ' is' : 's are'} scheduled to send soon`,
      href: '/customers',
    });
  }
  if (customersTrend && customersTrend.current > 0) {
    insights.push({
      icon: 'users',
      text: `${customersTrend.current} new customer${customersTrend.current === 1 ? '' : 's'} in the last 7 days`,
      href: '/customers',
    });
  }
  const highlights = insights.slice(0, 3);

  // Chart: 14 daily buckets, labelled in UTC to match how they are bucketed.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const chartLabels = Array.from({ length: WINDOW_DAYS }, (_, index) =>
    new Date(today.getTime() - (WINDOW_DAYS - 1 - index) * DAY_MS).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
  );
  const chartSeries: ChartSeries[] = [];
  if (sentTrend) chartSeries.push({ key: 'sent', label: 'Requests sent', tone: 'emerald', data: sentTrend.series });
  if (clicksTrend) chartSeries.push({ key: 'clicks', label: 'Link clicks', tone: 'violet', data: clicksTrend.series });
  const sumOf = (data: number[]) => data.reduce((total, value) => total + value, 0);
  const hasChartData = chartSeries.some((item) => sumOf(item.data) > 0);

  const businessLabel = business.name?.trim() || 'your business';
  const summary =
    sent > 0
      ? `${sent.toLocaleString('en-US')} review requests sent \u00b7 ${clickRate}% clicked through to your review page.`
      : 'Add your first customer and Pentriq takes it from there \u2014 requests, reminders and tracking.';

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section
        className="reveal relative isolate overflow-hidden rounded-3xl shadow-hero"
        style={{
          '--i': 0,
          backgroundImage: 'linear-gradient(135deg, #064e3b 0%, #065f46 28%, #0f766e 66%, #0e7490 100%)',
        } as React.CSSProperties}
      >
        <div aria-hidden="true" className="absolute -right-24 -top-28 -z-10 h-96 w-96 animate-float-slow rounded-full bg-emerald-300/30 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-36 left-1/4 -z-10 h-80 w-80 animate-float-slower rounded-full bg-cyan-300/25 blur-3xl" />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.14] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_right,black_5%,transparent_72%)]"
        />

        <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow text-emerald-100/75">Overview</p>
            <h1 className="mt-3 text-balance text-[30px] font-semibold leading-[1.12] tracking-[-0.035em] text-white sm:text-[38px]">
              Welcome back, {businessLabel}
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-[15px] leading-6 text-emerald-50/80">{summary}</p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/customers?add=1"
                className="inline-flex items-center gap-2 rounded-[10px] bg-white px-4 py-2.5 text-sm font-semibold text-brand-800 shadow-[0_12px_24px_-10px_rgb(0_0_0/0.5)] transition duration-200 hover:-translate-y-px hover:bg-brand-50 hover:shadow-[0_16px_30px_-10px_rgb(0_0_0/0.55)]"
              >
                <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} />
                Add customer
              </Link>
              <Link
                href="/customers/import"
                className="inline-flex items-center gap-2 rounded-[10px] border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur transition duration-200 hover:-translate-y-px hover:bg-white/20"
              >
                <Icon name="upload" className="h-4 w-4" />
                Import CSV
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/10 p-2 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.15)] backdrop-blur-md">
            <p className="eyebrow px-3 pb-1.5 pt-2.5 text-emerald-100/70">Highlights</p>
            {highlights.length > 0 ? (
              <ul>
                {highlights.map((item) => (
                  <li key={item.text}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-white/10"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                        <Icon name={item.icon} className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <span className="flex-1 text-[13px] font-medium leading-5 text-white/95">{item.text}</span>
                      <Icon
                        name="chevronRight"
                        className="h-4 w-4 text-white/50 transition duration-200 group-hover:translate-x-0.5 group-hover:text-white"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-3 px-3 pb-3 pt-1.5 text-[13px] font-medium text-white/85">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                  <Icon name="check" className="h-4 w-4" strokeWidth={2.2} />
                </span>
                All quiet &mdash; nothing needs your attention.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="reveal" style={{ '--i': 1 } as React.CSSProperties}>
        {!business.onboarding_completed_at && (
          <>
            {customerTotal === 0 && sent === 0 && !setupCollapsed && (
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-ink">Welcome to Pentriq</h2>
                <p className="text-sm text-ink-3">Here&apos;s what we recommend, in any order. Look around first if you like.</p>
              </div>
            )}
            <SetupChecklist steps={setupSteps} initiallyCollapsed={setupCollapsed} />
          </>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          className="reveal"
          style={{ '--i': 2 } as React.CSSProperties}
          label="Customers"
          tone="emerald"
          value={<CountUp value={customerTotal} />}
          icon="users"
          trend={customersTrend}
          sparkId="customers"
          href="/customers"
          hint={quietHint(customerTotal, 'Add your first customer to get started', 'No new customers in 14 days', customersTrend)}
        />
        <StatCard
          className="reveal"
          style={{ '--i': 3 } as React.CSSProperties}
          label="Review requests sent"
          tone="sky"
          value={<CountUp value={sent} />}
          icon="mail"
          trend={sentTrend}
          sparkId="sent"
          hint={quietHint(sent, 'Requests send automatically after a delay', 'No requests sent in 14 days', sentTrend)}
        />
        <StatCard
          className="reveal"
          style={{ '--i': 4 } as React.CSSProperties}
          label="Review link clicks"
          tone="violet"
          value={<CountUp value={clicks} />}
          icon="cursor"
          trend={clicksTrend}
          sparkId="clicks"
          hint={quietHint(clicks, 'Clicks appear once customers respond', 'No clicks in 14 days', clicksTrend)}
        />
        <StatCard
          className="reveal"
          style={{ '--i': 5 } as React.CSSProperties}
          label="Click-through rate"
          tone="amber"
          value={clickRate === null ? '\u2014' : <CountUp value={clickRate} decimals={1} suffix="%" />}
          icon="chart"
          hint={
            sent > 0
              ? `${clicks.toLocaleString('en-US')} clicks from ${delivered.toLocaleString('en-US')} delivered emails`
              : 'Needs at least one sent request'
          }
        />
      </div>

      {/* Activity + funnel */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard
          className="reveal lg:col-span-2"
          title="Activity"
          description="Daily review requests and link clicks over the last 14 days."
          action={
            chartSeries.length > 0 && (
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-ink-3">
                {chartSeries.map((item) => (
                  <span key={item.key} className="flex items-center gap-1.5" style={toneStyle(item.tone)}>
                    <span className="h-2 w-2 rounded-full bg-[rgb(var(--tone))]" />
                    {item.label}
                    <span className="font-semibold tabular-nums text-ink">{sumOf(item.data)}</span>
                  </span>
                ))}
              </div>
            )
          }
        >
          {hasChartData ? (
            <ActivityChart labels={chartLabels} series={chartSeries} />
          ) : (
            <EmptyState
              icon="chart"
              title="Your activity will show up here"
              description="As review requests go out and customers click through, you'll see the daily pattern."
              className="py-10"
            />
          )}
        </SectionCard>

        <SectionCard className="reveal" title="Conversion" description="How requests turn into clicks.">
          {sent === 0 ? (
            <EmptyState
              icon="mail"
              title="No requests sent yet"
              description="Once your first request goes out, you'll see how many customers click through."
              className="py-6"
            />
          ) : (
            <div className="flex flex-col items-center gap-6">
              <ProgressRing percent={Math.min(100, clickRate ?? 0)} id="ctr" size={148} stroke={13}>
                <span className="text-[30px] font-semibold leading-none tracking-[-0.04em] text-ink tabular-nums">
                  {clickRate}%
                </span>
                <span className="mt-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-ink-3">click-through</span>
              </ProgressRing>

              <dl className="w-full space-y-3 text-[13px]">
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-ink-3">
                    <span className="h-2 w-2 rounded-full bg-brand-200 dark:bg-brand-700" />
                    Sent
                  </dt>
                  <dd className="font-semibold tabular-nums text-ink">{sent.toLocaleString('en-US')}</dd>
                </div>
                <div className="flex items-center justify-between" title="Accepted by the email provider. Bounce tracking isn't connected yet, so this equals Sent.">
                  <dt className="flex items-center gap-2 text-ink-3">
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                    Delivered
                  </dt>
                  <dd className="font-semibold tabular-nums text-ink">{delivered.toLocaleString('en-US')}</dd>
                </div>
                <div className="flex items-center justify-between" title="Open tracking isn't supported.">
                  <dt className="flex items-center gap-2 text-ink-3">
                    <span className="h-2 w-2 rounded-full bg-ink-4" />
                    Opened
                  </dt>
                  <dd className="text-ink-4">Not tracked</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-ink-3">
                    <span className="h-2 w-2 rounded-full bg-brand-500" />
                    Clicked
                  </dt>
                  <dd className="font-semibold tabular-nums text-ink">
                    {clicks.toLocaleString('en-US')}
                    {uniqueClicked > 0 && uniqueClicked !== clicks && (
                      <span className="ml-1.5 text-xs font-normal text-ink-4">({uniqueClicked.toLocaleString('en-US')} unique)</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between" title="Reviews confirmed in Pentriq. Google reviews can't be read back automatically.">
                  <dt className="flex items-center gap-2 text-ink-3">
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    Reviews received
                  </dt>
                  <dd className="font-semibold tabular-nums text-ink">{reviewsReceived.toLocaleString('en-US')}</dd>
                </div>
                {(pending > 0 || failed > 0) && (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    {pending > 0 && (
                      <Badge tone="warning" dot>
                        {pending} pending
                      </Badge>
                    )}
                    {failed > 0 && (
                      <Badge tone="danger" dot>
                        {failed} failed
                      </Badge>
                    )}
                  </div>
                )}
              </dl>

              <p className="flex items-start gap-2 text-xs leading-5 text-ink-4">
                <Icon name="info" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                Measures clicks on the review link, not confirmed Google reviews.
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Recent customers + quick actions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard
          className="reveal lg:col-span-2"
          title="Recent customers"
          flush
          action={
            <Link
              href="/customers"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300"
            >
              View all
              <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          }
        >
          {recentCustomers.data && recentCustomers.data.length > 0 ? (
            <ul className="divide-y divide-line/70">
              {recentCustomers.data.map((customer) => {
                const request = Array.isArray(customer.review_requests)
                  ? customer.review_requests[0]
                  : customer.review_requests;

                return (
                  <li key={customer.id}>
                    <Link
                      href={`/customers/${customer.id}`}
                      className="group flex items-center gap-3 px-5 py-3.5 transition-colors duration-150 hover:bg-brand-500/[0.06] sm:px-6"
                    >
                      <Avatar name={customer.name} size="lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{customer.name}</span>
                        <span className="block truncate text-[13px] text-ink-3">{customer.email}</span>
                      </span>
                      {request ? (
                        <Badge tone={requestStatusTone(request.status)} dot className="capitalize">
                          {request.status}
                        </Badge>
                      ) : (
                        <Badge>Not scheduled</Badge>
                      )}
                      <Icon
                        name="chevronRight"
                        className="h-4 w-4 flex-shrink-0 text-ink-4 transition duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon="users"
              title="No customers yet"
              description="Add your first customer and a review request is scheduled automatically."
              action={
                <Link href="/customers?add=1" className="btn btn-primary btn-sm">
                  <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2} />
                  Add customer
                </Link>
              }
              className="py-10"
            />
          )}
        </SectionCard>

        <SectionCard className="reveal" title="Quick actions" description="Jump straight into common tasks.">
          <ul className="-mx-2 space-y-1">
            {quickActions.map((action) => (
              <li key={action.href}>
                <Link
                  href={action.href}
                  style={toneStyle(action.tone)}
                  className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-surface-muted/70"
                >
                  <span className="tone-tile flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-transform duration-300 ease-out-expo group-hover:-rotate-6 group-hover:scale-110">
                    <Icon name={action.icon} className="h-[18px] w-[18px]" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{action.label}</span>
                    <span className="block truncate text-xs text-ink-3">{action.description}</span>
                  </span>
                  <Icon
                    name="chevronRight"
                    className="h-4 w-4 flex-shrink-0 text-ink-4 transition duration-200 group-hover:translate-x-0.5 group-hover:text-ink-2"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {isAdmin && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/admin/organisations" className="card block px-5 py-4 text-sm font-medium text-ink hover:bg-surface-muted">
            Manage organisations (admin) →
          </Link>
          <Link href="/admin/changelog" className="card block px-5 py-4 text-sm font-medium text-ink hover:bg-surface-muted">
            Manage changelog (admin) →
          </Link>
        </div>
      )}
    </div>
  );
}
