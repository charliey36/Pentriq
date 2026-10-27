import { SectionCard } from '@/components/ui/section-card';
import { BLOCK_LABELS } from '@/lib/safeguards';
import type { PipelineStats } from '@/lib/pipeline-stats';

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-subtle p-4 ring-1 ring-inset ring-line">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value.toLocaleString('en-GB')}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-4">{hint}</p>}
    </div>
  );
}

/** Requests, reminders and follow-through, plus what the safeguards stopped. */
export function ReviewPipeline({ stats, remindersEnabled }: { stats: PipelineStats; remindersEnabled: boolean }) {
  const blockedTotal = stats.blocked.frequency + stats.blocked.opt_out + stats.blocked.duplicate;
  return (
    <SectionCard
      className="reveal"
      title="Review pipeline"
      description={remindersEnabled ? 'First request, then a reminder after 3 days and a final one after 7 days.' : 'Reminders are turned off in Settings.'}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Requests sent" value={stats.requestsSent} />
        <Tile label="Reminder 1 sent" value={stats.reminder1Sent} hint="after 3 days" />
        <Tile label="Reminder 2 sent" value={stats.reminder2Sent} hint="after 7 days" />
        <Tile label="Reviews completed" value={stats.reviewsCompleted} hint="followed your review link" />
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-medium text-ink">Customer protection</p>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {blockedTotal === 0 ? 'Nothing blocked so far. Opt-outs, duplicates and your frequency limit are checked on every request.' : 'Requests Pentriq did not send, to protect your customers and your reputation.'}
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['frequency', 'opt_out', 'duplicate'] as const).map((reason) => (
            <div key={reason} className="rounded-xl bg-surface-subtle px-4 py-3 ring-1 ring-inset ring-line">
              <dt className="text-xs text-ink-3">{BLOCK_LABELS[reason]}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{stats.blocked[reason]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </SectionCard>
  );
}
