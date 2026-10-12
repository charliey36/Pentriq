'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { importCustomers, type ImportCustomersResult } from './actions';
import { CONSENT_FIELD, CONSENT_LABEL } from '@/lib/consent';

const resultTones: Record<string, string> = {
  created: 'text-brand-700 dark:text-brand-300',
  skipped_duplicate: 'text-amber-700 dark:text-amber-300',
  error: 'text-red-700 dark:text-red-300',
};

const resultLabels: Record<string, string> = {
  created: 'Added',
  skipped_duplicate: 'Skipped (duplicate)',
  error: 'Error',
};

export function ImportCustomersForm() {
  const [state, formAction] = useFormState<ImportCustomersResult, FormData>(
    importCustomers,
    {}
  );
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div>
      <form action={formAction} className="space-y-5">
        {/* The real file input is stretched invisibly over the drop zone, so
            clicking, keyboard focus and native drag-and-drop all just work. */}
        <div className="relative">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface-subtle px-6 py-10 text-center transition-colors duration-150 [&:has(input:hover)]:border-brand-500 [&:has(input:hover)]:bg-brand-50/50 [&:has(input:focus-visible)]:border-brand-500 [&:has(input:focus-visible)]:ring-[3px] [&:has(input:focus-visible)]:ring-brand-500/20 dark:[&:has(input:hover)]:bg-brand-500/5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-ink-3 shadow-xs ring-1 ring-inset ring-line">
              <Icon name="upload" className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <label htmlFor="file" className="mt-4 text-sm font-semibold text-ink">
              {fileName ?? 'Choose a CSV file'}
            </label>
            <p className="mt-1 text-[13px] text-ink-3">
              {fileName ? 'Click to choose a different file' : 'or drag and drop it here \u2014 up to 2 MB and 2,000 rows'}
            </p>
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
        </div>

        <div className="rounded-xl bg-surface-subtle p-4 text-[13px] leading-6 text-ink-3 ring-1 ring-inset ring-line">
          <p className="font-medium text-ink-2">Your file needs these columns in the first row:</p>
          <pre className="mt-2 overflow-x-auto font-mono text-[12px] text-ink-2">{`name,email,service,date
John Smith,john@gmail.com,Boiler Repair,2026-10-08
Jane Smith,jane@gmail.com,Leak Repair,2026-10-08`}</pre>
          <p className="mt-2">
            Dates can be 2026-10-08 or 08/10/2026. Optional columns: <code className="font-mono">phone</code>,{' '}
            <code className="font-mono">amount</code>. Rows with the same email, service and date are skipped, so it is safe to upload a file twice.{' '}
            <a href="/pentriq-customer-template.csv" download className="font-medium text-brand-700 underline dark:text-brand-300">
              Download sample CSV
            </a>
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm text-ink-2">
          <input type="checkbox" name="auto_send" defaultChecked className="mt-1 h-4 w-4 rounded border-line-strong" />
          <span>
            <span className="font-medium text-ink">Email review requests automatically the day after each service</span>
            <span className="block text-[13px] text-ink-3">
              Sent between 9am and 12pm, only for jobs within your review window. Untick to hold them on the Customers page until you press Send.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-ink-2">
          <input type="checkbox" name={CONSENT_FIELD} required className="mt-1 h-4 w-4 rounded border-line-strong" />
          <span>{CONSENT_LABEL}</span>
        </label>

        <SubmitButton pendingText="Importing… this can take a few seconds" icon={<Icon name="upload" className="h-4 w-4" />}>
          Import customers
        </SubmitButton>
      </form>

      {state.error && <Notice variant="error" className="mt-5">{state.error}</Notice>}

      {state.summary && (
        <div className="mt-8 animate-fade-in border-t border-line pt-6">
          <h3 className="text-sm font-semibold text-ink">Import complete</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
            <li>✅ Imported: <b>{state.summary.created}</b> service{state.summary.created === 1 ? '' : 's'} ({state.summary.newCustomers} new customer{state.summary.newCustomers === 1 ? '' : 's'})</li>
            <li>⚠️ Skipped duplicates: <b>{state.summary.duplicates}</b></li>
            <li>❌ Errors: <b>{state.summary.errors}</b></li>
          </ul>
          {state.summary.warning && (
            <Notice variant="warning" className="mt-4">
              {state.summary.warning}
            </Notice>
          )}
          {state.summary.queued > 0 && (
            <Notice variant="success" className="mt-4">
              {state.summary.autoSend
                ? `${state.summary.queued} review request${state.summary.queued === 1 ? ' is' : 's are'} scheduled (day after service, 9am-12pm).`
                : `${state.summary.queued} review request${state.summary.queued === 1 ? ' is' : 's are'} held until you send ${state.summary.queued === 1 ? 'it' : 'them'}.`}{' '}
              <a href="/customers" className="font-medium underline">View customers</a>
            </Notice>
          )}
          {state.summary.notQueued > 0 && (
            <p className="mt-3 text-[13px] text-ink-3">
              {state.summary.notQueued} customer{state.summary.notQueued === 1 ? ' was' : 's were'} not queued because their service is older than your review window (Settings) or they were already queued.
            </p>
          )}
          {state.summary.results.some((r) => r.status !== 'created') && (
            <div className="scroll-thin mt-5 max-h-80 overflow-auto rounded-xl border border-line">
              <table className="data-table">
                <thead className="sticky top-0">
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {state.summary.results
                    .filter((r) => r.status !== 'created')
                    .map((r) => (
                      <tr key={r.row}>
                        <td className="tabular-nums text-ink-3">{r.row}</td>
                        <td>{r.name || '\u2014'}</td>
                        <td>{r.email || '\u2014'}</td>
                        <td className={`font-medium ${resultTones[r.status]}`}>
                          {resultLabels[r.status]}
                          {r.status === 'error' && 'reason' in r ? `: ${r.reason}` : ''}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
