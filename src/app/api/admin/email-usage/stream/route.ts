import { requireAdminApi } from '@/lib/admin-guard';
import { onEmailSent } from '@/lib/email-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Admin-only Server-Sent Events stream. Emits an `email-sent` event the moment Pentriq gets a
 * success response from Resend, so open admin pages can re-fetch usage without a refresh.
 */
export async function GET(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send('retry: 5000\n\n');
      const off = onEmailSent(() => send(`event: email-sent\ndata: ${Date.now()}\n\n`));
      const heartbeat = setInterval(() => send(': keep-alive\n\n'), 25_000);
      cleanup = () => {
        off();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
