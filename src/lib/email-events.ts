/**
 * In-process "an email was just sent" signal. Server code calls `notifyEmailSent()` after Resend
 * accepts a message; the admin Server-Sent-Events stream listens and tells open admin pages to
 * refresh their usage figures straight away. The emitter lives on globalThis so hot reloads and
 * separate route bundles share it. On serverless hosting a send may happen in a different
 * instance than the one holding the stream, so the admin UI also polls as a safety net.
 */
type Listener = () => void;

const g = globalThis as unknown as { __pentriqEmailListeners?: Set<Listener> };
const listeners = (g.__pentriqEmailListeners ??= new Set<Listener>());

export function notifyEmailSent(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* a broken listener must never affect sending */
    }
  }
}

export function onEmailSent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
