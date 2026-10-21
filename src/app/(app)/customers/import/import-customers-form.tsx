'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { Icon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { analyzeCsv, importCustomers, type AnalyzeImportResult, type ImportCustomersResult } from './actions';
import { CSV_IMPORT_FIELDS } from '@/lib/csv-import-mapping';
import { CONSENT_FIELD, CONSENT_LABEL } from '@/lib/consent';

const resultTones: Record<string, string> = {
  created: 'text-brand-700 dark:text-brand-300',
  updated: 'text-sky-700 dark:text-sky-300',
  existing: 'text-ink-3',
  skipped_duplicate: 'text-amber-700 dark:text-amber-300',
  conflict: 'text-red-700 dark:text-red-300',
  error: 'text-red-700 dark:text-red-300',
};

const resultLabels: Record<string, string> = {
  created: 'Added',
  updated: 'Updated',
  existing: 'Already a customer',
  skipped_duplicate: 'Skipped (already recorded)',
  conflict: 'Needs review',
  error: 'Error',
};

/** Rows worth listing: everything except plain creates and plain updates, which the counts already cover. */
const isNotable = (r: ImportCustomersResultRow) => r.status === 'conflict' || r.status === 'error' || r.status === 'skipped_duplicate' || (r.status === 'updated' && Boolean(r.note));
type ImportCustomersResultRow = NonNullable<ImportCustomersResult['summary']>['results'][number];

export function ImportCustomersForm({ windowDays }: { windowDays: number }) {
  const [analysisState, analyzeAction] = useFormState<AnalyzeImportResult, FormData>(analyzeCsv, {});
  const [state, importAction] = useFormState<ImportCustomersResult, FormData>(importCustomers, {});
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div>
      <form action={analyzeAction} className="space-y-5">
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
          <p className="font-medium text-ink-2">Pentriq will detect these fields from your headers and sample values:</p>
          <pre className="mt-2 overflow-x-auto font-mono text-[12px] text-ink-2">{`Name, Email, Date, Service, Phone, Amount`}</pre>
          <p className="mt-2">
            Common exports from Vagaro, Booksy, Fresha, Square and similar systems are supported. Review and adjust the detected mappings before importing. Required fields are <code className="font-mono">Name</code> and <code className="font-mono">Email</code>; the others are optional. Existing customers matched by email receive another visit instead of a duplicate record.{' '}
            <a href="/pentriq-customer-template.csv" download className="font-medium text-brand-700 underline dark:text-brand-300">Download sample CSV</a>
          </p>
        </div>
        {analysisState.error && <Notice variant="error">{analysisState.error}</Notice>}

        {analysisState.mapping && (
          <div className="rounded-xl border border-line bg-surface-subtle p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-ink-2">Review detected mappings</p>
              <span className="text-xs text-ink-3">Local header + sample analysis — no data leaves Pentriq</span>
            </div>
            {analysisState.mapping!.nameParts.firstName !== null && analysisState.mapping!.nameParts.lastName !== null && (
              <div className="mb-3 grid gap-3 rounded-lg border border-brand-500/20 bg-brand-500/5 p-3 sm:grid-cols-2">
                <label className="text-sm text-ink-2">
                  <span className="font-medium text-ink">First name *</span>
                  <select name="mapping_firstName" defaultValue={analysisState.mapping!.nameParts.firstName} className="input mt-1.5">
                    {analysisState.mapping!.headers.map((header, index) => <option key={`first-${index}`} value={index}>{header}</option>)}
                  </select>
                </label>
                <label className="text-sm text-ink-2">
                  <span className="font-medium text-ink">Last name *</span>
                  <select name="mapping_lastName" defaultValue={analysisState.mapping!.nameParts.lastName} className="input mt-1.5">
                    {analysisState.mapping!.headers.map((header, index) => <option key={`last-${index}`} value={index}>{header}</option>)}
                  </select>
                </label>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {CSV_IMPORT_FIELDS.map((field) => {
                const detected = analysisState.mapping!.mappings[field];
                const required = field === 'name' || field === 'email';
                return (
                  <label key={field} className="text-sm text-ink-2">
                    <span className="font-medium capitalize text-ink">{field}{required ? ' *' : ''} <span className={`text-xs font-normal ${detected.confidence === 'low' || detected.confidence === 'none' ? 'text-amber-700 dark:text-amber-300' : 'text-ink-3'}`}>({detected.confidenceScore}%)</span></span>
                    <select name={`mapping_${field}`} defaultValue={detected.columnIndex ?? ''} className="input mt-1.5">
                      {field === 'name' && analysisState.mapping!.nameParts.firstName !== null && <option value="">Use first + last name</option>}
                      {!required && <option value="">Not mapped</option>}
                      {analysisState.mapping!.headers.map((header, index) => (
                        <option key={`${field}-${index}`} value={index}>{header}</option>
                      ))}
                    </select>
                    {detected.columnIndex !== null && detected.confidence !== 'high' && (
                      <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                        We think this matches your {field} field. Please check it is right.
                      </span>
                    )}
                    <span className="mt-1 block truncate text-xs text-ink-3">
                      {detected.samples.length > 0 ? `Sample: ${detected.samples.join(' · ')}` : 'No sample detected'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <label className="flex items-start gap-3 text-sm text-ink-2">
          <input type="checkbox" name="auto_send" defaultChecked className="mt-1 h-4 w-4 rounded border-line-strong" />
          <span>
            <span className="font-medium text-ink">Automatically email review requests {windowDays} {windowDays === 1 ? 'day' : 'days'} after each service</span>
            <span className="block text-[13px] text-ink-3">
              Timing comes from your review request window in Settings → Service timing. Requests are emailed automatically at 8:00am. Untick to hold them on the Customers page and send them yourself.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-ink-2">
          <input type="checkbox" name={CONSENT_FIELD} required className="mt-1 h-4 w-4 rounded border-line-strong" />
          <span>{CONSENT_LABEL}</span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          {!analysisState.mapping ? (
            <SubmitButton pendingText="Analysing CSV…" icon={<Icon name="upload" className="h-4 w-4" />}>
              Analyse CSV
            </SubmitButton>
          ) : (
            <>
              <button type="submit" formAction={analyzeAction} className="btn btn-secondary">Analyse again</button>
              <button type="submit" formAction={importAction} className="btn btn-primary">Confirm and import customers</button>
            </>
          )}
        </div>
      </form>

      {state.error && <Notice variant="error" className="mt-5">{state.error}</Notice>}

      {state.summary && (
        <div className="mt-8 animate-fade-in border-t border-line pt-6">
          <h3 className="text-sm font-semibold text-ink">Import complete</h3>
          {(() => {
            const s = state.summary;
            const skipped = s.conflicts + s.duplicates + s.errors;
            const warnings = (s.warning ? 1 : 0) + s.results.filter((r) => r.status === 'updated' && 'note' in r && r.note).length;
            return (
              <p className="mt-2 text-sm font-medium text-ink">
                Imported: {Math.max(0, s.totalRows - skipped)} · Skipped: {skipped} · Warnings: {warnings}
              </p>
            );
          })()}
          <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
            <li>✅ Customers created: <b>{state.summary.customersCreated}</b></li>
            <li>🔄 Customers updated: <b>{state.summary.customersUpdated}</b> <span className="text-ink-3">(matched on email or phone)</span></li>
            {state.summary.customersUnchanged > 0 && (
              <li>👤 Already customers, nothing to add: <b>{state.summary.customersUnchanged}</b></li>
            )}
            <li>🧾 Service records added: <b>{state.summary.serviceRecordsAdded}</b></li>
            <li>
              {state.summary.conflicts > 0 ? '🛑' : '✔️'} Conflict rows: <b>{state.summary.conflicts}</b>
              {state.summary.conflicts > 0 && <span className="text-ink-3"> (not imported — see below)</span>}
            </li>
            <li>⚠️ Already recorded, skipped: <b>{state.summary.duplicates}</b></li>
            <li>❌ Errors: <b>{state.summary.errors}</b></li>
          </ul>
          {state.summary.conflicts > 0 && (
            <Notice variant="warning" className="mt-4">
              {state.summary.conflicts} row{state.summary.conflicts === 1 ? ' was' : 's were'} not imported because the email address belongs to one
              customer and the phone number to a different one. Nothing was merged. Check those customers, fix the file or merge them yourself, then
              import the listed rows again.
            </Notice>
          )}
          {state.summary.warning && (
            <Notice variant="warning" className="mt-4">
              {state.summary.warning}
            </Notice>
          )}
          {state.summary.queued > 0 && (
            <Notice variant="success" className="mt-4">
              {state.summary.autoSend
                ? `${state.summary.queued} review request${state.summary.queued === 1 ? ' is' : 's are'} scheduled for 8:00am, ${windowDays} ${windowDays === 1 ? 'day' : 'days'} after each service.`
                : `${state.summary.queued} review request${state.summary.queued === 1 ? ' is' : 's are'} held until you send ${state.summary.queued === 1 ? 'it' : 'them'}.`}{' '}
              <a href="/customers" className="font-medium underline">View customers</a>
            </Notice>
          )}
          {state.summary.notQueued > 0 && (
            <p className="mt-3 text-[13px] text-ink-3">
              {state.summary.notQueued} customer{state.summary.notQueued === 1 ? ' was' : 's were'} not queued because their service is older than your review window (Settings) or they were already queued.
            </p>
          )}
          {state.summary.results.some(isNotable) && (
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
                    .filter(isNotable)
                    .map((r) => (
                      <tr key={r.row}>
                        <td className="tabular-nums text-ink-3">{r.row}</td>
                        <td>{r.name || '\u2014'}</td>
                        <td>{r.email || '\u2014'}</td>
                        <td className={`font-medium ${resultTones[r.status]}`}>
                          {resultLabels[r.status]}
                          {'reason' in r ? `: ${r.reason}` : ''}
                          {r.status === 'updated' && r.note ? `: ${r.note}` : ''}
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
