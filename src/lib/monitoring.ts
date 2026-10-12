import * as Sentry from '@sentry/nextjs';

type Ctx = {
  /** Where it happened, e.g. "cron:send-messages" or "stripe:webhook". Becomes the `area` tag. */
  area: string;
  /** Short, non-sensitive identifiers only (ids, event types). Never names, emails or message text. */
  tags?: Record<string, string | null | undefined>;
};

/**
 * Reports an error that the code catches and handles (so Sentry's automatic hooks never see it):
 * failed cron jobs, Stripe errors, database errors that are returned rather than thrown.
 * Accepts Error objects and Supabase/Stripe error-like objects. A no-op when Sentry has no DSN.
 */
export function captureError(error: unknown, { area, tags = {} }: Ctx): void {
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : (error as { message?: string } | null)?.message ?? 'Unknown error');
  Sentry.withScope((scope) => {
    scope.setTag('area', area);
    for (const [k, v] of Object.entries(tags)) if (v) scope.setTag(k, v);
    const code = (error as { code?: string } | null)?.code;
    if (code) scope.setTag('error_code', String(code));
    Sentry.captureException(err);
  });
}

/** Tags the current request's errors with who/what they belong to (ids only; no email, name or IP). */
export function setErrorContext(userId: string, businessId: string): void {
  Sentry.setUser({ id: userId });
  Sentry.setTag('business_id', businessId);
}
