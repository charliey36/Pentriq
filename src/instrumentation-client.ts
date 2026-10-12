import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry-options';

// Browser runtime. Next.js loads this file before the app hydrates.
Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));

// Lets Sentry tie navigation errors to the route that caused them.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
