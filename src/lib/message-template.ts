/**
 * Personalised review-request copy. A business can customise the subject and
 * opening message of its FIRST review request using {{variables}}; everything
 * else (buttons, private feedback link, unsubscribe footer) stays fixed so the
 * compliance guarantees in lib/compliance.ts can never be edited away.
 *
 * Pure (no I/O): shared by the settings form (live preview + validation), the
 * server action (validation) and the email renderer (substitution).
 */
import { fillTemplate } from '@/lib/email-templates/review-request';

export const TEMPLATE_VARIABLES = [
  { key: 'customerName', label: 'Customer name', sample: 'Sam', fallback: 'there' },
  { key: 'businessName', label: 'Business name', sample: 'Acme Plumbing', fallback: 'us' },
  { key: 'serviceName', label: 'Service name', sample: 'Boiler Repair', fallback: 'recent service' },
  { key: 'staffName', label: 'Staff member / technician', sample: 'Alex', fallback: 'our team' },
  { key: 'appointmentDate', label: 'Appointment date', sample: '14 October 2026', fallback: 'your recent visit' },
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]['key'];
export type TemplateValues = Partial<Record<TemplateVariableKey, string | null | undefined>>;

export const TEMPLATE_LIMITS = { subjectMax: 120, bodyMax: 600 } as const;

export const DEFAULT_SUBJECT = 'How was your visit to {{businessName}}?';
export const DEFAULT_BODY = "Hi {{customerName}}, we'd love to hear about your experience.";

const KNOWN = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));
const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Tokens used in a template that are not supported variables (typos like {{custmerName}}). */
export function unknownVariables(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(TOKEN)) if (!KNOWN.has(m[1])) found.add(m[1]);
  return [...found];
}

/** Stray braces that would show up literally in the email, e.g. "{{customerName" or "{name}". */
function hasBrokenBraces(template: string): boolean {
  return /\{\{[^}]*$/.test(template) || /^[^{]*\}\}/.test(template) || /(^|[^{])\{[^{}]+\}($|[^}])/.test(template);
}

export type TemplateValidation = { ok: true } | { ok: false; errors: string[] };

export function validateTemplate(subject: string, body: string): TemplateValidation {
  const errors: string[] = [];
  if (subject.length > TEMPLATE_LIMITS.subjectMax) errors.push(`Subject must be ${TEMPLATE_LIMITS.subjectMax} characters or fewer.`);
  if (body.length > TEMPLATE_LIMITS.bodyMax) errors.push(`Message must be ${TEMPLATE_LIMITS.bodyMax} characters or fewer.`);
  for (const [label, text] of [['subject', subject], ['message', body]] as const) {
    const unknown = unknownVariables(text);
    if (unknown.length) {
      errors.push(`Unknown variable${unknown.length > 1 ? 's' : ''} in the ${label}: ${unknown.map((u) => `{{${u}}}`).join(', ')}. Use ${TEMPLATE_VARIABLES.map((v) => `{{${v.key}}}`).join(', ')}.`);
    }
    if (hasBrokenBraces(text)) errors.push(`The ${label} has an unfinished {{variable}}. Check the curly brackets.`);
    if (/https?:\/\//i.test(text)) errors.push(`Remove links from the ${label}: the review and private feedback buttons are added automatically.`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Values to substitute: real data where present, otherwise the readable fallback. */
export function resolveValues(values: TemplateValues): Record<TemplateVariableKey, string> {
  return Object.fromEntries(
    TEMPLATE_VARIABLES.map((v) => {
      const raw = (values[v.key] ?? '').toString().replace(/\s+/g, ' ').trim();
      return [v.key, raw || v.fallback];
    })
  ) as Record<TemplateVariableKey, string>;
}

/** Variables the template uses that have no real value, so the fallback will be shown. */
export function missingValues(template: string, values: TemplateValues): TemplateVariableKey[] {
  const used = new Set([...template.matchAll(TOKEN)].map((m) => m[1]));
  return TEMPLATE_VARIABLES.filter((v) => used.has(v.key) && !(values[v.key] ?? '').toString().trim()).map((v) => v.key);
}

export function renderTemplateText(template: string, values: TemplateValues, escape?: (v: string) => string): string {
  return fillTemplate(template, resolveValues(values), escape);
}

export const SAMPLE_VALUES: Record<TemplateVariableKey, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.key, v.sample])
) as Record<TemplateVariableKey, string>;

/** "2026-10-14" -> "14 October 2026"; returns null for anything else. */
export function formatAppointmentDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
