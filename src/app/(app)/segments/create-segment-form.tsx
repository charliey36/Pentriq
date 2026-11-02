'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState } from 'react-dom';
import { useActionToast } from '@/components/toast';
import { Notice } from '@/components/ui/notice';
import { SubmitButton } from '@/components/ui/submit-button';
import { Icon } from '@/components/ui/icons';
import {
  MAX_CONDITIONS,
  OPERATOR_LABELS,
  SEGMENT_FIELDS,
  encodeRules,
  validateConditions,
  type SegmentCondition,
  type SegmentField,
  type SegmentOperator,
} from '@/lib/segments';
import { createSegment, type SegmentFormResult } from './actions';

type Row = { key: number; field: SegmentField; operator: SegmentOperator; value: string };

const FIELD_ORDER: SegmentField[] = [
  'rebooking_status',
  'days_since_last_visit',
  'lifetime_value',
  'average_spend',
  'visit_count',
  'days_since_added',
  'tag',
  'email_status',
];

function defaultRow(key: number, field: SegmentField = 'days_since_last_visit'): Row {
  const spec = SEGMENT_FIELDS[field];
  return { key, field, operator: spec.kind === 'number' ? 'gte' : 'eq', value: spec.options?.[0]?.value ?? '' };
}

/**
 * Multi-condition segment builder (conditions are ANDed). "Preview" shows who matches before saving; the
 * server re-validates every rule on save, so a tampered request can't store an unknown field or operator.
 */
export function CreateSegmentForm({ initial, initialName = '' }: { initial?: SegmentCondition[] | null; initialName?: string }) {
  const router = useRouter();
  const [state, formAction] = useFormState<SegmentFormResult, FormData>(createSegment, {});
  useActionToast(state, { title: 'Segment saved', description: 'Matching customers are included automatically.' });
  const formRef = useRef<HTMLFormElement>(null);
  const nextKey = useRef(1);
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<Row[]>(() =>
    initial && initial.length > 0
      ? initial.map((c) => ({ key: nextKey.current++, field: c.field, operator: c.operator, value: String(c.value) }))
      : [defaultRow(nextKey.current++)]
  );

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setName('');
      setRows([defaultRow(nextKey.current++)]);
    }
  }, [state.success]);

  const conditions = useMemo(() => rows.map(({ field, operator, value }) => ({ field, operator, value })), [rows]);
  const check = validateConditions(conditions);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((list) =>
      list.map((r) => {
        if (r.key !== key) return r;
        if (patch.field && patch.field !== r.field) return { ...defaultRow(r.key, patch.field) };
        return { ...r, ...patch };
      })
    );

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="conditions" value={JSON.stringify(conditions)} />
      <div className="max-w-md">
        <label htmlFor="segment-name" className="label">
          Segment name
        </label>
        <input
          id="segment-name"
          name="name"
          type="text"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input mt-1.5"
          placeholder="Lapsed high-value"
        />
      </div>

      <fieldset>
        <legend className="label">Customers who match all of these</legend>
        <ol className="mt-2 space-y-2">
          {rows.map((row, index) => {
            const spec = SEGMENT_FIELDS[row.field];
            return (
              <li key={row.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-subtle/60 p-2">
                <span className="w-10 text-center text-2xs font-semibold uppercase text-ink-4">{index === 0 ? 'Where' : 'And'}</span>
                <label className="sr-only" htmlFor={`field-${row.key}`}>Field</label>
                <select id={`field-${row.key}`} value={row.field} onChange={(e) => update(row.key, { field: e.target.value as SegmentField })} className="input w-auto min-w-[190px] flex-1 py-2">
                  {FIELD_ORDER.map((f) => (
                    <option key={f} value={f}>
                      {SEGMENT_FIELDS[f].label}
                    </option>
                  ))}
                </select>
                {spec.kind === 'number' && (
                  <>
                    <label className="sr-only" htmlFor={`op-${row.key}`}>Comparison</label>
                    <select id={`op-${row.key}`} value={row.operator} onChange={(e) => update(row.key, { operator: e.target.value as SegmentOperator })} className="input w-[76px] py-2">
                      {spec.operators.map((op) => (
                        <option key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <label className="sr-only" htmlFor={`value-${row.key}`}>Value</label>
                {spec.kind === 'enum' ? (
                  <select id={`value-${row.key}`} value={row.value} onChange={(e) => update(row.key, { value: e.target.value })} className="input w-auto min-w-[160px] flex-1 py-2">
                    {spec.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="relative w-[140px]">
                    {spec.unit === 'gbp' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-4">£</span>}
                    <input
                      id={`value-${row.key}`}
                      type={spec.kind === 'number' ? 'number' : 'text'}
                      inputMode={spec.kind === 'number' ? 'decimal' : undefined}
                      min={0}
                      value={row.value}
                      onChange={(e) => update(row.key, { value: e.target.value })}
                      placeholder={spec.placeholder}
                      className={`input py-2 ${spec.unit === 'gbp' ? 'pl-7' : ''}`}
                    />
                  </div>
                )}
                {spec.unit === 'days' && <span className="text-xs text-ink-4">days</span>}
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))} className="btn btn-ghost btn-icon ml-auto h-8 w-8" aria-label="Remove condition">
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {rows.length < MAX_CONDITIONS && (
          <button type="button" onClick={() => setRows((list) => [...list, defaultRow(nextKey.current++, 'lifetime_value')])} className="btn btn-ghost btn-sm mt-2">
            <Icon name="plus" className="h-3.5 w-3.5" />
            Add condition
          </button>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!check.ok}
          onClick={() => check.ok && router.push(`/segments?rules=${encodeURIComponent(encodeRules(check.conditions))}${name ? `&name=${encodeURIComponent(name)}` : ''}`)}
          className="btn btn-secondary"
        >
          <Icon name="eye" className="h-4 w-4" />
          Preview matches
        </button>
        <SubmitButton pendingText="Saving…">Save segment</SubmitButton>
        {!check.ok && rows.some((r) => r.value) && <span className="text-xs text-ink-3">{check.error}</span>}
      </div>

      {state.error && <Notice variant="error">{state.error}</Notice>}
    </form>
  );
}
