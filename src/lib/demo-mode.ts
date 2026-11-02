/**
 * Demo mode utilities for polished testing experience.
 * 
 * Identifies demo/test accounts and simulates successful email sends
 * without hitting the actual provider, making demos look polished without
 * showing "failed" errors on test data.
 */

/**
 * Detect if an email is a demo/test account: ONLY reserved documentation/test domains
 * (RFC 2606 / 6761, e.g. example.com, anything.test, localhost) and the dedicated demo mailbox.
 *
 * It must never match on substrings of real addresses: an earlier version treated any address
 * containing "demo" or "test" (contest.winner@gmail.com, latest@..., demolition-ltd.co.uk) as a demo
 * and faked a successful send, so real customers silently never received their review request.
 */
const DEMO_DOMAINS = ['example.com', 'example.org', 'example.net', 'example', 'test', 'invalid', 'localhost'];

export function isDemoEmail(email: string | null | undefined): boolean {
  const value = (email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return false;
  if (value === 'demo@pentriq.app') return true;
  const domain = value.slice(at + 1);
  return DEMO_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Detect if a customer is a demo account.
 * Returns true if the customer's email is a demo email.
 */
export function isDemoCustomer(customer: { email: string | null }): boolean {
  return isDemoEmail(customer.email);
}

/**
 * Simulate a successful email send for demo accounts.
 * Returns the same structure as a real send so the UI treats it identically.
 * 
 * This is intentional: when demoing the product, we don't want test data
 * showing "failed" errors. We want the demo to look polished and show
 * successful sends on the customer page.
 */
export async function simulateDemoEmailSend(params: {
  email: string;
  subject?: string;
  messageId: string;
}): Promise<void> {
  console.log(`[Demo Mode] Simulating email send to ${params.email}`);
  if (params.subject) {
    console.log(`[Demo Mode]   Subject: "${params.subject}"`);
  }
  console.log(`[Demo Mode]   Message ID: ${params.messageId}`);
  console.log(`[Demo Mode]   ✅ Demo email "sent" (simulated for polished demo)`);
  
  // Simulate network latency for realism
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Format demo email log message for console output.
 */
export function formatDemoSendLog(email: string): string {
  return `[Demo Mode] Simulated email send (not actually sent to avoid sandbox errors)`;
}
