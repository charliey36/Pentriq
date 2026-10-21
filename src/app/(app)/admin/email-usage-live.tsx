'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usageTone, usageWarnings, type UsageResult, type UsageSummary, type UsageTone } from '@/lib/admin-usage';
import { Notice } from '@/components/ui/notice';

const BAR: Record<UsageTone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  grey: 'bg-line-strong',
};
const TEXT: Record<UsageTone, string> = {
  green: 'text-emerald-700 dark:text-emerald-300',
  amber: 'text-amber-700 dark:text-amber-300',
  red: 'text-red-700 dark:text-red-300',
  grey: 'text-ink-3',
};

function Meter({ title, used, limit, percentage, caption }: { title: string; used: number; limit: number | null; percentage: number | null; caption: string }) {
  const tone = usageTone(percentage);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink-2">{title}</p>
        <p className={`text-xs font-semibold ${TEXT[tone]}`}>{percentage === null ? 'No limit set' : `${percentage}% used`}</p>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
        {used.toLocaleString('en-GB')}
        <span className="text-base font-normal text-ink-3"> / {limit === null ? '\u221E' : limit.toLocaleString('en-GB')}</span>
      </p>
      <div
        role="progressbar"
        aria-label={`${title} email usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage ?? 0}
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-muted ring-1 ring-inset ring-line"
      >
        <div className={`h-full rounded-full transition-all duration-500 ${BAR[tone]}`} style={{ width: `${percentage ?? 0}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{caption}</p>
    </div>
  );
}

/**
 * Live Resend usage. Starts from server-rendered data, re-fetches immediately when the server
 * reports a send (Server-Sent Events) and also every 30s as a safety net (a send handled by a
 * different serverless instance would not reach this stream).
 */
export function EmailUsageLive({ initial, compact = false }: { initial: UsageResult; compact?: boolean }) {
  const [result, setResult] = useState<UsageResult>(initial);
  const [updating, setUpdating] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setUpdating(true);
    try {
      const response = await fetch('/api/admin/email-usage', { cache: 'no-store' });
      if (response.ok || response.status === 502) setResult((await response.json()) as UsageResult);
    } catch {
      /* network blip: keep showing the last good numbers */
    } finally {
      inFlight.current = false;
      setUpdating(false);
    }
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/admin/email-usage/stream');
    source.addEventListener('email-sent', () => void refresh());
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      source.close();
      clearInterval(timer);
    };
  }, [refresh]);

  if (!result.ok) return <Notice variant="error">{result.message}</Notice>;
  const u: UsageSummary = result.usage;
  const warnings = usageWarnings(u);

  return (
    <div aria-live="polite">
      {warnings.map((w) => (
        <Notice key={w.message} variant={w.level === 'critical' ? 'error' : 'warning'} className="mb-4">
          {w.message}
        </Notice>
      ))}
      <div className={`grid gap-6 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <Meter title="Today" used={u.emailsSentToday} limit={u.dailyLimit} percentage={u.dailyPercentage} caption={u.dailyRemaining === null ? 'No daily cap on this plan' : `${u.dailyRemaining.toLocaleString('en-GB')} left today`} />
        <Meter title="This month" used={u.emailsSentThisMonth} limit={u.monthlyLimit} percentage={u.monthlyPercentage} caption={u.monthlyRemaining === null ? 'Monthly limit unknown' : `${u.monthlyRemaining.toLocaleString('en-GB')} left this month`} />
      </div>
      <p className="mt-4 text-xs text-ink-4">
        {u.source === 'resend' ? 'Live from Resend' : "Estimated from Pentriq's send log (Resend's usage API was not available)"} · updated {new Date(u.fetchedAt).toLocaleTimeString('en-GB')}
        {updating ? ' · refreshing…' : ''}
      </p>
    </div>
  );
}
